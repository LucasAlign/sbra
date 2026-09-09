-- Row-level security, increment 4: opportunities & responses (M4).
--
-- Continues the pattern from 0004/0006: cross-table authorization lives in
-- SECURITY DEFINER helpers so a policy predicate never re-enters an
-- RLS-protected table (which would recurse). The helpers read the transaction's
-- actor from collab.person_id via collab_actor().
--
-- Audience model:
--   * An opportunity is visible to its AUTHOR always, and to active members of
--     its owning community once it is published (visibility = 'community').
--   * A response is visible to its own AUTHOR (the responder), to the
--     opportunity's author (the requester), and — only when shared = true — to
--     anyone who can see the opportunity. So responses are private to
--     requester/author unless the responder shares them with that audience.

-- The author of an opportunity, regardless of the reader's own visibility.
CREATE OR REPLACE FUNCTION "collab_opportunity_author"(p_opportunity text) RETURNS text
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT author_id FROM opportunities WHERE id = p_opportunity
$$;--> statement-breakpoint

-- May the current actor see this opportunity at all? Author, or an active member
-- of the owning community once it is published.
CREATE OR REPLACE FUNCTION "collab_can_see_opportunity"(p_opportunity text) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT EXISTS (SELECT 1 FROM opportunities o
      WHERE o.id = p_opportunity
        AND (o.author_id = collab_actor()
          OR (o.visibility = 'community' AND collab_is_active_member(o.community_id))))
$$;--> statement-breakpoint

-- opportunities: authored by an active member of the owning community; readable
-- by the author, or by active members once published; edited only by the author.
ALTER TABLE "opportunities" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "opportunity_select" ON "opportunities" FOR SELECT
  USING ("author_id" = collab_actor()
    OR ("visibility" = 'community' AND collab_is_active_member("community_id")));--> statement-breakpoint
CREATE POLICY "opportunity_insert" ON "opportunities" FOR INSERT
  WITH CHECK ("author_id" = collab_actor() AND collab_is_active_member("community_id"));--> statement-breakpoint
CREATE POLICY "opportunity_update" ON "opportunities" FOR UPDATE
  USING ("author_id" = collab_actor()) WITH CHECK ("author_id" = collab_actor());--> statement-breakpoint

-- opportunity_responses: authored by whoever can see the opportunity; readable by
-- the responder, the requester, or — when shared — the opportunity's audience;
-- edited (including the shared flag) only by the responder.
ALTER TABLE "opportunity_responses" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "response_select" ON "opportunity_responses" FOR SELECT
  USING ("author_id" = collab_actor()
    OR collab_opportunity_author("opportunity_id") = collab_actor()
    OR ("shared" = true AND collab_can_see_opportunity("opportunity_id")));--> statement-breakpoint
CREATE POLICY "response_insert" ON "opportunity_responses" FOR INSERT
  WITH CHECK ("author_id" = collab_actor() AND collab_can_see_opportunity("opportunity_id"));--> statement-breakpoint
CREATE POLICY "response_update" ON "opportunity_responses" FOR UPDATE
  USING ("author_id" = collab_actor()) WITH CHECK ("author_id" = collab_actor());
