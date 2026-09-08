ALTER TABLE "membership_audit" DROP CONSTRAINT "membership_audit_action";--> statement-breakpoint
ALTER TABLE "membership_audit" ADD CONSTRAINT "membership_audit_action" CHECK ("membership_audit"."action" in
  ('invitation.created', 'invitation.revoked', 'invitation.accepted', 'membership.suspended', 'membership.restored', 'community.provisioned', 'administrator.transferred'));--> statement-breakpoint
-- Audit rows are append-only: block UPDATE and DELETE at the database level so no
-- application role (collab_runtime included) can rewrite history. TRUNCATE is
-- already denied to the runtime role by privilege.
CREATE OR REPLACE FUNCTION "membership_audit_reject_mutation"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'membership_audit rows are immutable';
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER "membership_audit_immutable" BEFORE UPDATE OR DELETE ON "membership_audit"
  FOR EACH ROW EXECUTE FUNCTION "membership_audit_reject_mutation"();