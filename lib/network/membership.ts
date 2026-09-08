import { and, asc, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as fullSchema from "../db/schema";
import * as s from "../db/network-schema";
import { setActor, withActor } from "../db/context";
import { boundedText } from "./identity";

type Database = PostgresJsDatabase<typeof fullSchema>;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export function communityAdminAccess(personId: string, communityId: string | typeof s.communities.id) {
  // Preserve the outer qualification even when Drizzle simplifies columns in
  // a single-table SELECT projection.
  const scope = typeof communityId === "string" ? sql`${communityId}` : sql`"communities"."id"`;
  return sql<boolean>`exists (select 1 from ${s.personCommunityMemberships} m
    join ${s.roleGrants} g on g.person_id = m.person_id and g.community_id = m.community_id
    join ${s.communities} c on c.id = m.community_id
    where m.person_id = ${personId} and m.community_id = ${scope}
      and m.status = 'active' and c.status = 'active' and g.role = 'community_admin'
      and g.revoked_at is null and (g.expires_at is null or g.expires_at > now()))`;
}

async function lockCommunity(tx: Transaction, communityId: string) {
  boundedText(communityId, 200);
  const [community] = await tx.select({ id: s.communities.id }).from(s.communities)
    .where(and(eq(s.communities.id, communityId), eq(s.communities.status, "active"))).for("update");
  if (!community) throw new Error("Community unavailable.");
}

async function requireAdmin(tx: Transaction, personId: string, communityId: string) {
  // Lock membership and qualifying grants so a concurrent revocation cannot
  // finish between authorization and mutation. Community locks serialize peers.
  const rows = await tx.select({ id: s.roleGrants.id }).from(s.personCommunityMemberships)
    .innerJoin(s.roleGrants, and(eq(s.roleGrants.personId, s.personCommunityMemberships.personId),
      eq(s.roleGrants.communityId, s.personCommunityMemberships.communityId)))
    .where(and(eq(s.personCommunityMemberships.personId, personId),
      eq(s.personCommunityMemberships.communityId, communityId), eq(s.personCommunityMemberships.status, "active"),
      eq(s.roleGrants.role, "community_admin"), isNull(s.roleGrants.revokedAt),
      sql`(${s.roleGrants.expiresAt} is null or ${s.roleGrants.expiresAt} > now())`)).for("update");
  if (!rows.length) throw new Error("Community administration is not available to your account.");
}

async function audit(tx: Transaction, communityId: string, actorId: string, targetId: string, action: string) {
  await tx.insert(s.membershipAudit).values({ id: crypto.randomUUID(), communityId, actorId, targetId, action });
}

export async function invitePerson(db: Database, actorId: string, communityId: string, recipientId: string) {
  boundedText(recipientId, 200);
  return db.transaction(async tx => {
    await setActor(tx, actorId);
    await lockCommunity(tx, communityId); await requireAdmin(tx, actorId, communityId);
    // Only a person with a verified provider identity can receive an invitation.
    const [recipient] = await tx.select({ id: s.personIdentities.personId }).from(s.personIdentities)
      .where(eq(s.personIdentities.personId, recipientId)).limit(1);
    if (!recipient) throw new Error("Check the recipient's Collab account ID.");
    const [membership] = await tx.select().from(s.personCommunityMemberships)
      .where(and(eq(s.personCommunityMemberships.personId, recipientId), eq(s.personCommunityMemberships.communityId, communityId))).for("update");
    if (membership?.status === "active" || membership?.status === "suspended") throw new Error("This account already has a membership. Manage it in the roster.");
    const [pending] = await tx.select({ id: s.communityInvitations.id }).from(s.communityInvitations)
      .where(and(eq(s.communityInvitations.communityId, communityId), eq(s.communityInvitations.recipientId, recipientId),
        isNull(s.communityInvitations.acceptedAt), isNull(s.communityInvitations.revokedAt), gt(s.communityInvitations.expiresAt, sql`now()`)));
    if (pending) return pending;
    const invitation = { id: crypto.randomUUID(), communityId, recipientId, issuedBy: actorId,
      expiresAt: sql`now() + interval '7 days'` };
    await tx.insert(s.communityInvitations).values(invitation);
    await audit(tx, communityId, actorId, recipientId, "invitation.created");
    return { id: invitation.id };
  });
}

export async function acceptInvitation(db: Database, personId: string, invitationId: string) {
  boundedText(invitationId, 200);
  return db.transaction(async tx => {
    await setActor(tx, personId);
    const [reference] = await tx.select({ communityId: s.communityInvitations.communityId }).from(s.communityInvitations)
      .where(and(eq(s.communityInvitations.id, invitationId), eq(s.communityInvitations.recipientId, personId)));
    if (!reference) throw new Error("Invitation unavailable.");
    await lockCommunity(tx, reference.communityId);
    const [invitation] = await tx.select().from(s.communityInvitations).where(and(eq(s.communityInvitations.id, invitationId),
      eq(s.communityInvitations.recipientId, personId), isNull(s.communityInvitations.revokedAt),
      isNull(s.communityInvitations.acceptedAt), gt(s.communityInvitations.expiresAt, sql`now()`))).for("update");
    if (!invitation) throw new Error("Invitation unavailable or expired.");
    // The accepter (whose actor context is set) must confirm the issuer is still
    // an admin, but row-level security hides the issuer's grants from a
    // non-admin. This SECURITY DEFINER helper performs the same lock-and-check as
    // requireAdmin for the issuer, bypassing RLS for that integrity read only.
    const issuerCheck = await tx.execute(
      sql`select collab_person_is_admin_locked(${invitation.issuedBy}, ${invitation.communityId}) as ok`);
    if (!(issuerCheck as unknown as { ok: boolean }[])[0]?.ok) throw new Error("Invitation unavailable or expired.");
    const [membership] = await tx.select().from(s.personCommunityMemberships).where(and(
      eq(s.personCommunityMemberships.personId, personId), eq(s.personCommunityMemberships.communityId, invitation.communityId))).for("update");
    if (membership?.status === "suspended") throw new Error("Contact the community administrator to restore your membership.");
    await tx.insert(s.personCommunityMemberships).values({ personId, communityId: invitation.communityId, status: "active" })
      .onConflictDoUpdate({ target: [s.personCommunityMemberships.personId, s.personCommunityMemberships.communityId], set: { status: "active" } });
    await tx.update(s.communityInvitations).set({ acceptedAt: sql`now()` }).where(eq(s.communityInvitations.id, invitationId));
    await audit(tx, invitation.communityId, personId, personId, "invitation.accepted");
    return { communityId: invitation.communityId };
  });
}

export async function revokeInvitation(db: Database, actorId: string, communityId: string, invitationId: string) {
  boundedText(invitationId, 200);
  await db.transaction(async tx => {
    await setActor(tx, actorId);
    await lockCommunity(tx, communityId); await requireAdmin(tx, actorId, communityId);
    const [invitation] = await tx.update(s.communityInvitations).set({ revokedAt: sql`now()` }).where(and(
      eq(s.communityInvitations.id, invitationId), eq(s.communityInvitations.communityId, communityId),
      isNull(s.communityInvitations.acceptedAt), isNull(s.communityInvitations.revokedAt))).returning();
    if (!invitation) throw new Error("Invitation unavailable.");
    await audit(tx, communityId, actorId, invitation.recipientId, "invitation.revoked");
  });
}

export async function changeMembership(db: Database, actorId: string, communityId: string, personId: string, status: "active" | "suspended") {
  boundedText(personId, 200);
  if (status !== "active" && status !== "suspended") throw new Error("Invalid membership status.");
  await db.transaction(async tx => {
    await setActor(tx, actorId);
    await lockCommunity(tx, communityId); await requireAdmin(tx, actorId, communityId);
    // This workflow manages members, not administrative appointments. It cannot
    // strand a community by suspending its final admin or resurrect old grants.
    const grants = await tx.select({ id: s.roleGrants.id }).from(s.roleGrants).where(and(
      eq(s.roleGrants.personId, personId), eq(s.roleGrants.communityId, communityId),
      eq(s.roleGrants.role, "community_admin"), isNull(s.roleGrants.revokedAt))).for("update");
    if (grants.length) throw new Error("Administrator memberships require a separate administrator transfer.");
    const [changed] = await tx.update(s.personCommunityMemberships).set({ status }).where(and(
      eq(s.personCommunityMemberships.personId, personId), eq(s.personCommunityMemberships.communityId, communityId),
      eq(s.personCommunityMemberships.status, status === "active" ? "suspended" : "active"))).returning();
    if (!changed) throw new Error("Membership is not eligible for this change.");
    if (status === "suspended") await tx.update(s.communityInvitations).set({ revokedAt: sql`now()` }).where(and(
      eq(s.communityInvitations.communityId, communityId), eq(s.communityInvitations.recipientId, personId),
      isNull(s.communityInvitations.acceptedAt), isNull(s.communityInvitations.revokedAt)));
    await audit(tx, communityId, actorId, personId, status === "active" ? "membership.restored" : "membership.suspended");
  });
}

export async function transferAdministrator(db: Database, actorId: string, communityId: string, successorId: string) {
  boundedText(successorId, 200);
  if (successorId === actorId) throw new Error("Choose a different member to receive administration.");
  await db.transaction(async tx => {
    await setActor(tx, actorId);
    // The community lock serializes admin operations; requireAdmin confirms the
    // initiator still holds an unexpired grant under that lock.
    await lockCommunity(tx, communityId); await requireAdmin(tx, actorId, communityId);
    // The successor must already be an active member of this community. Locking
    // their row prevents a concurrent suspension from racing the appointment.
    const [membership] = await tx.select({ status: s.personCommunityMemberships.status })
      .from(s.personCommunityMemberships).where(and(
        eq(s.personCommunityMemberships.personId, successorId),
        eq(s.personCommunityMemberships.communityId, communityId))).for("update");
    if (membership?.status !== "active") throw new Error("The successor must be an active member of this community.");
    // Grant the successor an admin role before revoking the initiator's, so the
    // community is never left without an administrator. Skip if they already hold one.
    const [existing] = await tx.select({ id: s.roleGrants.id }).from(s.roleGrants).where(and(
      eq(s.roleGrants.personId, successorId), eq(s.roleGrants.communityId, communityId),
      eq(s.roleGrants.role, "community_admin"), isNull(s.roleGrants.revokedAt))).for("update");
    if (!existing) await tx.insert(s.roleGrants).values({ id: crypto.randomUUID(), personId: successorId,
      communityId, role: "community_admin", grantedBy: actorId });
    // Revoke the initiator's active community_admin grant(s) for this community.
    await tx.update(s.roleGrants).set({ revokedAt: sql`now()` }).where(and(
      eq(s.roleGrants.personId, actorId), eq(s.roleGrants.communityId, communityId),
      eq(s.roleGrants.role, "community_admin"), isNull(s.roleGrants.revokedAt)));
    await audit(tx, communityId, actorId, successorId, "administrator.transferred");
  });
}

export async function readAudit(db: Database, actorId: string, communityId: string) {
  boundedText(communityId, 200);
  // Read-only and scoped: only an active administrator of an active community may
  // view its audit trail. Runs under the actor context so RLS independently
  // restricts the audit rows to this community's administrators.
  return withActor(db, actorId, async tx => {
    const [allowed] = await tx.select({ ok: communityAdminAccess(actorId, communityId) })
      .from(s.communities).where(and(eq(s.communities.id, communityId), eq(s.communities.status, "active")));
    if (!allowed?.ok) throw new Error("The audit log is not available to your account.");
    const actor = alias(s.people, "audit_actor");
    const target = alias(s.people, "audit_target");
    const entries = await tx.select({ id: s.membershipAudit.id, action: s.membershipAudit.action,
      createdAt: s.membershipAudit.createdAt, actorName: actor.name, targetName: target.name })
      .from(s.membershipAudit)
      .leftJoin(actor, eq(actor.id, s.membershipAudit.actorId))
      .innerJoin(target, eq(target.id, s.membershipAudit.targetId))
      .where(eq(s.membershipAudit.communityId, communityId))
      .orderBy(desc(s.membershipAudit.createdAt), desc(s.membershipAudit.id)).limit(100);
    return { entries };
  });
}

export async function readMembershipAdmin(db: Database, actorId: string, communityId: string, after?: string) {
  boundedText(communityId, 200); if (after !== undefined) boundedText(after, 200);
  // Hold authority locks through all projections to prevent partial data on revocation.
  return db.transaction(async tx => {
    await setActor(tx, actorId);
    await lockCommunity(tx, communityId); await requireAdmin(tx, actorId, communityId);
    const members = await tx.select({ id: s.people.id, name: s.people.name, status: s.personCommunityMemberships.status,
      administrator: sql<boolean>`exists (select 1 from ${s.roleGrants} g where g.person_id = ${s.people.id}
        and g.community_id = ${communityId} and g.role = 'community_admin' and g.revoked_at is null)` })
      .from(s.personCommunityMemberships).innerJoin(s.people, eq(s.people.id, s.personCommunityMemberships.personId))
      .where(and(eq(s.personCommunityMemberships.communityId, communityId), after ? gt(s.people.id, after) : undefined))
      .orderBy(asc(s.people.id)).limit(26);
    const invitations = await tx.select({ id: s.communityInvitations.id, recipientId: s.communityInvitations.recipientId,
      name: s.people.name, expiresAt: s.communityInvitations.expiresAt }).from(s.communityInvitations)
      .innerJoin(s.people, eq(s.people.id, s.communityInvitations.recipientId)).where(and(
        eq(s.communityInvitations.communityId, communityId), isNull(s.communityInvitations.acceptedAt),
        isNull(s.communityInvitations.revokedAt), gt(s.communityInvitations.expiresAt, sql`now()`)))
      .orderBy(asc(s.communityInvitations.createdAt)).limit(100);
    return { members: members.slice(0, 25), nextCursor: members.length > 25 ? members[24].id : null, invitations };
  });
}
