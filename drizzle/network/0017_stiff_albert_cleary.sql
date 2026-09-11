CREATE TABLE "business_crm_workspaces" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"version" integer DEFAULT 2 NOT NULL,
	"data" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "business_crm_workspaces" ADD CONSTRAINT "business_crm_workspaces_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_crm_workspaces" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "business_crm_workspace_admin" ON "business_crm_workspaces" FOR ALL
  USING (collab_can_admin_org("organization_id"))
  WITH CHECK (collab_can_admin_org("organization_id"));
