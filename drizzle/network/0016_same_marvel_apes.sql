ALTER TABLE "member_referrals" DROP CONSTRAINT "referral_status";--> statement-breakpoint
UPDATE "member_referrals"
SET "status" = CASE "status"
  WHEN 'closed' THEN 'won'
  WHEN 'declined' THEN 'not_won'
  ELSE 'sent'
END;--> statement-breakpoint
ALTER TABLE "member_referrals" ALTER COLUMN "status" SET DEFAULT 'sent';--> statement-breakpoint
ALTER TABLE "member_referrals" ADD CONSTRAINT "referral_status" CHECK ("member_referrals"."status" in ('sent', 'won', 'not_won'));--> statement-breakpoint
ALTER TABLE "member_referrals" DROP COLUMN "closed_value";--> statement-breakpoint
DROP POLICY "referral_update" ON "member_referrals";--> statement-breakpoint
CREATE POLICY "referral_update" ON "member_referrals" FOR UPDATE
  USING ("to_person_id" = collab_actor())
  WITH CHECK ("to_person_id" = collab_actor());
