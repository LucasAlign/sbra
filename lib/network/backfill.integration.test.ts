import assert from "node:assert/strict";
import test from "node:test";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { and, eq, inArray } from "drizzle-orm";
import * as schema from "../db/schema";
import { backfillCommunity, readBackfillReview, validateBackfill } from "./backfill";

// Exercises the M8 legacy backfill on the PRIVILEGED (owner) connection, the way
// the real cutover runs it: businesses become canonical organizations (tier
// migrated), members map to people only via a verified account, ambiguous rows go
// to manual review (never merged), no legacy admin is auto-promoted, and the whole
// pass is idempotent and validates clean.
const url = process.env.COLLAB_TEST_DATABASE_URL;

test("Postgres: legacy backfill maps verified accounts, reviews the rest, promotes no one", { skip: !url }, async () => {
  const target = new URL(url!);
  assert.ok(["localhost", "127.0.0.1"].includes(target.hostname));
  assert.equal(target.pathname, "/collab_test");
  const admin = postgres(url!, { max: 1 });
  try {
    await migrate(drizzle(admin), { migrationsFolder: "./drizzle/network" });
    const db = drizzle(admin, { schema });

    // Stand up the legacy prototype tables the deployed app created via db:push.
    // Email is intentionally NOT unique here so duplicate-email review is testable.
    await admin`create table if not exists "businesses" (
      "id" text primary key, "name" text not null, "category" text default '' not null,
      "description" text default '' not null, "services_offered" text default '' not null,
      "referrals_wanted" text default '' not null, "website" text default '' not null,
      "address" text default '' not null, "city" text default '' not null,
      "tier" text default 'solo' not null, "created_at" bigint not null)`;
    await admin`create table if not exists "members" (
      "id" text primary key, "uid" text, "role" text default 'member', "business_id" text not null,
      "name" text not null, "title" text default '' not null, "email" text not null,
      "phone" text default '' not null, "bio" text default '' not null, "is_owner" boolean default false not null)`;

    // A community to backfill into (provisioned separately from the mapping).
    await db.insert(schema.networks).values({ id: "bf-n", slug: "bf-n", name: "N" });
    await db.insert(schema.organizations).values({ id: "bf-op", name: "Operator", kind: "association" });
    await db.insert(schema.communities).values({ id: "bf-c1", networkId: "bf-n", operatorId: "bf-op", slug: "bf-c1", name: "Berks", shortName: "Berks", kind: "organizational", status: "active" });

    const now = Date.now();
    await db.insert(schema.businesses).values([
      { id: "b1", name: "Alpha LLC", description: "Alpha.", website: "alpha.test", address: "1 Main", city: "Reading", servicesOffered: "widgets", tier: "premium", createdAt: now },
      { id: "b2", name: "Beta Co", description: "Beta.", tier: "solo", createdAt: now },
    ]);
    await db.insert(schema.members).values([
      { id: "m1", uid: "u1", businessId: "b1", name: "Alice", title: "Owner", email: "a@x", isOwner: true },  // mapped
      { id: "m2", uid: "u2", businessId: "b1", name: "Bob", email: "b@x" },                                    // mapped
      { id: "m3", uid: null, businessId: "b2", name: "Cara", email: "c@x" },                                   // no verified account
      { id: "m4", uid: "u4", businessId: "b2", name: "Dan", email: "dup@x" },                                  // duplicate email
      { id: "m5", uid: "u5", businessId: "b2", name: "Dana", email: "dup@x" },                                 // duplicate email
      { id: "m6", uid: "ushared", businessId: "b1", name: "Eve", email: "e@x" },                               // shared account
      { id: "m7", uid: "ushared", businessId: "b1", name: "Finn", email: "f@x" },                              // shared account
    ]);

    const summary = await backfillCommunity(db, { communityId: "bf-c1", source: "berks-2026" });
    assert.deepEqual(summary, { organizationsMapped: 2, peopleMapped: 2, needsReview: 5, skipped: 0 });

    // Businesses became canonical organizations with tier migrated to membership.
    const [b1map] = await db.select().from(schema.legacyIdMap).where(and(eq(schema.legacyIdMap.entityType, "organization"), eq(schema.legacyIdMap.legacyId, "b1")));
    assert.equal(b1map.status, "mapped");
    const [b1mem] = await db.select().from(schema.organizationCommunityMemberships).where(eq(schema.organizationCommunityMemberships.organizationId, b1map.canonicalId!));
    assert.equal(b1mem.tier, "premium");
    const [b1org] = await db.select().from(schema.organizations).where(eq(schema.organizations.id, b1map.canonicalId!));
    assert.equal(b1org.locations, "1 Main, Reading");

    // Verified members became people with a linked identity, an affiliation, and a
    // community membership — and NO admin grant (isOwner is only an affiliation).
    // The integration suite shares one DB, so assertions are scoped to this
    // backfill's own rows rather than global counts.
    assert.equal((await db.select().from(schema.personIdentities).where(inArray(schema.personIdentities.subject, ["u1", "u2"]))).length, 2);
    assert.equal((await db.select().from(schema.organizationAffiliations).where(eq(schema.organizationAffiliations.organizationId, b1map.canonicalId!))).length, 2);
    assert.equal((await db.select().from(schema.personCommunityMemberships).where(eq(schema.personCommunityMemberships.communityId, "bf-c1"))).length, 2);
    const [m1map] = await db.select().from(schema.legacyIdMap).where(and(eq(schema.legacyIdMap.entityType, "person"), eq(schema.legacyIdMap.legacyId, "m1")));
    const [ownerAff] = await db.select().from(schema.organizationAffiliations).where(eq(schema.organizationAffiliations.personId, m1map.canonicalId!));
    assert.equal(ownerAff.title, "Owner");
    // No legacy person was promoted: no role grant references a backfilled person.
    assert.equal((await validateBackfill(db)).adminGrantsCreated, 0);

    // Ambiguous rows went to review with a reason — never mapped or merged.
    const reasonOf = async (legacyId: string) => (await db.select().from(schema.legacyIdMap)
      .where(and(eq(schema.legacyIdMap.entityType, "person"), eq(schema.legacyIdMap.legacyId, legacyId))))[0];
    assert.match((await reasonOf("m3")).reason, /no verified account/);
    assert.match((await reasonOf("m4")).reason, /duplicate email/);
    assert.match((await reasonOf("m6")).reason, /shared account/);
    for (const id of ["m3", "m4", "m5", "m6", "m7"]) assert.equal((await reasonOf(id)).status, "needs_review");
    assert.equal((await readBackfillReview(db, "berks-2026")).review.length, 5);

    // Idempotent: a second pass maps nothing new.
    const again = await backfillCommunity(db, { communityId: "bf-c1", source: "berks-2026" });
    assert.equal(again.organizationsMapped, 0);
    assert.equal(again.peopleMapped, 0);
    assert.equal(again.skipped, 9); // 2 businesses + 7 members already handled
    // Still exactly two mapped people (scoped to this backfill via legacy_id_map).
    assert.equal((await validateBackfill(db)).peopleMapped, 2);

    // Post-backfill integrity: nothing dangling, and no one was promoted.
    const validation = await validateBackfill(db);
    assert.deepEqual(validation, { organizationsMapped: 2, peopleMapped: 2, needsReview: 5,
      orphanAffiliations: 0, orphanMemberships: 0, adminGrantsCreated: 0, ok: true });
  } finally {
    await admin.end();
  }
});
