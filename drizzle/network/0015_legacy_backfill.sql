-- Legacy backfill mapping (M8): legacy prototype id -> canonical id.
--
-- One table plus its RLS. Written by hand (like 0002-0014). This is an operations
-- concern: only the privileged backfill/provisioning path writes it. RLS is
-- ENABLED with NO policy, so the restricted `collab_runtime` role can neither read
-- nor write it (the table owner bypasses RLS, as everywhere else).

CREATE TABLE "legacy_id_map" (
  "entity_type" text NOT NULL,
  "legacy_id" text NOT NULL,
  "canonical_id" text,
  "status" text DEFAULT 'mapped' NOT NULL,
  "source" text DEFAULT '' NOT NULL,
  "reason" text DEFAULT '' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "legacy_id_map_pk" PRIMARY KEY ("entity_type", "legacy_id"),
  CONSTRAINT "legacy_map_entity" CHECK ("legacy_id_map"."entity_type" in ('person', 'organization')),
  CONSTRAINT "legacy_map_status" CHECK ("legacy_id_map"."status" in ('mapped', 'needs_review', 'skipped'))
);--> statement-breakpoint
-- Operations-only: enabled with no policy denies the runtime role entirely.
ALTER TABLE "legacy_id_map" ENABLE ROW LEVEL SECURITY;
