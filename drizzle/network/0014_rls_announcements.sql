-- Row-level security, increment 7: announcements, publications & comments (M7).
--
-- Continues the pattern from 0004/0006/0008/0010/0012: cross-table authorization
-- lives in SECURITY DEFINER helpers so a policy predicate never re-enters an
-- RLS-protected table.
--
-- Audience model:
--   * An announcement is one row published to many communities. It is visible to
--     its author and to active members of any community it is published to.
--   * Publishing carries author authority: only the author, and only to a
--     community they ADMINISTER, may add a publication.
--   * Comments inherit the announcement's audience: anyone who can see the
--     announcement can read the comments and add their own.

CREATE OR REPLACE FUNCTION "collab_announcement_author"(p_announcement text) RETURNS text
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT author_id FROM announcements WHERE id = p_announcement
$$;--> statement-breakpoint

-- May the actor see this announcement? Author, or an active member of any
-- community it is published to.
CREATE OR REPLACE FUNCTION "collab_can_see_announcement"(p_announcement text) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT EXISTS (SELECT 1 FROM announcements a WHERE a.id = p_announcement AND a.author_id = collab_actor())
      OR EXISTS (SELECT 1 FROM announcement_publications p
        WHERE p.announcement_id = p_announcement AND collab_is_active_member(p.community_id))
$$;--> statement-breakpoint

-- announcements: visible to author or members of a publishing community; created
-- and edited only by the author (author authority is checked in app logic too).
ALTER TABLE "announcements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "announcement_select" ON "announcements" FOR SELECT
  USING ("author_id" = collab_actor() OR collab_can_see_announcement("id"));--> statement-breakpoint
CREATE POLICY "announcement_insert" ON "announcements" FOR INSERT
  WITH CHECK ("author_id" = collab_actor());--> statement-breakpoint
CREATE POLICY "announcement_update" ON "announcements" FOR UPDATE
  USING ("author_id" = collab_actor()) WITH CHECK ("author_id" = collab_actor());--> statement-breakpoint

-- announcement_publications: visible to members of the community or the author;
-- only the author may publish, and only to a community they ADMINISTER.
ALTER TABLE "announcement_publications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "announcement_publication_select" ON "announcement_publications" FOR SELECT
  USING (collab_is_active_member("community_id") OR collab_announcement_author("announcement_id") = collab_actor());--> statement-breakpoint
CREATE POLICY "announcement_publication_insert" ON "announcement_publications" FOR INSERT
  WITH CHECK (collab_announcement_author("announcement_id") = collab_actor() AND collab_is_community_admin("community_id"));--> statement-breakpoint
CREATE POLICY "announcement_publication_delete" ON "announcement_publications" FOR DELETE
  USING (collab_announcement_author("announcement_id") = collab_actor());--> statement-breakpoint

-- announcement_comments: comments inherit the announcement's audience — anyone who
-- can see the announcement reads all comments; you add and edit only your own.
ALTER TABLE "announcement_comments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "announcement_comment_select" ON "announcement_comments" FOR SELECT
  USING (collab_can_see_announcement("announcement_id"));--> statement-breakpoint
CREATE POLICY "announcement_comment_insert" ON "announcement_comments" FOR INSERT
  WITH CHECK ("author_id" = collab_actor() AND collab_can_see_announcement("announcement_id"));--> statement-breakpoint
CREATE POLICY "announcement_comment_update" ON "announcement_comments" FOR UPDATE
  USING ("author_id" = collab_actor()) WITH CHECK ("author_id" = collab_actor());
