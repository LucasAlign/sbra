-- Announcements (M7): community communications with author authority.
--
-- Tables only; row-level security lands in 0014. Written by hand (like 0002-0012).
-- One announcement is published to many communities (no copies); members of a
-- community it reaches read it and comment, and comments inherit that audience.

CREATE TABLE "announcements" (
  "id" text PRIMARY KEY NOT NULL,
  "author_id" text NOT NULL REFERENCES "people"("id"),
  "title" text NOT NULL,
  "body" text DEFAULT '' NOT NULL,
  "status" text DEFAULT 'published' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "announcement_status" CHECK ("announcements"."status" in ('published', 'archived'))
);--> statement-breakpoint
CREATE INDEX "announcements_author_idx" ON "announcements" ("author_id");--> statement-breakpoint

CREATE TABLE "announcement_publications" (
  "announcement_id" text NOT NULL REFERENCES "announcements"("id"),
  "community_id" text NOT NULL REFERENCES "communities"("id"),
  "published_by" text NOT NULL REFERENCES "people"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "announcement_publications_pk" PRIMARY KEY ("announcement_id", "community_id")
);--> statement-breakpoint
CREATE INDEX "announcement_publications_community_idx" ON "announcement_publications" ("community_id");--> statement-breakpoint

CREATE TABLE "announcement_comments" (
  "id" text PRIMARY KEY NOT NULL,
  "announcement_id" text NOT NULL REFERENCES "announcements"("id"),
  "author_id" text NOT NULL REFERENCES "people"("id"),
  "body" text DEFAULT '' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX "announcement_comments_announcement_idx" ON "announcement_comments" ("announcement_id");
