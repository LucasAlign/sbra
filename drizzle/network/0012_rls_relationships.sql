-- Row-level security, increment 6: introductions, connections, notes, referrals.
--
-- Continues the pattern from 0004/0006/0008/0010: cross-table authorization lives
-- in SECURITY DEFINER helpers so a policy predicate never re-enters an
-- RLS-protected table. The helpers read the actor from collab.person_id.
--
-- Consent model:
--   * An introduction and its participant rows are visible only to its
--     participants. A participant's contact is written only on acceptance and is
--     projection-gated to accepted co-participants (contact is shared only after
--     acceptance). The effective accepted/declined/pending status is derived from
--     participant consent at read time; only the creator can 'withdraw'.
--   * Connections are visible only to the two people in them; notes only to their
--     owner; referrals (including the financial closed_value) only to the giver
--     and receiver — there is no community-wide projection or ranking.

-- Is the current actor a participant of this introduction?
CREATE OR REPLACE FUNCTION "collab_is_intro_participant"(p_introduction text) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT EXISTS (SELECT 1 FROM introduction_participants p
      WHERE p.introduction_id = p_introduction AND p.person_id = collab_actor())
$$;--> statement-breakpoint

-- Who created this introduction? Used so the creator may add participant rows for
-- the other parties (whose rows are otherwise not their own to insert).
CREATE OR REPLACE FUNCTION "collab_intro_created_by"(p_introduction text) RETURNS text
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT created_by FROM introductions WHERE id = p_introduction
$$;--> statement-breakpoint

-- Is an ARBITRARY person an active member of a community? Naming other people in
-- an introduction or a referral requires checking THEIR membership, which the
-- per-person RLS on person_community_memberships hides from the actor. Bypasses
-- RLS for that one existence read (like collab_person_has_identity in 0006).
CREATE OR REPLACE FUNCTION "collab_person_is_active_member"(p_person text, p_community text) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT EXISTS (SELECT 1 FROM person_community_memberships m JOIN communities c ON c.id = m.community_id
      WHERE m.person_id = p_person AND m.community_id = p_community AND m.status = 'active' AND c.status = 'active')
$$;--> statement-breakpoint

-- introductions: visible to participants; created and withdrawn by the creator.
ALTER TABLE "introductions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "introduction_select" ON "introductions" FOR SELECT
  USING ("created_by" = collab_actor() OR collab_is_intro_participant("id"));--> statement-breakpoint
CREATE POLICY "introduction_insert" ON "introductions" FOR INSERT
  WITH CHECK ("created_by" = collab_actor());--> statement-breakpoint
CREATE POLICY "introduction_update" ON "introductions" FOR UPDATE
  USING ("created_by" = collab_actor()) WITH CHECK ("created_by" = collab_actor());--> statement-breakpoint

-- introduction_participants: a participant sees the whole roster; the creator adds
-- the participant rows; each participant edits only their own (consent/contact).
ALTER TABLE "introduction_participants" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "participant_select" ON "introduction_participants" FOR SELECT
  USING ("person_id" = collab_actor() OR collab_is_intro_participant("introduction_id"));--> statement-breakpoint
CREATE POLICY "participant_insert" ON "introduction_participants" FOR INSERT
  WITH CHECK (collab_intro_created_by("introduction_id") = collab_actor());--> statement-breakpoint
CREATE POLICY "participant_update" ON "introduction_participants" FOR UPDATE
  USING ("person_id" = collab_actor()) WITH CHECK ("person_id" = collab_actor());--> statement-breakpoint

-- connections: visible to, and writable by, the two people in the pair only.
ALTER TABLE "connections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "connection_select" ON "connections" FOR SELECT
  USING ("person_low" = collab_actor() OR "person_high" = collab_actor());--> statement-breakpoint
CREATE POLICY "connection_insert" ON "connections" FOR INSERT
  WITH CHECK ("person_low" = collab_actor() OR "person_high" = collab_actor());--> statement-breakpoint
CREATE POLICY "connection_update" ON "connections" FOR UPDATE
  USING ("person_low" = collab_actor() OR "person_high" = collab_actor())
  WITH CHECK ("person_low" = collab_actor() OR "person_high" = collab_actor());--> statement-breakpoint

-- relationship_notes: private to their owner, full CRUD, and no one else.
ALTER TABLE "relationship_notes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "relationship_note_owner" ON "relationship_notes" FOR ALL
  USING ("owner_id" = collab_actor()) WITH CHECK ("owner_id" = collab_actor());--> statement-breakpoint

-- member_referrals: visible to the giver and receiver only (financial detail
-- included); the giver creates, either party updates the outcome. No community
-- projection.
ALTER TABLE "member_referrals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "referral_select" ON "member_referrals" FOR SELECT
  USING ("from_person_id" = collab_actor() OR "to_person_id" = collab_actor());--> statement-breakpoint
CREATE POLICY "referral_insert" ON "member_referrals" FOR INSERT
  WITH CHECK ("from_person_id" = collab_actor());--> statement-breakpoint
CREATE POLICY "referral_update" ON "member_referrals" FOR UPDATE
  USING ("from_person_id" = collab_actor() OR "to_person_id" = collab_actor())
  WITH CHECK ("from_person_id" = collab_actor() OR "to_person_id" = collab_actor());
