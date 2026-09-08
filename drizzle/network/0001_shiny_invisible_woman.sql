CREATE TABLE "community_invitations" (
	"id" text PRIMARY KEY NOT NULL,
	"community_id" text NOT NULL,
	"recipient_id" text NOT NULL,
	"issued_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "invitation_expiry" CHECK ("community_invitations"."expires_at" > "community_invitations"."created_at"),
	CONSTRAINT "invitation_terminal_state" CHECK (not ("community_invitations"."accepted_at" is not null and "community_invitations"."revoked_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "membership_audit" (
	"id" text PRIMARY KEY NOT NULL,
	"community_id" text NOT NULL,
	"actor_id" text,
	"target_id" text NOT NULL,
	"action" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "membership_audit_action" CHECK ("membership_audit"."action" in
  ('invitation.created', 'invitation.revoked', 'invitation.accepted', 'membership.suspended', 'membership.restored', 'community.provisioned'))
);
--> statement-breakpoint
ALTER TABLE "community_invitations" ADD CONSTRAINT "community_invitations_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_invitations" ADD CONSTRAINT "community_invitations_recipient_id_people_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_invitations" ADD CONSTRAINT "community_invitations_issued_by_people_id_fk" FOREIGN KEY ("issued_by") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_audit" ADD CONSTRAINT "membership_audit_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_audit" ADD CONSTRAINT "membership_audit_actor_id_people_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_audit" ADD CONSTRAINT "membership_audit_target_id_people_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "community_invitations_recipient_id_index" ON "community_invitations" USING btree ("recipient_id");--> statement-breakpoint
CREATE INDEX "community_invitations_community_id_index" ON "community_invitations" USING btree ("community_id");--> statement-breakpoint
CREATE INDEX "membership_audit_community_id_created_at_index" ON "membership_audit" USING btree ("community_id","created_at");