-- Opportunities & requests (M4): the core networking primitive.
--
-- Tables only; row-level security lands in 0008. Written by hand (like 0002-0006)
-- so the DDL, checks, and indexes read as one feature. An opportunity is a
-- structured need/offer authored in an owning community, optionally on behalf of
-- a represented organization; it is private until published to that community.
-- Responses stay private to the requester and the responder unless shared.

CREATE TABLE "opportunities" (
  "id" text PRIMARY KEY NOT NULL,
  "community_id" text NOT NULL REFERENCES "communities"("id"),
  "author_id" text NOT NULL REFERENCES "people"("id"),
  "organization_id" text REFERENCES "organizations"("id"),
  "kind" text NOT NULL,
  "title" text NOT NULL,
  "detail" text DEFAULT '' NOT NULL,
  "geography" text DEFAULT '' NOT NULL,
  "status" text DEFAULT 'open' NOT NULL,
  "visibility" text DEFAULT 'private' NOT NULL,
  "expires_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "opportunity_kind" CHECK ("opportunities"."kind" in ('need', 'offer')),
  CONSTRAINT "opportunity_status" CHECK ("opportunities"."status" in ('open', 'closed')),
  CONSTRAINT "opportunity_visibility" CHECK ("opportunities"."visibility" in ('private', 'community'))
);--> statement-breakpoint
CREATE INDEX "opportunities_community_status_idx" ON "opportunities" ("community_id", "status");--> statement-breakpoint
CREATE INDEX "opportunities_author_idx" ON "opportunities" ("author_id");--> statement-breakpoint

CREATE TABLE "opportunity_responses" (
  "id" text PRIMARY KEY NOT NULL,
  "opportunity_id" text NOT NULL REFERENCES "opportunities"("id"),
  "author_id" text NOT NULL REFERENCES "people"("id"),
  "body" text DEFAULT '' NOT NULL,
  "shared" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "opportunity_responses_unique" UNIQUE ("opportunity_id", "author_id")
);--> statement-breakpoint
CREATE INDEX "opportunity_responses_opportunity_idx" ON "opportunity_responses" ("opportunity_id");
