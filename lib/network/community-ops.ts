import { and, asc, desc, eq, gt, ne, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as fullSchema from "../db/schema";
import * as s from "../db/network-schema";
import { withActor } from "../db/context";
import { boundedText } from "./identity";
import { communityAdminAccess } from "./membership";

type Database = PostgresJsDatabase<typeof fullSchema>;

// Community Operations (M7): announcements and the home workspace.
//
// Announcements are official community communications with author authority: a
// community admin creates one and publishes it to communities they administer (no
// copies). Members of a community it reaches read it and comment; comments
// inherit the announcement's audience. The home workspace aggregates the actor's
// open requests, introductions awaiting them, upcoming events, and recent
// announcements — all RLS-scoped. Reaction counts do not organize any of it.

export type AnnouncementInput = { communityId: string; title: string; body?: string };

export async function createAnnouncement(db: Database, personId: string, input: AnnouncementInput) {
  const communityId = boundedText(input.communityId, 200);
  const title = boundedText(input.title, 200);
  const body = input.body ?? "";
  if (typeof body !== "string" || body.length > 10000) throw new Error("Invalid body.");
  return withActor(db, personId, async tx => {
    // Author authority: only a community admin may announce to that community.
    const [ok] = await tx.select({ ok: communityAdminAccess(personId, communityId) })
      .from(s.communities).where(and(eq(s.communities.id, communityId), eq(s.communities.status, "active")));
    if (!ok?.ok) throw new Error("Announcements here are not available to your account.");
    const announcement = { id: crypto.randomUUID(), authorId: personId, title, body: body.trim() };
    await tx.insert(s.announcements).values(announcement);
    await tx.insert(s.announcementPublications).values({ announcementId: announcement.id, communityId, publishedBy: personId });
    return { id: announcement.id };
  });
}

export async function publishAnnouncement(db: Database, personId: string, announcementId: string, communityId: string) {
  boundedText(announcementId, 200); boundedText(communityId, 200);
  return withActor(db, personId, async tx => {
    const [owned] = await tx.select({ id: s.announcements.id }).from(s.announcements)
      .where(and(eq(s.announcements.id, announcementId), eq(s.announcements.authorId, personId)));
    if (!owned) throw new Error("You cannot publish this announcement.");
    const [ok] = await tx.select({ ok: communityAdminAccess(personId, communityId) })
      .from(s.communities).where(and(eq(s.communities.id, communityId), eq(s.communities.status, "active")));
    if (!ok?.ok) throw new Error("You can only publish to a community you administer.");
    await tx.insert(s.announcementPublications).values({ announcementId, communityId, publishedBy: personId })
      .onConflictDoNothing({ target: [s.announcementPublications.announcementId, s.announcementPublications.communityId] });
  });
}

export async function archiveAnnouncement(db: Database, personId: string, announcementId: string) {
  boundedText(announcementId, 200);
  const changed = await withActor(db, personId, tx => tx.update(s.announcements).set({ status: "archived" })
    .where(and(eq(s.announcements.id, announcementId), eq(s.announcements.authorId, personId)))
    .returning({ id: s.announcements.id }));
  if (!changed.length) throw new Error("You cannot archive this announcement.");
}

export async function commentOnAnnouncement(db: Database, personId: string, announcementId: string, body: string) {
  boundedText(announcementId, 200);
  const text = boundedText(body, 5000);
  return withActor(db, personId, async tx => {
    // Comments inherit the announcement's audience: you must be able to see it.
    const [visible] = await tx.select({ id: s.announcements.id }).from(s.announcements).where(eq(s.announcements.id, announcementId));
    if (!visible) throw new Error("This announcement is not available to your account.");
    const comment = { id: crypto.randomUUID(), announcementId, authorId: personId, body: text };
    await tx.insert(s.announcementComments).values(comment);
    return { id: comment.id };
  });
}

export async function readAnnouncements(db: Database, personId: string, communityId: string) {
  boundedText(communityId, 200);
  return withActor(db, personId, async tx => {
    const author = alias(s.people, "announcement_author");
    const rows = await tx.select({ id: s.announcements.id, authorId: s.announcements.authorId, authorName: author.name,
      title: s.announcements.title, body: s.announcements.body, status: s.announcements.status, createdAt: s.announcements.createdAt,
      commentCount: sql<number>`(select count(*) from ${s.announcementComments} c where c.announcement_id = ${s.announcements.id})` })
      .from(s.announcements)
      .innerJoin(s.announcementPublications, eq(s.announcementPublications.announcementId, s.announcements.id))
      .innerJoin(author, eq(author.id, s.announcements.authorId))
      .where(and(eq(s.announcementPublications.communityId, communityId), eq(s.announcements.status, "published")))
      .orderBy(desc(s.announcements.createdAt)).limit(100);
    const announcements = rows.map(r => ({ ...r, commentCount: Number(r.commentCount), mine: r.authorId === personId }));
    return { announcements };
  });
}

export async function readAnnouncementComments(db: Database, personId: string, announcementId: string) {
  boundedText(announcementId, 200);
  return withActor(db, personId, async tx => {
    const [visible] = await tx.select({ id: s.announcements.id }).from(s.announcements).where(eq(s.announcements.id, announcementId));
    if (!visible) throw new Error("This announcement is not available to your account.");
    const author = alias(s.people, "comment_author");
    const comments = await tx.select({ id: s.announcementComments.id, announcementId: s.announcementComments.announcementId,
      authorId: s.announcementComments.authorId, authorName: author.name, body: s.announcementComments.body, createdAt: s.announcementComments.createdAt })
      .from(s.announcementComments).innerJoin(author, eq(author.id, s.announcementComments.authorId))
      .where(eq(s.announcementComments.announcementId, announcementId))
      .orderBy(asc(s.announcementComments.createdAt)).limit(500);
    return { comments: comments.map(c => ({ ...c, mine: c.authorId === personId })) };
  });
}

// The home workspace: the product's front door. Each list is RLS-scoped to what
// the actor may see; the caller derives "recommended next actions" from the
// counts. No reaction totals — engagement metrics do not organize the workspace.
export async function readHomeWorkspace(db: Database, personId: string) {
  return withActor(db, personId, async tx => {
    const introductionsAwaiting = await tx.select({ id: s.introductions.id, communityId: s.introductions.communityId,
      message: s.introductions.message, createdAt: s.introductions.createdAt })
      .from(s.introductionParticipants)
      .innerJoin(s.introductions, eq(s.introductions.id, s.introductionParticipants.introductionId))
      .where(and(eq(s.introductionParticipants.personId, personId), eq(s.introductionParticipants.role, "party"),
        eq(s.introductionParticipants.consent, "pending"), ne(s.introductions.status, "withdrawn")))
      .orderBy(desc(s.introductions.createdAt)).limit(50);

    const eventRows = await tx.select({ id: s.communityEvents.id, title: s.communityEvents.title,
      startsAt: s.communityEvents.startsAt, communityId: s.eventPublications.communityId })
      .from(s.communityEvents).innerJoin(s.eventPublications, eq(s.eventPublications.eventId, s.communityEvents.id))
      .where(and(eq(s.communityEvents.status, "scheduled"), gt(s.communityEvents.startsAt, sql`now()`)))
      .orderBy(asc(s.communityEvents.startsAt)).limit(50);

    const opportunityRows = await tx.select({ id: s.opportunities.id, communityId: s.opportunities.communityId,
      kind: s.opportunities.kind, title: s.opportunities.title, authorId: s.opportunities.authorId, createdAt: s.opportunities.createdAt })
      .from(s.opportunities).where(eq(s.opportunities.status, "open")).orderBy(desc(s.opportunities.createdAt)).limit(50);

    const author = alias(s.people, "home_announcement_author");
    const announcementRows = await tx.select({ id: s.announcements.id, communityId: s.announcementPublications.communityId,
      title: s.announcements.title, authorName: author.name, createdAt: s.announcements.createdAt })
      .from(s.announcements)
      .innerJoin(s.announcementPublications, eq(s.announcementPublications.announcementId, s.announcements.id))
      .innerJoin(author, eq(author.id, s.announcements.authorId))
      .where(eq(s.announcements.status, "published")).orderBy(desc(s.announcements.createdAt)).limit(50);

    // An event/announcement in several of the actor's communities returns one row
    // per publication; collapse to the first so the workspace lists it once.
    const dedupe = <T extends { id: string }>(rows: T[]) => {
      const seen = new Set<string>();
      return rows.filter(r => (seen.has(r.id) ? false : (seen.add(r.id), true)));
    };
    return {
      introductionsAwaiting,
      upcomingEvents: dedupe(eventRows).slice(0, 25),
      openOpportunities: opportunityRows.map(r => ({ id: r.id, communityId: r.communityId, kind: r.kind,
        title: r.title, createdAt: r.createdAt, mine: r.authorId === personId })).slice(0, 25),
      announcements: dedupe(announcementRows).slice(0, 25),
    };
  });
}
