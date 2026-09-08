-- Row-level security, increment 2: the community-relational graph.
--
-- Extends RLS from `people` (0003) to memberships, grants, invitations,
-- affiliations, organization/community links, the audit log, and the catalog.
-- The app already enforces authorization in SQL; these policies are the
-- independent backstop, evaluated only for the non-owner runtime role.
--
-- Cross-table checks ("is the actor an admin of this community?") are done in
-- SECURITY DEFINER helpers so the policy predicate never re-enters an
-- RLS-protected table (which would recurse). The helpers read the transaction's
-- actor from collab.person_id, set by lib/db/context.ts.

-- Current actor (empty string / unset context resolves to NULL → deny).
CREATE OR REPLACE FUNCTION "collab_actor"() RETURNS text
  LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('collab.person_id', true), '') $$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION "collab_is_active_member"(p_community text) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT EXISTS (SELECT 1 FROM person_community_memberships m
      WHERE m.person_id = collab_actor() AND m.community_id = p_community AND m.status = 'active')
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION "collab_is_community_admin"(p_community text) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT EXISTS (SELECT 1 FROM person_community_memberships m
      JOIN role_grants g ON g.person_id = m.person_id AND g.community_id = m.community_id
      WHERE m.person_id = collab_actor() AND m.community_id = p_community AND m.status = 'active'
        AND g.role = 'community_admin' AND g.revoked_at IS NULL
        AND (g.expires_at IS NULL OR g.expires_at > now()))
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION "collab_can_admin_org"(p_org text) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT EXISTS (SELECT 1 FROM organization_affiliations a
      JOIN role_grants g ON g.organization_id = a.organization_id AND g.person_id = a.person_id
      WHERE a.person_id = collab_actor() AND a.organization_id = p_org AND a.status = 'active'
        AND g.role = 'business_admin' AND g.revoked_at IS NULL
        AND (g.expires_at IS NULL OR g.expires_at > now()))
$$;--> statement-breakpoint

-- Locking admin check for an ARBITRARY person, used when an invitation is
-- accepted: the accepter (whose context is set) must confirm the issuer is still
-- an admin, but RLS would hide the issuer's rows from them. Bypasses RLS and
-- holds the row locks for the caller's transaction.
CREATE OR REPLACE FUNCTION "collab_person_is_admin_locked"(p_person text, p_community text) RETURNS boolean
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  BEGIN
    PERFORM 1 FROM person_community_memberships m
      JOIN role_grants g ON g.person_id = m.person_id AND g.community_id = m.community_id
      WHERE m.person_id = p_person AND m.community_id = p_community AND m.status = 'active'
        AND g.role = 'community_admin' AND g.revoked_at IS NULL
        AND (g.expires_at IS NULL OR g.expires_at > now())
      FOR UPDATE;
    RETURN found;
  END $$;--> statement-breakpoint

-- person_community_memberships: your own rows, or any row in a community you administer.
ALTER TABLE "person_community_memberships" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "pcm_select" ON "person_community_memberships" FOR SELECT
  USING ("person_id" = collab_actor() OR collab_is_community_admin("community_id"));--> statement-breakpoint
CREATE POLICY "pcm_insert" ON "person_community_memberships" FOR INSERT
  WITH CHECK ("person_id" = collab_actor() OR collab_is_community_admin("community_id"));--> statement-breakpoint
CREATE POLICY "pcm_update" ON "person_community_memberships" FOR UPDATE
  USING ("person_id" = collab_actor() OR collab_is_community_admin("community_id"))
  WITH CHECK ("person_id" = collab_actor() OR collab_is_community_admin("community_id"));--> statement-breakpoint

-- organization_community_memberships (the directory): visible to members of the community; no runtime writes.
ALTER TABLE "organization_community_memberships" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "ocm_select" ON "organization_community_memberships" FOR SELECT
  USING (collab_is_active_member("community_id"));--> statement-breakpoint

-- organization_affiliations: your own affiliations; no runtime writes yet (M2).
ALTER TABLE "organization_affiliations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "affiliation_select" ON "organization_affiliations" FOR SELECT
  USING ("person_id" = collab_actor());--> statement-breakpoint

-- role_grants: your own grants, or grants in a community you administer.
ALTER TABLE "role_grants" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "grant_select" ON "role_grants" FOR SELECT
  USING ("person_id" = collab_actor() OR ("community_id" IS NOT NULL AND collab_is_community_admin("community_id")));--> statement-breakpoint
CREATE POLICY "grant_insert" ON "role_grants" FOR INSERT
  WITH CHECK ("community_id" IS NOT NULL AND collab_is_community_admin("community_id"));--> statement-breakpoint
CREATE POLICY "grant_update" ON "role_grants" FOR UPDATE
  USING ("person_id" = collab_actor() OR ("community_id" IS NOT NULL AND collab_is_community_admin("community_id")))
  WITH CHECK ("person_id" = collab_actor() OR ("community_id" IS NOT NULL AND collab_is_community_admin("community_id")));--> statement-breakpoint

-- community_invitations: your own (as recipient), or any in a community you administer.
ALTER TABLE "community_invitations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "invitation_select" ON "community_invitations" FOR SELECT
  USING ("recipient_id" = collab_actor() OR collab_is_community_admin("community_id"));--> statement-breakpoint
CREATE POLICY "invitation_insert" ON "community_invitations" FOR INSERT
  WITH CHECK (collab_is_community_admin("community_id"));--> statement-breakpoint
CREATE POLICY "invitation_update" ON "community_invitations" FOR UPDATE
  USING ("recipient_id" = collab_actor() OR collab_is_community_admin("community_id"))
  WITH CHECK ("recipient_id" = collab_actor() OR collab_is_community_admin("community_id"));--> statement-breakpoint

-- membership_audit: readable by community admins; insertable by an admin, or by
-- the actor recording their own action (e.g. accepting an invitation). UPDATE and
-- DELETE remain blocked by the immutability trigger and have no policy.
ALTER TABLE "membership_audit" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "audit_select" ON "membership_audit" FOR SELECT
  USING (collab_is_community_admin("community_id"));--> statement-breakpoint
CREATE POLICY "audit_insert" ON "membership_audit" FOR INSERT
  WITH CHECK ("actor_id" = collab_actor() OR collab_is_community_admin("community_id"));--> statement-breakpoint

-- organizations: profiles are public within the app; only a Business Admin of the
-- org may update it; creation/deletion is provisioning-only.
ALTER TABLE "organizations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "organization_select" ON "organizations" FOR SELECT USING (true);--> statement-breakpoint
CREATE POLICY "organization_update" ON "organizations" FOR UPDATE
  USING (collab_can_admin_org("id")) WITH CHECK (collab_can_admin_org("id"));--> statement-breakpoint

-- Catalog: readable by the app; only the privileged provisioning path may change it.
ALTER TABLE "communities" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "community_select" ON "communities" FOR SELECT USING (true);--> statement-breakpoint
-- Admin operations lock the community row (SELECT ... FOR UPDATE), which also
-- enforces an UPDATE policy's USING clause. Allow the lock, but WITH CHECK (false)
-- forbids the runtime role from actually altering catalog rows.
CREATE POLICY "community_lock" ON "communities" FOR UPDATE USING (true) WITH CHECK (false);--> statement-breakpoint
ALTER TABLE "networks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "network_select" ON "networks" FOR SELECT USING (true);--> statement-breakpoint
ALTER TABLE "regions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "region_select" ON "regions" FOR SELECT USING (true);--> statement-breakpoint
ALTER TABLE "community_regions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "community_region_select" ON "community_regions" FOR SELECT USING (true);
