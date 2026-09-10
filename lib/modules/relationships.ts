// Relationships domain module (M6).
//
// Owns member-driven introductions (with consent, contact shared only after
// acceptance), the connections those produce, private relationship notes, and
// referrals that ride on connections. Sending earns 10 points and a Won outcome
// adds 40. Demo and Postgres adapters implement one interface;
// the Postgres adapter delegates to the transactional, RLS-backed logic in
// lib/network/relationships.ts.

import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as fullSchema from "../db/schema";
import {
  addRelationshipNote, createReferral, readConnections, readIntroductions, readReferrals,
  readRelationshipNotes, requestIntroduction, respondToIntroduction, updateReferralOutcome,
  updateRelationshipNote, withdrawIntroduction,
} from "../network/relationships";
import type { IntroductionInput, ReferralInput, ReferralOutcome, RelationshipsModule } from "./contracts";
import type { DemoWorld } from "./demo-world";
import { ModuleActor, ModuleError } from "./types";
import { referralPointsForStatus } from "../referral-points";

type Database = PostgresJsDatabase<typeof fullSchema>;

// --- Postgres adapter -------------------------------------------------------

export class PostgresRelationships implements RelationshipsModule {
  constructor(private readonly db: Database) {}

  requestIntroduction(actor: ModuleActor, input: IntroductionInput) {
    return requestIntroduction(this.db, actor.personId, input);
  }
  respondToIntroduction(actor: ModuleActor, introductionId: string, decision: "accepted" | "declined", contact?: string) {
    return respondToIntroduction(this.db, actor.personId, introductionId, decision, contact);
  }
  withdrawIntroduction(actor: ModuleActor, introductionId: string) {
    return withdrawIntroduction(this.db, actor.personId, introductionId);
  }
  readIntroductions(actor: ModuleActor) {
    return readIntroductions(this.db, actor.personId);
  }
  readConnections(actor: ModuleActor) {
    return readConnections(this.db, actor.personId);
  }
  addRelationshipNote(actor: ModuleActor, aboutPersonId: string, body: string) {
    return addRelationshipNote(this.db, actor.personId, aboutPersonId, body);
  }
  updateRelationshipNote(actor: ModuleActor, noteId: string, body: string) {
    return updateRelationshipNote(this.db, actor.personId, noteId, body);
  }
  readRelationshipNotes(actor: ModuleActor, aboutPersonId: string) {
    return readRelationshipNotes(this.db, actor.personId, aboutPersonId);
  }
  createReferral(actor: ModuleActor, input: ReferralInput) {
    return createReferral(this.db, actor.personId, input);
  }
  updateReferralOutcome(actor: ModuleActor, referralId: string, status: ReferralOutcome) {
    return updateReferralOutcome(this.db, actor.personId, referralId, status);
  }
  readReferrals(actor: ModuleActor) {
    return readReferrals(this.db, actor.personId);
  }
}

// --- Demo adapter -----------------------------------------------------------

function pair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

export class DemoRelationships implements RelationshipsModule {
  constructor(private readonly world: DemoWorld) {}

  private activeMember(personId: string, communityId: string): boolean {
    return this.world.communities.get(communityId)?.status === "active"
      && this.world.personMemberships.some(m => m.personId === personId && m.communityId === communityId && m.status === "active");
  }

  private isConnected(a: string, b: string): boolean {
    const [low, high] = pair(a, b);
    return this.world.connections.some(c => c.personLow === low && c.personHigh === high && c.status === "active");
  }

  private effectiveStatus(intro: { status: string }, parties: { consent: string }[]): string {
    if (intro.status === "withdrawn") return "withdrawn";
    if (parties.some(p => p.consent === "declined")) return "declined";
    if (parties.length && parties.every(p => p.consent === "accepted")) return "accepted";
    return "pending";
  }

  async requestIntroduction(actor: ModuleActor, input: IntroductionInput) {
    const message = input.message ?? "";
    const contact = input.contact ?? "";
    if (message.length > 2000) throw new ModuleError("Invalid message.");
    if (contact.length > 500) throw new ModuleError("Invalid contact.");
    const partyIds = Array.from(new Set(input.partyIds ?? []));
    if (!partyIds.length) throw new ModuleError("Name at least one person to introduce.");
    if (partyIds.includes(actor.personId)) throw new ModuleError("You are already part of this introduction.");
    if (!this.activeMember(actor.personId, input.communityId)) throw new ModuleError("This community is not available to your account.");
    if (!partyIds.every(id => this.activeMember(id, input.communityId))) {
      throw new ModuleError("Everyone in an introduction must be a member of the community.");
    }
    const asParty = input.asParty !== false;
    const intro = { id: crypto.randomUUID(), communityId: input.communityId, createdBy: actor.personId,
      message: message.trim(), status: "pending" as const, createdAt: new Date() };
    this.world.introductions.push(intro);
    this.world.participants.push({ introductionId: intro.id, personId: actor.personId,
      role: asParty ? "party" : "introducer", consent: "accepted", contact: asParty ? contact.trim() : "", respondedAt: new Date() });
    for (const partyId of partyIds) {
      this.world.participants.push({ introductionId: intro.id, personId: partyId, role: "party", consent: "pending", contact: "", respondedAt: null });
    }
    return { id: intro.id };
  }

  async respondToIntroduction(actor: ModuleActor, introductionId: string, decision: "accepted" | "declined", contact = "") {
    if (decision !== "accepted" && decision !== "declined") throw new ModuleError("Invalid decision.");
    if (contact.length > 500) throw new ModuleError("Invalid contact.");
    const intro = this.world.introductions.find(i => i.id === introductionId);
    if (!intro) throw new ModuleError("Introduction unavailable.");
    if (intro.status === "withdrawn") throw new ModuleError("This introduction is no longer open.");
    const mine = this.world.participants.find(p => p.introductionId === introductionId && p.personId === actor.personId
      && p.role === "party" && p.consent === "pending");
    if (!mine) throw new ModuleError("This introduction is not awaiting your response.");
    mine.consent = decision;
    mine.contact = decision === "accepted" ? contact.trim() : "";
    mine.respondedAt = new Date();
    if (decision === "accepted") {
      const others = this.world.participants.filter(p => p.introductionId === introductionId && p.role === "party"
        && p.consent === "accepted" && p.personId !== actor.personId);
      for (const other of others) {
        const [low, high] = pair(actor.personId, other.personId);
        if (!this.world.connections.some(c => c.personLow === low && c.personHigh === high)) {
          this.world.connections.push({ personLow: low, personHigh: high, status: "active", introductionId, createdAt: new Date() });
        }
      }
    }
    return { status: decision };
  }

  async withdrawIntroduction(actor: ModuleActor, introductionId: string) {
    const intro = this.world.introductions.find(i => i.id === introductionId && i.createdBy === actor.personId && i.status === "pending");
    if (!intro) throw new ModuleError("You cannot withdraw this introduction.");
    intro.status = "withdrawn";
  }

  async readIntroductions(actor: ModuleActor) {
    const mineIds = new Set(this.world.participants.filter(p => p.personId === actor.personId).map(p => p.introductionId));
    const introductions = this.world.introductions
      .filter(i => mineIds.has(i.id))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map(i => {
        const roster = this.world.participants.filter(p => p.introductionId === i.id);
        const myConsent = roster.find(p => p.personId === actor.personId)?.consent ?? "pending";
        const myRole = roster.find(p => p.personId === actor.personId)?.role ?? "party";
        return { id: i.id, communityId: i.communityId, createdBy: i.createdBy, message: i.message,
          status: this.effectiveStatus(i, roster.filter(p => p.role === "party")), createdAt: i.createdAt,
          mine: i.createdBy === actor.personId, myRole, myConsent,
          participants: roster.map(p => ({ personId: p.personId, name: this.world.people.get(p.personId)?.name ?? "",
            role: p.role, consent: p.consent,
            contact: (p.personId === actor.personId || (myConsent === "accepted" && p.consent === "accepted")) ? p.contact : "" })) };
      });
    return { introductions };
  }

  async readConnections(actor: ModuleActor) {
    const connections = this.world.connections
      .filter(c => (c.personLow === actor.personId || c.personHigh === actor.personId) && c.status === "active")
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map(c => {
        const other = c.personLow === actor.personId ? c.personHigh : c.personLow;
        return { personId: other, name: this.world.people.get(other)?.name ?? "", since: c.createdAt, introductionId: c.introductionId };
      });
    return { connections };
  }

  async addRelationshipNote(actor: ModuleActor, aboutPersonId: string, body: string) {
    if (!body?.trim() || body.length > 5000) throw new ModuleError("Invalid note.");
    if (aboutPersonId === actor.personId) throw new ModuleError("A note must be about someone else.");
    if (!this.isConnected(actor.personId, aboutPersonId)) throw new ModuleError("You can only note a connection.");
    const note = { id: crypto.randomUUID(), ownerId: actor.personId, aboutPersonId, body: body.trim(), updatedAt: new Date() };
    this.world.notes.push(note);
    return { id: note.id };
  }

  async updateRelationshipNote(actor: ModuleActor, noteId: string, body: string) {
    if (!body?.trim() || body.length > 5000) throw new ModuleError("Invalid note.");
    const note = this.world.notes.find(n => n.id === noteId && n.ownerId === actor.personId);
    if (!note) throw new ModuleError("You cannot edit this note.");
    note.body = body.trim();
    note.updatedAt = new Date();
  }

  async readRelationshipNotes(actor: ModuleActor, aboutPersonId: string) {
    const notes = this.world.notes
      .filter(n => n.ownerId === actor.personId && n.aboutPersonId === aboutPersonId)
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      .map(n => ({ id: n.id, aboutPersonId: n.aboutPersonId, body: n.body, updatedAt: n.updatedAt }));
    return { notes };
  }

  async createReferral(actor: ModuleActor, input: ReferralInput) {
    const need = input.need ?? "";
    const note = input.note ?? "";
    if (need.length > 2000) throw new ModuleError("Invalid need.");
    if (note.length > 2000) throw new ModuleError("Invalid note.");
    if (input.toPersonId === actor.personId) throw new ModuleError("A referral must go to someone else.");
    if (!this.activeMember(actor.personId, input.communityId) || !this.activeMember(input.toPersonId, input.communityId)) {
      throw new ModuleError("Both people must be members of this community.");
    }
    if (!this.isConnected(actor.personId, input.toPersonId)) throw new ModuleError("You can only refer a connection.");
    const referral = { id: crypto.randomUUID(), communityId: input.communityId, fromPersonId: actor.personId,
      toPersonId: input.toPersonId, need: need.trim(), note: note.trim(), status: "sent" as const,
      createdAt: new Date(), closedAt: null };
    this.world.referrals.push(referral);
    return { id: referral.id };
  }

  async updateReferralOutcome(actor: ModuleActor, referralId: string, status: ReferralOutcome) {
    if (!["won", "not_won"].includes(status)) throw new ModuleError("Invalid status.");
    const referral = this.world.referrals.find(r => r.id === referralId && r.toPersonId === actor.personId && r.status === "sent");
    if (!referral) throw new ModuleError("You cannot update this referral.");
    referral.status = status;
    referral.closedAt = new Date();
  }

  async readReferrals(actor: ModuleActor) {
    const referrals = this.world.referrals
      .filter(r => r.fromPersonId === actor.personId || r.toPersonId === actor.personId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map(r => ({ id: r.id, communityId: r.communityId, fromPersonId: r.fromPersonId,
        fromName: this.world.people.get(r.fromPersonId)?.name ?? "", toPersonId: r.toPersonId,
        toName: this.world.people.get(r.toPersonId)?.name ?? "", need: r.need, note: r.note, status: r.status,
        points: referralPointsForStatus(r.status), createdAt: r.createdAt, closedAt: r.closedAt,
        direction: r.fromPersonId === actor.personId ? "given" : "received" }));
    return { referrals };
  }
}
