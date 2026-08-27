"use server";

import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import type {
  Business,
  Comment,
  CommunityPost,
  Member,
  Reaction,
  Referral,
  Rsvp,
  RsvpStatus,
  SbraEvent
} from "@/lib/types";

// The DB rows are shaped like the client types (schema keys match, times are
// bigint-ms numbers). Nullable columns come back as null where the client type
// uses optional; we cast at this boundary rather than deep-mapping every field.
export type Bootstrap = {
  businesses: Business[];
  members: Member[];
  referrals: Referral[];
  events: SbraEvent[];
  rsvps: Rsvp[];
  posts: CommunityPost[];
  comments: Comment[];
  reactions: Reaction[];
};

export async function bootstrap(): Promise<Bootstrap | null> {
  const db = getDb();
  if (!db) return null;
  const [businesses, members, referrals, events, rsvps, posts, comments, reactions] = await Promise.all([
    db.select().from(schema.businesses),
    db.select().from(schema.members),
    db.select().from(schema.referrals),
    db.select().from(schema.events),
    db.select().from(schema.rsvps),
    db.select().from(schema.posts),
    db.select().from(schema.comments),
    db.select().from(schema.reactions)
  ]);
  return {
    businesses: businesses as unknown as Business[],
    members: members as unknown as Member[],
    referrals: referrals as unknown as Referral[],
    events: events as unknown as SbraEvent[],
    rsvps: rsvps as unknown as Rsvp[],
    posts: posts as unknown as CommunityPost[],
    comments: comments as unknown as Comment[],
    reactions: reactions as unknown as Reaction[]
  };
}

export async function persistPost(post: CommunityPost): Promise<void> {
  const db = getDb();
  if (!db) return;
  await db.insert(schema.posts).values({
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
    createdAt: post.createdAt ?? Date.now()
  });
}

export async function persistComment(comment: Comment): Promise<void> {
  const db = getDb();
  if (!db) return;
  await db.insert(schema.comments).values(comment);
}

export async function toggleReaction(postId: string, memberId: string): Promise<void> {
  const db = getDb();
  if (!db) return;
  const existing = await db
    .select()
    .from(schema.reactions)
    .where(
      and(
        eq(schema.reactions.postId, postId),
        eq(schema.reactions.memberId, memberId),
        eq(schema.reactions.type, "celebrate")
      )
    );
  if (existing.length > 0) {
    await db.delete(schema.reactions).where(eq(schema.reactions.id, existing[0].id));
  } else {
    await db.insert(schema.reactions).values({ id: `rx-${Date.now()}`, postId, memberId, type: "celebrate" });
  }
}

export async function insertReferral(referral: Referral): Promise<void> {
  const db = getDb();
  if (!db) return;
  await db.insert(schema.referrals).values({
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
  });
}

export async function updateReferral(id: string, changes: Partial<Referral>): Promise<void> {
  const db = getDb();
  if (!db) return;
  await db.update(schema.referrals).set(changes).where(eq(schema.referrals.id, id));
}

export async function setRsvp(eventId: string, memberId: string, status: RsvpStatus): Promise<void> {
  const db = getDb();
  if (!db) return;
  await db
    .insert(schema.rsvps)
    .values({ eventId, memberId, status, checkedIn: false, respondedAt: Date.now() })
    .onConflictDoUpdate({
      target: [schema.rsvps.eventId, schema.rsvps.memberId],
      set: { status, respondedAt: Date.now() }
    });
}

export async function setCheckIn(eventId: string, memberId: string, checkedIn: boolean): Promise<void> {
  const db = getDb();
  if (!db) return;
  await db
    .insert(schema.rsvps)
    .values({ eventId, memberId, status: "going", checkedIn, respondedAt: Date.now() })
    .onConflictDoUpdate({
      target: [schema.rsvps.eventId, schema.rsvps.memberId],
      set: { checkedIn, status: "going" }
    });
}

export async function persistEvent(event: SbraEvent): Promise<void> {
  const db = getDb();
  if (!db) return;
  await db.insert(schema.events).values({
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
  });
}

export async function persistMember(member: Member): Promise<void> {
  const db = getDb();
  if (!db) return;
  await db
    .update(schema.members)
    .set({ name: member.name, title: member.title, email: member.email, phone: member.phone, bio: member.bio })
    .where(eq(schema.members.id, member.id));
}

export async function persistImportedMembers(
  rows: { business: Business; member: Member }[]
): Promise<void> {
  const db = getDb();
  if (!db) return;
  for (const row of rows) {
    await db.insert(schema.businesses).values({ ...row.business, createdAt: Date.now() });
    await db.insert(schema.members).values(row.member);
  }
}
