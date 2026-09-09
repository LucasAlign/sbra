-- Events & RSVP (M5): one canonical event, published to many communities.
--
-- Tables only; row-level security lands in 0010. Written by hand (like 0002-0008)
-- so the DDL, checks, and indexes read as one feature. A single event
-- (community_events) reaches many communities through event_publications (no
-- copies); each person has at most one RSVP per event (event_rsvps), and capacity
-- is enforced in the RSVP transaction. Named community_events / event_rsvps to
-- avoid colliding with the legacy prototype's events/rsvps tables.

CREATE TABLE "community_events" (
  "id" text PRIMARY KEY NOT NULL,
  "organizer_id" text NOT NULL REFERENCES "people"("id"),
  "organization_id" text REFERENCES "organizations"("id"),
  "title" text NOT NULL,
  "description" text DEFAULT '' NOT NULL,
  "location" text DEFAULT '' NOT NULL,
  "timezone" text DEFAULT 'UTC' NOT NULL,
  "starts_at" timestamp with time zone NOT NULL,
  "ends_at" timestamp with time zone,
  "capacity" integer,
  "status" text DEFAULT 'scheduled' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "event_status" CHECK ("community_events"."status" in ('scheduled', 'canceled')),
  CONSTRAINT "event_capacity" CHECK ("community_events"."capacity" is null or "community_events"."capacity" > 0),
  CONSTRAINT "event_time_order" CHECK ("community_events"."ends_at" is null or "community_events"."ends_at" >= "community_events"."starts_at")
);--> statement-breakpoint
CREATE INDEX "community_events_organizer_idx" ON "community_events" ("organizer_id");--> statement-breakpoint

CREATE TABLE "event_publications" (
  "event_id" text NOT NULL REFERENCES "community_events"("id"),
  "community_id" text NOT NULL REFERENCES "communities"("id"),
  "published_by" text NOT NULL REFERENCES "people"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "event_publications_pk" PRIMARY KEY ("event_id", "community_id")
);--> statement-breakpoint
CREATE INDEX "event_publications_community_idx" ON "event_publications" ("community_id");--> statement-breakpoint

CREATE TABLE "event_rsvps" (
  "event_id" text NOT NULL REFERENCES "community_events"("id"),
  "person_id" text NOT NULL REFERENCES "people"("id"),
  "status" text DEFAULT 'going' NOT NULL,
  "responded_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "event_rsvps_pk" PRIMARY KEY ("event_id", "person_id"),
  CONSTRAINT "rsvp_status" CHECK ("event_rsvps"."status" in ('going', 'not_going'))
);
