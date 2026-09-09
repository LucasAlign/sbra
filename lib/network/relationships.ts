import { and, asc, desc, eq, inArray, ne, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as fullSchema from "../db/schema";
import * as s from "../db/network-schema";
import { withActor } from "../db/context";
import { boundedText } from "./identity";

type Database = PostgresJsDatabase<typeof fullSchema>;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

// Introductions, connections & referrals (M6): member-driven relationships.
//
// An introduction names participants who each consent; a participant's contact is
// exchanged only once they accept. When parties accept they become connections
// (a canonical low<high pair, one row). Each person keeps private relationship
// notes about their connections. Referrals ride on connections and their
// financial detail stays with the two parties — no community projection, no
// leaderboards. All of this is also enforced by row-level security (0012).

function pair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

// Membership of an ARBITRARY person: naming other people requires checking THEIR
// membership, which the per-person RLS on person_community_memberships hides from
// the actor. This goes through the SECURITY DEFINER helper, which bypasses RLS for
// the one existence read (the actor could not otherwise see a peer's membership).
async function isActiveMember(tx: Transaction, personId: string, communityId: string): Promise<boolean> {
  const rows = await tx.execute(sql`select collab_person_is_active_member(${personId}, ${communityId}) as ok`);
  return !!(rows as unknown as { ok: boolean }[])[0]?.ok;
}

async function isConnected(tx: Transaction, a: string, b: string): Promise<boolean> {
  const [low, high] = pair(a, b);
  const [row] = await tx.select({ low: s.connections.personLow }).from(s.connections).where(and(
    eq(s.connections.personLow, low), eq(s.connections.personHigh, high), eq(s.connections.status, "active")));
  return !!row;
}

// --- Introductions ----------------------------------------------------------

export type IntroductionInput = {
  communityId: string; partyIds: string[]; message?: string; contact?: string; asParty?: boolean;
};

export async function requestIntroduction(db: Database, personId: string, input: IntroductionInput) {
  const communityId = boundedText(input.communityId, 200);
  const message = input.message ?? "";
  const contact = input.contact ?? "";
  if (typeof message !== "string" || message.length > 2000) throw new Error("Invalid message.");
  if (typeof contact !== "string" || contact.length > 500) throw new Error("Invalid contact.");
  const partyIds = Array.from(new Set((input.partyIds ?? []).map(id => boundedText(id, 200))));
  if (!partyIds.length) throw new Error("Name at least one person to introduce.");
  if (partyIds.length > 20) throw new Error("Too many people for one introduction.");
  if (partyIds.includes(personId)) throw new Error("You are already part of this introduction.");
  const asParty = input.asParty !== false; // default: the initiator is a party too
  return withActor(db, personId, async tx => {
    if (!(await isActiveMember(tx, personId, communityId))) throw new Error("This community is not available to your account.");
    // Every named party must be an active member of the same community.
    for (const partyId of partyIds) {
      if (!(await isActiveMember(tx, partyId, communityId))) throw new Error("Everyone in an introduction must be a member of the community.");
    }
    const introduction = { id: crypto.randomUUID(), communityId, createdBy: personId, message: message.trim() };
    await tx.insert(s.introductions).values(introduction);
    // The initiator is recorded accepted (they initiated). If they take part they
    // are a 'party' and provide their contact; otherwise a facilitating 'introducer'.
    await tx.insert(s.introductionParticipants).values({ introductionId: introduction.id, personId,
      role: asParty ? "party" : "introducer", consent: "accepted", contact: asParty ? contact.trim() : "", respondedAt: sql`now()` });
    await tx.insert(s.introductionParticipants).values(partyIds.map(partyId => ({
      introductionId: introduction.id, personId: partyId, role: "party" as const, consent: "pending" as const })));
    return { id: introduction.id };
  });
}

export async function respondToIntroduction(db: Database, personId: string, introductionId: string, decision: "accepted" | "declined", contact = "") {
  boundedText(introductionId, 200);
  if (decision !== "accepted" && decision !== "declined") throw new Error("Invalid decision.");
  if (typeof contact !== "string" || contact.length > 500) throw new Error("Invalid contact.");
  return withActor(db, personId, async tx => {
    const [intro] = await tx.select({ status: s.introductions.status }).from(s.introductions)
      .where(eq(s.introductions.id, introductionId));
    if (!intro) throw new Error("Introduction unavailable.");
    if (intro.status === "withdrawn") throw new Error("This introduction is no longer open.");
    // Only a pending party may respond, and only to their own participant row.
    const updated = await tx.update(s.introductionParticipants)
      .set({ consent: decision, contact: decision === "accepted" ? contact.trim() : "", respondedAt: sql`now()` })
      .where(and(eq(s.introductionParticipants.introductionId, introductionId), eq(s.introductionParticipants.personId, personId),
        eq(s.introductionParticipants.role, "party"), eq(s.introductionParticipants.consent, "pending")))
      .returning({ personId: s.introductionParticipants.personId });
    if (!updated.length) throw new Error("This introduction is not awaiting your response.");
    if (decision === "accepted") {
      // Connect to every other party who has already accepted. Each new row
      // includes the actor, so it passes the connection write policy.
      const others = await tx.select({ personId: s.introductionParticipants.personId }).from(s.introductionParticipants)
        .where(and(eq(s.introductionParticipants.introductionId, introductionId), eq(s.introductionParticipants.role, "party"),
          eq(s.introductionParticipants.consent, "accepted"), ne(s.introductionParticipants.personId, personId)));
      for (const other of others) {
        const [low, high] = pair(personId, other.personId);
        await tx.insert(s.connections).values({ personLow: low, personHigh: high, introductionId })
          .onConflictDoNothing({ target: [s.connections.personLow, s.connections.personHigh] });
      }
    }
    return { status: decision };
  });
}

export async function withdrawIntroduction(db: Database, personId: string, introductionId: string) {
  boundedText(introductionId, 200);
  const changed = await withActor(db, personId, tx => tx.update(s.introductions).set({ status: "withdrawn" })
    .where(and(eq(s.introductions.id, introductionId), eq(s.introductions.createdBy, personId), eq(s.introductions.status, "pending")))
    .returning({ id: s.introductions.id }));
  if (!changed.length) throw new Error("You cannot withdraw this introduction.");
}

// Effective status: a withdrawn intro stays withdrawn; otherwise it is declined if
// any party declined, accepted once every party has accepted, else pending.
function effectiveStatus(stored: string, parties: { consent: string }[]): string {
  if (stored === "withdrawn") return "withdrawn";
  if (parties.some(p => p.consent === "declined")) return "declined";
  if (parties.length && parties.every(p => p.consent === "accepted")) return "accepted";
  return "pending";
}

export async function readIntroductions(db: Database, personId: string) {
  return withActor(db, personId, async tx => {
    const me = alias(s.introductionParticipants, "my_participation");
    const rows = await tx.select({ id: s.introductions.id, communityId: s.introductions.communityId,
      createdBy: s.introductions.createdBy, message: s.introductions.message, stored: s.introductions.status,
      createdAt: s.introductions.createdAt, myRole: me.role, myConsent: me.consent })
      .from(s.introductions)
      .innerJoin(me, and(eq(me.introductionId, s.introductions.id), eq(me.personId, personId)))
      .orderBy(desc(s.introductions.createdAt)).limit(200);
    if (!rows.length) return { introductions: [] };
    const ids = rows.map(r => r.id);
    const parts = await tx.select({ introductionId: s.introductionParticipants.introductionId,
      personId: s.introductionParticipants.personId, name: s.people.name, role: s.introductionParticipants.role,
      consent: s.introductionParticipants.consent, contact: s.introductionParticipants.contact })
      .from(s.introductionParticipants).innerJoin(s.people, eq(s.people.id, s.introductionParticipants.personId))
      .where(inArray(s.introductionParticipants.introductionId, ids));
    const introductions = rows.map(r => {
      const roster = parts.filter(p => p.introductionId === r.id);
      const partyConsents = roster.filter(p => p.role === "party");
      return { id: r.id, communityId: r.communityId, createdBy: r.createdBy, message: r.message,
        status: effectiveStatus(r.stored, partyConsents), createdAt: r.createdAt,
        mine: r.createdBy === personId, myRole: r.myRole, myConsent: r.myConsent,
        participants: roster.map(p => ({ personId: p.personId, name: p.name, role: p.role, consent: p.consent,
          // Contact is shared only after acceptance: you see your own always, and a
          // co-participant's only once you both have accepted.
          contact: (p.personId === personId || (r.myConsent === "accepted" && p.consent === "accepted")) ? p.contact : "" })) };
    });
    return { introductions };
  });
}

// --- Connections & notes ----------------------------------------------------

export async function readConnections(db: Database, personId: string) {
  return withActor(db, personId, async tx => {
    const rows = await tx.select({ low: s.connections.personLow, high: s.connections.personHigh,
      introductionId: s.connections.introductionId, createdAt: s.connections.createdAt }).from(s.connections)
      .where(and(or(eq(s.connections.personLow, personId), eq(s.connections.personHigh, personId)), eq(s.connections.status, "active")))
      .orderBy(desc(s.connections.createdAt)).limit(500);
    if (!rows.length) return { connections: [] };
    const otherIds = rows.map(r => (r.low === personId ? r.high : r.low));
    const names = await tx.select({ id: s.people.id, name: s.people.name }).from(s.people).where(inArray(s.people.id, otherIds));
    const nameOf = new Map(names.map(n => [n.id, n.name]));
    const connections = rows.map(r => {
      const other = r.low === personId ? r.high : r.low;
      return { personId: other, name: nameOf.get(other) ?? "", since: r.createdAt, introductionId: r.introductionId };
    });
    return { connections };
  });
}

export async function addRelationshipNote(db: Database, personId: string, aboutPersonId: string, body: string) {
  boundedText(aboutPersonId, 200);
  const text = boundedText(body, 5000);
  if (aboutPersonId === personId) throw new Error("A note must be about someone else.");
  return withActor(db, personId, async tx => {
    // Notes are kept about people you are connected to.
    if (!(await isConnected(tx, personId, aboutPersonId))) throw new Error("You can only note a connection.");
    const note = { id: crypto.randomUUID(), ownerId: personId, aboutPersonId, body: text };
    await tx.insert(s.relationshipNotes).values(note);
    return { id: note.id };
  });
}

export async function updateRelationshipNote(db: Database, personId: string, noteId: string, body: string) {
  boundedText(noteId, 200);
  const text = boundedText(body, 5000);
  const changed = await withActor(db, personId, tx => tx.update(s.relationshipNotes)
    .set({ body: text, updatedAt: sql`now()` })
    .where(and(eq(s.relationshipNotes.id, noteId), eq(s.relationshipNotes.ownerId, personId)))
    .returning({ id: s.relationshipNotes.id }));
  if (!changed.length) throw new Error("You cannot edit this note.");
}

export async function readRelationshipNotes(db: Database, personId: string, aboutPersonId: string) {
  boundedText(aboutPersonId, 200);
  // RLS restricts these to the owner regardless of the filter.
  return withActor(db, personId, async tx => {
    const notes = await tx.select({ id: s.relationshipNotes.id, aboutPersonId: s.relationshipNotes.aboutPersonId,
      body: s.relationshipNotes.body, updatedAt: s.relationshipNotes.updatedAt }).from(s.relationshipNotes)
      .where(and(eq(s.relationshipNotes.ownerId, personId), eq(s.relationshipNotes.aboutPersonId, aboutPersonId)))
      .orderBy(desc(s.relationshipNotes.updatedAt)).limit(200);
    return { notes };
  });
}

// --- Referrals --------------------------------------------------------------

export type ReferralInput = { communityId: string; toPersonId: string; need?: string; note?: string };

export async function createReferral(db: Database, personId: string, input: ReferralInput) {
  const communityId = boundedText(input.communityId, 200);
  const toPersonId = boundedText(input.toPersonId, 200);
  const need = input.need ?? "";
  const note = input.note ?? "";
  if (typeof need !== "string" || need.length > 2000) throw new Error("Invalid need.");
  if (typeof note !== "string" || note.length > 2000) throw new Error("Invalid note.");
  if (toPersonId === personId) throw new Error("A referral must go to someone else.");
  return withActor(db, personId, async tx => {
    if (!(await isActiveMember(tx, personId, communityId)) || !(await isActiveMember(tx, toPersonId, communityId))) {
      throw new Error("Both people must be members of this community.");
    }
    // Referrals ride on an existing connection between the two members.
    if (!(await isConnected(tx, personId, toPersonId))) throw new Error("You can only refer a connection.");
    const referral = { id: crypto.randomUUID(), communityId, fromPersonId: personId, toPersonId, need: need.trim(), note: note.trim() };
    await tx.insert(s.memberReferrals).values(referral);
    return { id: referral.id };
  });
}

export async function updateReferralOutcome(db: Database, personId: string, referralId: string, status: "open" | "closed" | "declined", closedValue?: number | null) {
  boundedText(referralId, 200);
  if (!["open", "closed", "declined"].includes(status)) throw new Error("Invalid status.");
  let value: string | null = null;
  if (status === "closed" && closedValue !== undefined && closedValue !== null) {
    if (typeof closedValue !== "number" || !Number.isFinite(closedValue) || closedValue < 0) throw new Error("Invalid closed value.");
    value = closedValue.toFixed(2);
  }
  const set = { status, closedValue: status === "closed" ? value : null,
    closedAt: status === "closed" ? sql`now()` : null };
  const changed = await withActor(db, personId, tx => tx.update(s.memberReferrals).set(set)
    .where(and(eq(s.memberReferrals.id, referralId),
      or(eq(s.memberReferrals.fromPersonId, personId), eq(s.memberReferrals.toPersonId, personId))))
    .returning({ id: s.memberReferrals.id }));
  if (!changed.length) throw new Error("You cannot update this referral.");
}

export async function readReferrals(db: Database, personId: string) {
  return withActor(db, personId, async tx => {
    const fromP = alias(s.people, "referral_from");
    const toP = alias(s.people, "referral_to");
    const rows = await tx.select({ id: s.memberReferrals.id, communityId: s.memberReferrals.communityId,
      fromPersonId: s.memberReferrals.fromPersonId, fromName: fromP.name, toPersonId: s.memberReferrals.toPersonId, toName: toP.name,
      need: s.memberReferrals.need, note: s.memberReferrals.note, status: s.memberReferrals.status, closedValue: s.memberReferrals.closedValue,
      createdAt: s.memberReferrals.createdAt, closedAt: s.memberReferrals.closedAt }).from(s.memberReferrals)
      .innerJoin(fromP, eq(fromP.id, s.memberReferrals.fromPersonId)).innerJoin(toP, eq(toP.id, s.memberReferrals.toPersonId))
      .where(or(eq(s.memberReferrals.fromPersonId, personId), eq(s.memberReferrals.toPersonId, personId)))
      .orderBy(desc(s.memberReferrals.createdAt)).limit(200);
    const referrals = rows.map(r => ({ ...r, direction: r.fromPersonId === personId ? "given" : "received" }));
    return { referrals };
  });
}
