CREATE TABLE "communities" (
	"id" text PRIMARY KEY NOT NULL,
	"network_id" text NOT NULL,
	"operator_id" text NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"short_name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"logo" text,
	"locale" text DEFAULT 'en' NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "communities_network_id_slug_unique" UNIQUE("network_id","slug"),
	CONSTRAINT "communities_id_network_id_unique" UNIQUE("id","network_id"),
	CONSTRAINT "community_kind" CHECK ("communities"."kind" in ('geographic', 'organizational', 'interest')),
	CONSTRAINT "community_status" CHECK ("communities"."status" in ('draft', 'active', 'suspended', 'archived'))
);
--> statement-breakpoint
CREATE TABLE "community_regions" (
	"community_id" text NOT NULL,
	"region_id" text NOT NULL,
	"network_id" text NOT NULL,
	CONSTRAINT "community_regions_community_id_region_id_pk" PRIMARY KEY("community_id","region_id")
);
--> statement-breakpoint
CREATE TABLE "networks" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "networks_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "organization_affiliations" (
	"person_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_affiliations_person_id_organization_id_pk" PRIMARY KEY("person_id","organization_id"),
	CONSTRAINT "affiliation_status" CHECK ("organization_affiliations"."status" in ('pending', 'active', 'suspended', 'left'))
);
--> statement-breakpoint
CREATE TABLE "organization_community_memberships" (
	"organization_id" text NOT NULL,
	"community_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"tier" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_community_memberships_organization_id_community_id_pk" PRIMARY KEY("organization_id","community_id"),
	CONSTRAINT "organization_membership_status" CHECK ("organization_community_memberships"."status" in ('pending', 'active', 'suspended', 'left'))
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_kind" CHECK ("organizations"."kind" in ('business', 'chamber', 'association', 'municipality', 'other'))
);
--> statement-breakpoint
CREATE TABLE "people" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "person_community_memberships" (
	"person_id" text NOT NULL,
	"community_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "person_community_memberships_person_id_community_id_pk" PRIMARY KEY("person_id","community_id"),
	CONSTRAINT "person_membership_status" CHECK ("person_community_memberships"."status" in ('pending', 'active', 'suspended', 'left'))
);
--> statement-breakpoint
CREATE TABLE "person_identities" (
	"provider" text NOT NULL,
	"subject" text NOT NULL,
	"person_id" text NOT NULL,
	CONSTRAINT "person_identities_provider_subject_pk" PRIMARY KEY("provider","subject")
);
--> statement-breakpoint
CREATE TABLE "regions" (
	"id" text PRIMARY KEY NOT NULL,
	"network_id" text NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "regions_network_id_slug_unique" UNIQUE("network_id","slug"),
	CONSTRAINT "regions_id_network_id_unique" UNIQUE("id","network_id")
);
--> statement-breakpoint
CREATE TABLE "role_grants" (
	"id" text PRIMARY KEY NOT NULL,
	"person_id" text NOT NULL,
	"role" text NOT NULL,
	"region_id" text,
	"community_id" text,
	"organization_id" text,
	"granted_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "role_scope" CHECK (
  ("role_grants"."role" = 'platform_admin' and "role_grants"."region_id" is null and "role_grants"."community_id" is null and "role_grants"."organization_id" is null) or
  ("role_grants"."role" = 'regional_admin' and "role_grants"."region_id" is not null and "role_grants"."community_id" is null and "role_grants"."organization_id" is null) or
  ("role_grants"."role" = 'community_admin' and "role_grants"."region_id" is null and "role_grants"."community_id" is not null and "role_grants"."organization_id" is null) or
  ("role_grants"."role" = 'business_admin' and "role_grants"."region_id" is null and "role_grants"."community_id" is null and "role_grants"."organization_id" is not null)
)
);
--> statement-breakpoint
ALTER TABLE "communities" ADD CONSTRAINT "communities_network_id_networks_id_fk" FOREIGN KEY ("network_id") REFERENCES "public"."networks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communities" ADD CONSTRAINT "communities_operator_id_organizations_id_fk" FOREIGN KEY ("operator_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_regions" ADD CONSTRAINT "community_regions_community_id_network_id_communities_id_network_id_fk" FOREIGN KEY ("community_id","network_id") REFERENCES "public"."communities"("id","network_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_regions" ADD CONSTRAINT "community_regions_region_id_network_id_regions_id_network_id_fk" FOREIGN KEY ("region_id","network_id") REFERENCES "public"."regions"("id","network_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_affiliations" ADD CONSTRAINT "organization_affiliations_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_affiliations" ADD CONSTRAINT "organization_affiliations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_community_memberships" ADD CONSTRAINT "organization_community_memberships_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_community_memberships" ADD CONSTRAINT "organization_community_memberships_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_community_memberships" ADD CONSTRAINT "person_community_memberships_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_community_memberships" ADD CONSTRAINT "person_community_memberships_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_identities" ADD CONSTRAINT "person_identities_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regions" ADD CONSTRAINT "regions_network_id_networks_id_fk" FOREIGN KEY ("network_id") REFERENCES "public"."networks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_grants" ADD CONSTRAINT "role_grants_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_grants" ADD CONSTRAINT "role_grants_region_id_regions_id_fk" FOREIGN KEY ("region_id") REFERENCES "public"."regions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_grants" ADD CONSTRAINT "role_grants_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_grants" ADD CONSTRAINT "role_grants_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_grants" ADD CONSTRAINT "role_grants_granted_by_people_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "organization_community_memberships_community_id_status_index" ON "organization_community_memberships" USING btree ("community_id","status");--> statement-breakpoint
CREATE INDEX "person_community_memberships_community_id_status_index" ON "person_community_memberships" USING btree ("community_id","status");--> statement-breakpoint
CREATE INDEX "role_grants_person_id_index" ON "role_grants" USING btree ("person_id");