// Community Operations domain module (M7).
//
// Owns announcements (community communications with author authority, comments
// inheriting the announcement's audience) and the home workspace aggregation.
// Demo and Postgres adapters implement one interface; the Postgres adapter
// delegates to the transactional, RLS-backed logic in lib/network/community-ops.ts.

import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as fullSchema from "../db/schema";
import {
  archiveAnnouncement, commentOnAnnouncement, createAnnouncement, publishAnnouncement,
  readAnnouncementComments, readAnnouncements, readHomeWorkspace,
} from "../network/community-ops";
import type { AnnouncementInput, CommunityOperationsModule } from "./contracts";
import type { DemoWorld } from "./demo-world";
import { ModuleActor, ModuleError } from "./types";

type Database = PostgresJsDatabase<typeof fullSchema>;

// --- Postgres adapter -------------------------------------------------------

export class PostgresCommunityOperations implements CommunityOperationsModule {
  constructor(private readonly db: Database) {}

  createAnnouncement(actor: ModuleActor, input: AnnouncementInput) {
    return createAnnouncement(this.db, actor.personId, input);
  }
  publishAnnouncement(actor: ModuleActor, announcementId: string, communityId: string) {
    return publishAnnouncement(this.db, actor.personId, announcementId, communityId);
  }
  archiveAnnouncement(actor: ModuleActor, announcementId: string) {
    return archiveAnnouncement(this.db, actor.personId, announcementId);
  }
  readAnnouncements(actor: ModuleActor, communityId: string) {
    return readAnnouncements(this.db, actor.personId, communityId);
  }
  commentOnAnnouncement(actor: ModuleActor, announcementId: string, body: string) {
    return commentOnAnnouncement(this.db, actor.personId, announcementId, body);
  }
  readAnnouncementComments(actor: ModuleActor, announcementId: string) {
    return readAnnouncementComments(this.db, actor.personId, announcementId);
  }
  readHomeWorkspace(actor: ModuleActor) {
    return readHomeWorkspace(this.db, actor.personId);
  }
}

// --- Demo adapter -----------------------------------------------------------

export class DemoCommunityOperations implements CommunityOperationsModule {
  constructor(private readonly world: DemoWorld) {}

  private activeMember(personId: string, communityId: string): boolean {
    return this.world.communities.get(communityId)?.status === "active"
      && this.world.personMemberships.some(m => m.personId === personId && m.communityId === communityId && m.status === "active");
  }

  private isCommunityAdmin(personId: string, communityId: string): boolean {
    const now = Date.now();
    return this.activeMember(personId, communityId)
      && this.world.grants.some(g => g.personId === personId && g.communityId === communityId
        && g.role === "community_admin" && !g.revokedAt && (!g.expiresAt || g.expiresAt.getTime() > now));
  }

  // Author, or an active member of any community the announcement is published to.
  private canSee(personId: string, announcementId: string): boolean {
    const a = this.world.announcements.find(x => x.id === announcementId);
    if (a?.authorId === personId) return true;
    return this.world.announcementPublications.some(p => p.announcementId === announcementId && this.activeMember(personId, p.communityId));
  }

  async createAnnouncement(actor: ModuleActor, input: AnnouncementInput) {
    if (!input.title?.trim() || input.title.length > 200) throw new ModuleError("Invalid title.");
    if ((input.body ?? "").length > 10000) throw new ModuleError("Invalid body.");
    if (!this.isCommunityAdmin(actor.personId, input.communityId)) throw new ModuleError("Announcements here are not available to your account.");
    const announcement = { id: crypto.randomUUID(), authorId: actor.personId, title: input.title.trim(),
      body: (input.body ?? "").trim(), status: "published" as const, createdAt: new Date() };
    this.world.announcements.push(announcement);
    this.world.announcementPublications.push({ announcementId: announcement.id, communityId: input.communityId });
    return { id: announcement.id };
  }

  async publishAnnouncement(actor: ModuleActor, announcementId: string, communityId: string) {
    const owned = this.world.announcements.find(a => a.id === announcementId && a.authorId === actor.personId);
    if (!owned) throw new ModuleError("You cannot publish this announcement.");
    if (!this.isCommunityAdmin(actor.personId, communityId)) throw new ModuleError("You can only publish to a community you administer.");
    if (!this.world.announcementPublications.some(p => p.announcementId === announcementId && p.communityId === communityId)) {
      this.world.announcementPublications.push({ announcementId, communityId });
    }
  }

  async archiveAnnouncement(actor: ModuleActor, announcementId: string) {
    const a = this.world.announcements.find(x => x.id === announcementId && x.authorId === actor.personId);
    if (!a) throw new ModuleError("You cannot archive this announcement.");
    a.status = "archived";
  }

  async readAnnouncements(actor: ModuleActor, communityId: string) {
    const publishedHere = new Set(this.world.announcementPublications.filter(p => p.communityId === communityId).map(p => p.announcementId));
    const announcements = this.world.announcements
      .filter(a => publishedHere.has(a.id) && a.status === "published" && (a.authorId === actor.personId || this.activeMember(actor.personId, communityId)))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map(a => ({ id: a.id, authorId: a.authorId, authorName: this.world.people.get(a.authorId)?.name ?? "",
        title: a.title, body: a.body, status: a.status, createdAt: a.createdAt,
        commentCount: this.world.announcementComments.filter(c => c.announcementId === a.id).length,
        mine: a.authorId === actor.personId }));
    return { announcements };
  }

  async commentOnAnnouncement(actor: ModuleActor, announcementId: string, body: string) {
    if (!body?.trim() || body.length > 5000) throw new ModuleError("Invalid comment.");
    if (!this.canSee(actor.personId, announcementId)) throw new ModuleError("This announcement is not available to your account.");
    const comment = { id: crypto.randomUUID(), announcementId, authorId: actor.personId, body: body.trim(), createdAt: new Date() };
    this.world.announcementComments.push(comment);
    return { id: comment.id };
  }

  async readAnnouncementComments(actor: ModuleActor, announcementId: string) {
    if (!this.canSee(actor.personId, announcementId)) throw new ModuleError("This announcement is not available to your account.");
    const comments = this.world.announcementComments
      .filter(c => c.announcementId === announcementId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map(c => ({ id: c.id, announcementId: c.announcementId, authorId: c.authorId,
        authorName: this.world.people.get(c.authorId)?.name ?? "", body: c.body, createdAt: c.createdAt, mine: c.authorId === actor.personId }));
    return { comments };
  }

  async readHomeWorkspace(actor: ModuleActor) {
    const introIds = new Set(this.world.participants
      .filter(p => p.personId === actor.personId && p.role === "party" && p.consent === "pending").map(p => p.introductionId));
    const introductionsAwaiting = this.world.introductions
      .filter(i => introIds.has(i.id) && i.status !== "withdrawn")
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map(i => ({ id: i.id, communityId: i.communityId, message: i.message, createdAt: i.createdAt }));

    const myCommunities = new Set(this.world.personMemberships
      .filter(m => m.personId === actor.personId && m.status === "active").map(m => m.communityId));
    const canSeeEvent = (id: string) => {
      const e = this.world.events.find(x => x.id === id);
      return e?.organizerId === actor.personId || this.world.publications.some(p => p.eventId === id && myCommunities.has(p.communityId));
    };
    const now = Date.now();
    const upcomingEvents = this.world.events
      .filter(e => e.status === "scheduled" && e.startsAt.getTime() > now && canSeeEvent(e.id))
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
      .slice(0, 25)
      .map(e => ({ id: e.id, title: e.title, startsAt: e.startsAt, communityId: this.world.publications.find(p => p.eventId === e.id)?.communityId ?? "" }));

    const openOpportunities = this.world.opportunities
      .filter(o => o.status === "open" && (o.authorId === actor.personId || (o.visibility === "community" && myCommunities.has(o.communityId))))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 25)
      .map(o => ({ id: o.id, communityId: o.communityId, kind: o.kind, title: o.title, createdAt: o.createdAt, mine: o.authorId === actor.personId }));

    const announcements = this.world.announcements
      .filter(a => a.status === "published" && (a.authorId === actor.personId
        || this.world.announcementPublications.some(p => p.announcementId === a.id && myCommunities.has(p.communityId))))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 25)
      .map(a => ({ id: a.id, communityId: this.world.announcementPublications.find(p => p.announcementId === a.id)?.communityId ?? "",
        title: a.title, authorName: this.world.people.get(a.authorId)?.name ?? "", createdAt: a.createdAt }));

    return { introductionsAwaiting, upcomingEvents, openOpportunities, announcements };
  }
}
