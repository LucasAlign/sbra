-- Row-level security, increment 3: claims, listing overrides, import staging,
-- and the person_identities lockdown.
--
-- Continues the pattern from 0004: cross-table authorization lives in SECURITY
-- DEFINER helpers so a policy predicate never re-enters an RLS-protected table.

-- Is the actor a community_admin of ANY community this organization belongs to?
-- Used to authorize claim review and the grant/affiliation writes it performs.
CREATE OR REPLACE FUNCTION "collab_admins_org_community"(p_org text) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT EXISTS (SELECT 1 FROM organization_community_memberships ocm
      WHERE ocm.organization_id = p_org AND ocm.status = 'active'
        AND collab_is_community_admin(ocm.community_id))
$$;--> statement-breakpoint

-- Import-staging scoping: admin of the batch's / record's community.
CREATE OR REPLACE FUNCTION "collab_admins_batch"(p_batch text) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT EXISTS (SELECT 1 FROM import_batches b
      WHERE b.id = p_batch AND collab_is_community_admin(b.community_id))
$$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION "collab_admins_source"(p_source_record text) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT EXISTS (SELECT 1 FROM source_records r JOIN import_batches b ON b.id = r.batch_id
      WHERE r.id = p_source_record AND collab_is_community_admin(b.community_id))
$$;--> statement-breakpoint

-- Login identity lookup, bypassing RLS: login must resolve an identity BEFORE an
-- actor context exists, so the read cannot satisfy an own-row policy. This
-- returns only the person id for a provider subject; creation still happens via
-- ordinary inserts (allowed by the insert policies below).
CREATE OR REPLACE FUNCTION "collab_lookup_identity"(p_provider text, p_subject text) RETURNS text
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT person_id FROM person_identities WHERE provider = p_provider AND subject = p_subject
$$;--> statement-breakpoint
-- Does a person have a login identity? Used when an admin invites a recipient,
-- a cross-actor read RLS would otherwise hide.
CREATE OR REPLACE FUNCTION "collab_person_has_identity"(p_person text) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT EXISTS (SELECT 1 FROM person_identities WHERE person_id = p_person)
$$;--> statement-breakpoint

-- person_identities: no general SELECT (login uses the definer above); a
-- signed-in actor may read its own rows; inserts allowed for login/linking.
ALTER TABLE "person_identities" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "person_identities_select" ON "person_identities" FOR SELECT
  USING ("person_id" = collab_actor());--> statement-breakpoint
CREATE POLICY "person_identities_insert" ON "person_identities" FOR INSERT
  WITH CHECK (true);--> statement-breakpoint

-- role_grants: broaden INSERT so a community admin can grant Business Admin for an
-- org listed in a community they administer (the claim-approval write). Community
-- and regional grants stay as before.
DROP POLICY "grant_insert" ON "role_grants";--> statement-breakpoint
CREATE POLICY "grant_insert" ON "role_grants" FOR INSERT
  WITH CHECK (
    ("community_id" IS NOT NULL AND collab_is_community_admin("community_id"))
    OR ("organization_id" IS NOT NULL AND collab_admins_org_community("organization_id")));--> statement-breakpoint
-- Allow a community admin to revoke/adjust org-scoped grants they can vouch for.
DROP POLICY "grant_update" ON "role_grants";--> statement-breakpoint
CREATE POLICY "grant_update" ON "role_grants" FOR UPDATE
  USING ("person_id" = collab_actor()
    OR ("community_id" IS NOT NULL AND collab_is_community_admin("community_id"))
    OR ("organization_id" IS NOT NULL AND collab_admins_org_community("organization_id")))
  WITH CHECK ("person_id" = collab_actor()
    OR ("community_id" IS NOT NULL AND collab_is_community_admin("community_id"))
    OR ("organization_id" IS NOT NULL AND collab_admins_org_community("organization_id")));--> statement-breakpoint

-- organization_affiliations: the subject creates their own; a vouching community
-- admin creates the claimant's on approval.
CREATE POLICY "affiliation_insert" ON "organization_affiliations" FOR INSERT
  WITH CHECK ("person_id" = collab_actor() OR collab_admins_org_community("organization_id"));--> statement-breakpoint
CREATE POLICY "affiliation_update" ON "organization_affiliations" FOR UPDATE
  USING ("person_id" = collab_actor() OR collab_admins_org_community("organization_id"))
  WITH CHECK ("person_id" = collab_actor() OR collab_admins_org_community("organization_id"));--> statement-breakpoint

-- claim_requests: your own claims, or any in a community you administer. A member
-- files their own claim (person = actor); the admin decides; the claimant may
-- withdraw.
ALTER TABLE "claim_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "claim_select" ON "claim_requests" FOR SELECT
  USING ("person_id" = collab_actor() OR collab_is_community_admin("community_id"));--> statement-breakpoint
CREATE POLICY "claim_insert" ON "claim_requests" FOR INSERT
  WITH CHECK ("person_id" = collab_actor());--> statement-breakpoint
CREATE POLICY "claim_update" ON "claim_requests" FOR UPDATE
  USING ("person_id" = collab_actor() OR collab_is_community_admin("community_id"))
  WITH CHECK ("person_id" = collab_actor() OR collab_is_community_admin("community_id"));--> statement-breakpoint

-- community_listing_overrides: visible to members of the community; written only
-- by a Business Admin of the organization.
ALTER TABLE "community_listing_overrides" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "listing_select" ON "community_listing_overrides" FOR SELECT
  USING (collab_is_active_member("community_id"));--> statement-breakpoint
CREATE POLICY "listing_insert" ON "community_listing_overrides" FOR INSERT
  WITH CHECK (collab_can_admin_org("organization_id"));--> statement-breakpoint
CREATE POLICY "listing_update" ON "community_listing_overrides" FOR UPDATE
  USING (collab_can_admin_org("organization_id")) WITH CHECK (collab_can_admin_org("organization_id"));--> statement-breakpoint

-- Import staging: entirely private to admins of the owning community. FOR ALL so
-- select/insert/update/delete are all admin-scoped; there is no member-facing
-- projection of staged data.
ALTER TABLE "import_batches" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "import_batch_admin" ON "import_batches" FOR ALL
  USING (collab_is_community_admin("community_id")) WITH CHECK (collab_is_community_admin("community_id"));--> statement-breakpoint
ALTER TABLE "source_records" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "source_record_admin" ON "source_records" FOR ALL
  USING (collab_admins_batch("batch_id")) WITH CHECK (collab_admins_batch("batch_id"));--> statement-breakpoint
ALTER TABLE "external_entity_links" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "external_link_admin" ON "external_entity_links" FOR ALL
  USING (collab_admins_source("source_record_id")) WITH CHECK (collab_admins_source("source_record_id"));--> statement-breakpoint
ALTER TABLE "merge_history" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "merge_history_admin" ON "merge_history" FOR ALL
  USING ("community_id" IS NOT NULL AND collab_is_community_admin("community_id"))
  WITH CHECK ("community_id" IS NOT NULL AND collab_is_community_admin("community_id"));
