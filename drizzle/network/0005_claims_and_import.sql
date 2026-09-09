-- Verified business claiming, canonical profile fields, community listing
-- overrides, and private import staging (M1 verified claims + M2).
--
-- Tables only; row-level security for them lands in 0006. Written by hand (like
-- 0002-0004) so the DDL, checks, and the partial unique index live together and
-- the migration reads as one feature.

-- Canonical organization profile fields: edited once, shown in every listing.
ALTER TABLE "organizations" ADD COLUMN "website" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "locations" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "service_areas" text DEFAULT '' NOT NULL;--> statement-breakpoint

-- Extend the audit action vocabulary with the claim lifecycle. The check must be
-- dropped and re-added; the immutability trigger (0002) does not touch DDL.
ALTER TABLE "membership_audit" DROP CONSTRAINT "membership_audit_action";--> statement-breakpoint
ALTER TABLE "membership_audit" ADD CONSTRAINT "membership_audit_action" CHECK ("membership_audit"."action" in
  ('invitation.created', 'invitation.revoked', 'invitation.accepted', 'membership.suspended', 'membership.restored', 'community.provisioned', 'administrator.transferred',
   'claim.requested', 'claim.approved', 'claim.rejected', 'claim.withdrawn'));--> statement-breakpoint

-- claim_requests: a member asks to represent a business in a community; the
-- community admin decides. Approval (in app logic) grants Business Admin + an
-- active affiliation atomically.
CREATE TABLE "claim_requests" (
  "id" text PRIMARY KEY NOT NULL,
  "person_id" text NOT NULL REFERENCES "people"("id"),
  "organization_id" text NOT NULL REFERENCES "organizations"("id"),
  "community_id" text NOT NULL REFERENCES "communities"("id"),
  "status" text DEFAULT 'pending' NOT NULL,
  "evidence" text DEFAULT '' NOT NULL,
  "reviewed_by" text REFERENCES "people"("id"),
  "reviewed_at" timestamp with time zone,
  "decision_note" text DEFAULT '' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "claim_status" CHECK ("claim_requests"."status" in ('pending', 'approved', 'rejected', 'withdrawn'))
);--> statement-breakpoint
CREATE INDEX "claim_requests_community_status_idx" ON "claim_requests" ("community_id", "status");--> statement-breakpoint
CREATE INDEX "claim_requests_person_idx" ON "claim_requests" ("person_id");--> statement-breakpoint
-- At most one open claim per person + organization + community.
CREATE UNIQUE INDEX "claim_requests_one_pending" ON "claim_requests" ("person_id", "organization_id", "community_id") WHERE "status" = 'pending';--> statement-breakpoint

-- community_listing_overrides: local presentation layered over the canonical org.
CREATE TABLE "community_listing_overrides" (
  "organization_id" text NOT NULL REFERENCES "organizations"("id"),
  "community_id" text NOT NULL REFERENCES "communities"("id"),
  "headline" text DEFAULT '' NOT NULL,
  "local_offer" text DEFAULT '' NOT NULL,
  "visibility" text DEFAULT 'listed' NOT NULL,
  "updated_by" text NOT NULL REFERENCES "people"("id"),
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "community_listing_overrides_pk" PRIMARY KEY ("organization_id", "community_id"),
  CONSTRAINT "listing_visibility" CHECK ("community_listing_overrides"."visibility" in ('listed', 'hidden'))
);--> statement-breakpoint

-- Private import staging: ingested rows never assign ownership and never surface
-- in a member-facing projection. Claiming is the only path to a real affiliation.
CREATE TABLE "import_batches" (
  "id" text PRIMARY KEY NOT NULL,
  "community_id" text NOT NULL REFERENCES "communities"("id"),
  "source" text NOT NULL,
  "note" text DEFAULT '' NOT NULL,
  "created_by" text NOT NULL REFERENCES "people"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX "import_batches_community_idx" ON "import_batches" ("community_id");--> statement-breakpoint

CREATE TABLE "source_records" (
  "id" text PRIMARY KEY NOT NULL,
  "batch_id" text NOT NULL REFERENCES "import_batches"("id"),
  "external_id" text DEFAULT '' NOT NULL,
  "payload" text DEFAULT '' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX "source_records_batch_idx" ON "source_records" ("batch_id");--> statement-breakpoint

CREATE TABLE "external_entity_links" (
  "id" text PRIMARY KEY NOT NULL,
  "source_record_id" text NOT NULL REFERENCES "source_records"("id"),
  "entity_type" text NOT NULL,
  "entity_id" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "external_entity_links_unique" UNIQUE ("source_record_id", "entity_type"),
  CONSTRAINT "external_link_entity" CHECK ("external_entity_links"."entity_type" in ('organization', 'person'))
);--> statement-breakpoint

CREATE TABLE "merge_history" (
  "id" text PRIMARY KEY NOT NULL,
  "entity_type" text NOT NULL,
  "surviving_id" text NOT NULL,
  "merged_id" text NOT NULL,
  "community_id" text REFERENCES "communities"("id"),
  "reason" text DEFAULT '' NOT NULL,
  "merged_by" text NOT NULL REFERENCES "people"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "merge_entity" CHECK ("merge_history"."entity_type" in ('organization', 'person')),
  CONSTRAINT "merge_distinct" CHECK ("merge_history"."surviving_id" <> "merge_history"."merged_id")
);
