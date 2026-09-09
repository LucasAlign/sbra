import { and, asc, eq, isNull, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as fullSchema from "../db/schema";
import * as s from "../db/network-schema";
import { withActor } from "../db/context";
import { boundedText } from "./identity";
import { communityAdminAccess } from "./membership";

type Database = PostgresJsDatabase<typeof fullSchema>;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

// Verified business claiming (operator vouch). A signed-in member asks to
// represent a business listed in a community; the community admin decides.
// Approval atomically grants Business Admin + an active affiliation, so authority
// only ever comes from a human vouch — never from an import assigning ownership.

function activeMember(personId: string, communityId: string) {
  return sql`exists (select 1 from ${s.personCommunityMemberships} m
    join ${s.communities} c on c.id = m.community_id
    where m.person_id = ${personId} and m.community_id = ${communityId}
      and m.status = 'active' and c.status = 'active')`;
}

async function auditClaim(tx: Transaction, communityId: string, actorId: string, targetId: string, action: string) {
  await tx.insert(s.membershipAudit).values({ id: crypto.randomUUID(), communityId, actorId, targetId, action });
}

export async function requestClaim(db: Database, personId: string, organizationId: string, communityId: string, evidence: string) {
  boundedText(organizationId, 200); boundedText(communityId, 200);
  if (typeof evidence !== "string" || evidence.length > 2000) throw new Error("Add a short note describing your connection to this business.");
  return withActor(db, personId, async tx => {
    // The claimant must be an active member of the community, and the business
    // must be an active listing in it — you can only claim what's in front of you.
    const [listed] = await tx.select({ id: s.organizations.id }).from(s.organizations)
      .innerJoin(s.organizationCommunityMemberships, and(
        eq(s.organizationCommunityMemberships.organizationId, s.organizations.id),
        eq(s.organizationCommunityMemberships.communityId, communityId),
        eq(s.organizationCommunityMemberships.status, "active")))
      .where(and(eq(s.organizations.id, organizationId), activeMember(personId, communityId)));
    if (!listed) throw new Error("This business is not listed in this community.");
    // One open claim per person + business + community (the partial unique index
    // is the race backstop; this pre-check avoids aborting the transaction).
    const [pending] = await tx.select({ id: s.claimRequests.id }).from(s.claimRequests).where(and(
      eq(s.claimRequests.personId, personId), eq(s.claimRequests.organizationId, organizationId),
      eq(s.claimRequests.communityId, communityId), eq(s.claimRequests.status, "pending")));
    if (pending) return { id: pending.id };
    const claim = { id: crypto.randomUUID(), personId, organizationId, communityId, evidence: evidence.trim() };
    await tx.insert(s.claimRequests).values(claim);
    await auditClaim(tx, communityId, personId, personId, "claim.requested");
    return { id: claim.id };
  });
}

export async function reviewClaim(db: Database, actorId: string, claimId: string, decision: "approved" | "rejected", note = "") {
  boundedText(claimId, 200);
  if (decision !== "approved" && decision !== "rejected") throw new Error("Invalid decision.");
  if (typeof note !== "string" || note.length > 2000) throw new Error("Invalid note.");
  await withActor(db, actorId, async tx => {
    const [claim] = await tx.select().from(s.claimRequests)
      .where(and(eq(s.claimRequests.id, claimId), eq(s.claimRequests.status, "pending"))).for("update");
    if (!claim) throw new Error("Claim unavailable.");
    // The reviewer must be an active administrator of the claim's community.
    const [allowed] = await tx.select({ ok: communityAdminAccess(actorId, claim.communityId) })
      .from(s.communities).where(and(eq(s.communities.id, claim.communityId), eq(s.communities.status, "active")));
    if (!allowed?.ok) throw new Error("This claim is not available to your account.");
    if (decision === "approved") {
      // Operator vouch is a check on someone else — an admin cannot vouch for
      // their own claim; a second administrator must.
      if (claim.personId === actorId) throw new Error("Another administrator must approve your own claim.");
      // Grant Business Admin + an active affiliation, both idempotent so an
      // approval can be retried without duplicating authority. Update-then-insert
      // rather than upsert: ON CONFLICT DO UPDATE would also require the actor to
      // SELECT the target row, which RLS scopes to its owner — so a vouching admin
      // (not the affiliate) cannot use it. Both statements pass the admin write
      // policies on their own.
      const affiliated = await tx.update(s.organizationAffiliations).set({ status: "active" })
        .where(and(eq(s.organizationAffiliations.personId, claim.personId), eq(s.organizationAffiliations.organizationId, claim.organizationId)))
        .returning({ personId: s.organizationAffiliations.personId });
      if (!affiliated.length) await tx.insert(s.organizationAffiliations)
        .values({ personId: claim.personId, organizationId: claim.organizationId, status: "active" });
      const [existing] = await tx.select({ id: s.roleGrants.id }).from(s.roleGrants).where(and(
        eq(s.roleGrants.personId, claim.personId), eq(s.roleGrants.organizationId, claim.organizationId),
        eq(s.roleGrants.role, "business_admin"), isNull(s.roleGrants.revokedAt)));
      if (!existing) await tx.insert(s.roleGrants).values({ id: crypto.randomUUID(), personId: claim.personId,
        role: "business_admin", organizationId: claim.organizationId, grantedBy: actorId });
    }
    await tx.update(s.claimRequests).set({ status: decision, reviewedBy: actorId, reviewedAt: sql`now()`, decisionNote: note.trim() })
      .where(eq(s.claimRequests.id, claimId));
    await auditClaim(tx, claim.communityId, actorId, claim.personId, decision === "approved" ? "claim.approved" : "claim.rejected");
  });
}

export async function withdrawClaim(db: Database, personId: string, claimId: string) {
  boundedText(claimId, 200);
  await withActor(db, personId, async tx => {
    const [claim] = await tx.update(s.claimRequests).set({ status: "withdrawn", reviewedAt: sql`now()` })
      .where(and(eq(s.claimRequests.id, claimId), eq(s.claimRequests.personId, personId), eq(s.claimRequests.status, "pending")))
      .returning({ communityId: s.claimRequests.communityId });
    if (!claim) throw new Error("Claim unavailable.");
    await auditClaim(tx, claim.communityId, personId, personId, "claim.withdrawn");
  });
}

export async function readClaimRequests(db: Database, actorId: string, communityId: string) {
  boundedText(communityId, 200);
  return withActor(db, actorId, async tx => {
    const [allowed] = await tx.select({ ok: communityAdminAccess(actorId, communityId) })
      .from(s.communities).where(and(eq(s.communities.id, communityId), eq(s.communities.status, "active")));
    if (!allowed?.ok) throw new Error("Claim review is not available to your account.");
    const claims = await tx.select({ id: s.claimRequests.id, personId: s.claimRequests.personId,
      personName: s.people.name, organizationId: s.claimRequests.organizationId, organizationName: s.organizations.name,
      evidence: s.claimRequests.evidence, createdAt: s.claimRequests.createdAt })
      .from(s.claimRequests)
      .innerJoin(s.people, eq(s.people.id, s.claimRequests.personId))
      .innerJoin(s.organizations, eq(s.organizations.id, s.claimRequests.organizationId))
      .where(and(eq(s.claimRequests.communityId, communityId), eq(s.claimRequests.status, "pending")))
      .orderBy(asc(s.claimRequests.createdAt)).limit(100);
    return { claims };
  });
}
