import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import {
  businessSeed,
  commentSeed,
  communityPosts,
  eventSeed,
  memberSeed,
  reactionSeed,
  referralSeed,
  rsvpSeed
} from "@/lib/seed-data";

// One-time seeding of the Postgres DB from the app's seed data.
// After provisioning DATABASE_URL and running `npx drizzle-kit push`, hit this
// route once. It no-ops if the businesses table is already populated.
export async function GET() {
  const db = getDb();
  if (!db) {
    return NextResponse.json({ ok: false, error: "DATABASE_URL not set" }, { status: 400 });
  }

  const existing = await db.select().from(schema.businesses);
  if (existing.length > 0) {
    return NextResponse.json({ ok: true, message: "Already seeded", businesses: existing.length });
  }

  const now = Date.now();

  await db.insert(schema.businesses).values(businessSeed.map((business) => ({ ...business, createdAt: now })));
  await db.insert(schema.members).values(memberSeed);
  await db.insert(schema.referrals).values(
    referralSeed.map((referral) => ({
      id: referral.id,
      kind: referral.kind,
      giverId: referral.giverId,
      receiverId: referral.receiverId,
      introducedMemberId: referral.introducedMemberId ?? null,
      prospectName: referral.prospectName ?? null,
      prospectContact: referral.prospectContact ?? null,
      need: referral.need,
      status: referral.status,
      closedValue: referral.closedValue ?? null,
      thankYou: referral.thankYou ?? null,
      createdAt: referral.createdAt,
      closedAt: referral.closedAt ?? null
    }))
  );
  await db.insert(schema.events).values(
    eventSeed.map((event) => ({
      id: event.id,
      title: event.title,
      type: event.type,
      description: event.description,
      startsAt: event.startsAt,
      endsAt: event.endsAt ?? null,
      recurrence: event.recurrence,
      venueName: event.venueName,
      venueAddress: event.venueAddress,
      hostMemberId: event.hostMemberId ?? null,
      cost: event.cost,
      capacity: event.capacity ?? null,
      createdById: event.createdById
    }))
  );
  await db.insert(schema.rsvps).values(rsvpSeed);
  await db.insert(schema.posts).values(
    communityPosts.map((post) => ({
      id: post.id,
      authorId: post.authorId ?? null,
      author: post.author,
      businessName: post.businessName,
      timeAgo: post.timeAgo,
      category: post.category,
      tone: post.tone,
      body: post.body,
      note: post.note ?? null,
      reactions: post.reactions,
      comments: post.comments,
      createdAt: now
    }))
  );
  await db.insert(schema.comments).values(commentSeed);
  await db.insert(schema.reactions).values(reactionSeed);

  return NextResponse.json({ ok: true, message: "Seeded", businesses: businessSeed.length });
}
