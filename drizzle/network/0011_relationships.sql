-- Introductions, connections & referrals (M6): member-driven relationships.
--
-- Tables only; row-level security lands in 0012. Written by hand (like 0002-0010)
-- so the DDL, checks, and indexes read as one feature. An introduction names
-- participants who each consent; a participant's contact is written only on
-- acceptance. Accepted parties become connections (canonical low<high pair, one
-- row). Relationship notes are private to their owner. Referrals ride on
-- connections; the financial closed_value stays with the two parties.

CREATE TABLE "introductions" (
  "id" text PRIMARY KEY NOT NULL,
  "community_id" text NOT NULL REFERENCES "communities"("id"),
  "created_by" text NOT NULL REFERENCES "people"("id"),
  "message" text DEFAULT '' NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "introduction_status" CHECK ("introductions"."status" in ('pending', 'accepted', 'declined', 'withdrawn'))
);--> statement-breakpoint
CREATE INDEX "introductions_community_idx" ON "introductions" ("community_id");--> statement-breakpoint
CREATE INDEX "introductions_created_by_idx" ON "introductions" ("created_by");--> statement-breakpoint

CREATE TABLE "introduction_participants" (
  "introduction_id" text NOT NULL REFERENCES "introductions"("id"),
  "person_id" text NOT NULL REFERENCES "people"("id"),
  "role" text DEFAULT 'party' NOT NULL,
  "consent" text DEFAULT 'pending' NOT NULL,
  "contact" text DEFAULT '' NOT NULL,
  "responded_at" timestamp with time zone,
  CONSTRAINT "introduction_participants_pk" PRIMARY KEY ("introduction_id", "person_id"),
  CONSTRAINT "participant_role" CHECK ("introduction_participants"."role" in ('introducer', 'party')),
  CONSTRAINT "participant_consent" CHECK ("introduction_participants"."consent" in ('pending', 'accepted', 'declined'))
);--> statement-breakpoint
CREATE INDEX "introduction_participants_person_idx" ON "introduction_participants" ("person_id");--> statement-breakpoint

CREATE TABLE "connections" (
  "person_low" text NOT NULL REFERENCES "people"("id"),
  "person_high" text NOT NULL REFERENCES "people"("id"),
  "status" text DEFAULT 'active' NOT NULL,
  "introduction_id" text REFERENCES "introductions"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "connections_pk" PRIMARY KEY ("person_low", "person_high"),
  CONSTRAINT "connection_status" CHECK ("connections"."status" in ('active', 'archived')),
  CONSTRAINT "connection_distinct" CHECK ("connections"."person_low" < "connections"."person_high")
);--> statement-breakpoint
CREATE INDEX "connections_high_idx" ON "connections" ("person_high");--> statement-breakpoint

CREATE TABLE "relationship_notes" (
  "id" text PRIMARY KEY NOT NULL,
  "owner_id" text NOT NULL REFERENCES "people"("id"),
  "about_person_id" text NOT NULL REFERENCES "people"("id"),
  "body" text DEFAULT '' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX "relationship_notes_owner_idx" ON "relationship_notes" ("owner_id", "about_person_id");--> statement-breakpoint

CREATE TABLE "member_referrals" (
  "id" text PRIMARY KEY NOT NULL,
  "community_id" text NOT NULL REFERENCES "communities"("id"),
  "from_person_id" text NOT NULL REFERENCES "people"("id"),
  "to_person_id" text NOT NULL REFERENCES "people"("id"),
  "need" text DEFAULT '' NOT NULL,
  "note" text DEFAULT '' NOT NULL,
  "status" text DEFAULT 'open' NOT NULL,
  "closed_value" numeric(12, 2),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "closed_at" timestamp with time zone,
  CONSTRAINT "referral_status" CHECK ("member_referrals"."status" in ('open', 'closed', 'declined')),
  CONSTRAINT "referral_distinct" CHECK ("member_referrals"."from_person_id" <> "member_referrals"."to_person_id")
);--> statement-breakpoint
CREATE INDEX "member_referrals_from_idx" ON "member_referrals" ("from_person_id");--> statement-breakpoint
CREATE INDEX "member_referrals_to_idx" ON "member_referrals" ("to_person_id");
