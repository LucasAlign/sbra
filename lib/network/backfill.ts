import { and, eq, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as fullSchema from "../db/schema";
import { businesses, members } from "../db/schema";
import * as s from "../db/network-schema";

type Database = PostgresJsDatabase<typeof fullSchema>;

// Legacy backfill (M8): map deployed prototype rows onto canonical entities.
//
// This is a PRIVILEGED operations path — it runs on the owner connection (which
// bypasses RLS), never the restricted runtime role, exactly like the provisioning
// and seed scripts. It is idempotent: every legacy row it touches is recorded in
// legacy_id_map, and a re-run skips anything already mapped or flagged.
//
// Linkage rules (architecture §M8):
//   * A member maps to a person only via a VERIFIED account (its auth `uid`). A
//     member with no uid is left for manual review — we never fabricate an
//     identity. A uid shared by two rows, or a duplicated/missing email, is a
//     shared-mailbox / ambiguity signal: both rows go to review, never merged into
//     one person.
//   * Legacy admin roles are NOT promoted automatically. `isOwner` becomes an
//     affiliation, never a role grant — admin authority is granted explicitly
//     after review.
//   * A business becomes one canonical organization; its `tier` migrates onto the
//     org's community membership.

export type BackfillOptions = { communityId: string; source: string };
export type BackfillSummary = {
  organizationsMapped: number; peopleMapped: number; needsReview: number; skipped: number;
};

async function alreadyHandled(db: Database, entityType: "person" | "organization", legacyId: string) {
  const [row] = await db.select({ status: s.legacyIdMap.status }).from(s.legacyIdMap)
    .where(and(eq(s.legacyIdMap.entityType, entityType), eq(s.legacyIdMap.legacyId, legacyId)));
  return row?.status;
}

export async function backfillCommunity(db: Database, options: BackfillOptions): Promise<BackfillSummary> {
  const { communityId, source } = options;
  const summary: BackfillSummary = { organizationsMapped: 0, peopleMapped: 0, needsReview: 0, skipped: 0 };

  // The target community must already exist (provisioned separately).
  const [community] = await db.select({ id: s.communities.id }).from(s.communities).where(eq(s.communities.id, communityId));
  if (!community) throw new Error("Target community does not exist.");

  // --- Businesses -> canonical organizations (tier migrates to the membership).
  const legacyBusinesses = await db.select().from(businesses);
  for (const b of legacyBusinesses) {
    if (await alreadyHandled(db, "organization", b.id)) { summary.skipped++; continue; }
    const orgId = crypto.randomUUID();
    const locations = [b.address, b.city].filter(Boolean).join(", ");
    await db.transaction(async tx => {
      await tx.insert(s.organizations).values({ id: orgId, name: b.name, kind: "business",
        description: b.description ?? "", website: b.website ?? "", locations, serviceAreas: b.servicesOffered ?? "" });
      await tx.insert(s.organizationCommunityMemberships).values({ organizationId: orgId, communityId,
        status: "active", tier: b.tier ?? null });
      await tx.insert(s.legacyIdMap).values({ entityType: "organization", legacyId: b.id, canonicalId: orgId, status: "mapped", source });
    });
    summary.organizationsMapped++;
  }

  // --- Members -> canonical people, via verified account linkage.
  const legacyMembers = await db.select().from(members);
  const emailCount = new Map<string, number>();
  const uidCount = new Map<string, number>();
  for (const m of legacyMembers) {
    if (m.email) emailCount.set(m.email, (emailCount.get(m.email) ?? 0) + 1);
    if (m.uid) uidCount.set(m.uid, (uidCount.get(m.uid) ?? 0) + 1);
  }

  for (const m of legacyMembers) {
    if (await alreadyHandled(db, "person", m.id)) { summary.skipped++; continue; }
    const reasons: string[] = [];
    if (!m.uid) reasons.push("no verified account");
    else if ((uidCount.get(m.uid) ?? 0) > 1) reasons.push("shared account");
    if (!m.email) reasons.push("missing email");
    else if ((emailCount.get(m.email) ?? 0) > 1) reasons.push("duplicate email");

    if (reasons.length) {
      // Never fabricate or merge an identity — leave it for a human.
      await db.insert(s.legacyIdMap).values({ entityType: "person", legacyId: m.id, status: "needs_review", source, reason: reasons.join("; ") });
      summary.needsReview++;
      continue;
    }

    const orgMap = await db.select({ canonicalId: s.legacyIdMap.canonicalId }).from(s.legacyIdMap)
      .where(and(eq(s.legacyIdMap.entityType, "organization"), eq(s.legacyIdMap.legacyId, m.businessId), eq(s.legacyIdMap.status, "mapped")));
    const orgId = orgMap[0]?.canonicalId ?? null;
    const personId = crypto.randomUUID();
    await db.transaction(async tx => {
      await tx.insert(s.people).values({ id: personId, name: m.name });
      // Verified account linkage: the member's auth uid becomes their identity.
      await tx.insert(s.personIdentities).values({ provider: "google", subject: m.uid!, personId });
      await tx.insert(s.personCommunityMemberships).values({ personId, communityId, status: "active" });
      if (orgId) {
        // isOwner is recorded as an affiliation title only — no admin grant. Legacy
        // admin roles are reviewed and granted explicitly, never auto-promoted.
        await tx.insert(s.organizationAffiliations).values({ personId, organizationId: orgId,
          title: m.title ?? (m.isOwner ? "Owner" : ""), status: "active" });
      }
      await tx.insert(s.legacyIdMap).values({ entityType: "person", legacyId: m.id, canonicalId: personId, status: "mapped", source });
    });
    summary.peopleMapped++;
  }

  return summary;
}

export async function readBackfillReview(db: Database, source?: string) {
  const rows = await db.select({ entityType: s.legacyIdMap.entityType, legacyId: s.legacyIdMap.legacyId,
    reason: s.legacyIdMap.reason, source: s.legacyIdMap.source }).from(s.legacyIdMap)
    .where(source ? and(eq(s.legacyIdMap.status, "needs_review"), eq(s.legacyIdMap.source, source)) : eq(s.legacyIdMap.status, "needs_review"));
  return { review: rows };
}

export type BackfillValidation = {
  organizationsMapped: number; peopleMapped: number; needsReview: number;
  orphanAffiliations: number; orphanMemberships: number; adminGrantsCreated: number; ok: boolean;
};

// Post-backfill integrity: every mapped canonical id resolves, no dangling
// affiliations/memberships, and — the "no global promotion" invariant — the
// backfill minted no role grants.
export async function validateBackfill(db: Database): Promise<BackfillValidation> {
  const count = async (q: ReturnType<Database["execute"]> | Promise<unknown>) =>
    Number((((await q) as unknown as { n: number }[])[0]?.n) ?? 0);

  const organizationsMapped = await count(db.execute(sql`select count(*)::int as n from ${s.legacyIdMap} where entity_type = 'organization' and status = 'mapped'`));
  const peopleMapped = await count(db.execute(sql`select count(*)::int as n from ${s.legacyIdMap} where entity_type = 'person' and status = 'mapped'`));
  const needsReview = await count(db.execute(sql`select count(*)::int as n from ${s.legacyIdMap} where status = 'needs_review'`));
  // Affiliations / memberships whose mapped canonical id no longer resolves.
  const orphanAffiliations = await count(db.execute(sql`select count(*)::int as n from ${s.organizationAffiliations} a
    where not exists (select 1 from ${s.organizations} o where o.id = a.organization_id)
       or not exists (select 1 from ${s.people} p where p.id = a.person_id)`));
  const orphanMemberships = await count(db.execute(sql`select count(*)::int as n from ${s.personCommunityMemberships} m
    where not exists (select 1 from ${s.people} p where p.id = m.person_id)`));
  // No legacy person was promoted: the backfill never inserts role grants.
  const adminGrantsCreated = await count(db.execute(sql`select count(*)::int as n from ${s.roleGrants} g
    join ${s.legacyIdMap} lm on lm.canonical_id = g.person_id and lm.entity_type = 'person'`));

  const ok = orphanAffiliations === 0 && orphanMemberships === 0 && adminGrantsCreated === 0;
  return { organizationsMapped, peopleMapped, needsReview, orphanAffiliations, orphanMemberships, adminGrantsCreated, ok };
}
