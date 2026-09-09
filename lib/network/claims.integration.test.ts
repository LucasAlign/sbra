import assert from "node:assert/strict";
import test from "node:test";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { and, eq } from "drizzle-orm";
import * as schema from "../db/schema";
import { withActor } from "../db/context";
import { resolvePerson, editOrganizationProfile, readDirectory, setListingOverride } from "./repository";
import { requestClaim, reviewClaim, readClaimRequests } from "./claims";

// Exercises the verified-claim workflow (operator vouch) and the M2 acceptance
// scenario end to end under the restricted runtime role: a claim grants Business
// Admin, one person represents two businesses, a canonical edit shows in every
// listing, and a community override stays local.
const url = process.env.COLLAB_TEST_DATABASE_URL;

test("Postgres: claim -> vouch -> Business Admin, with canonical edits global and overrides local", { skip: !url }, async () => {
  const target = new URL(url!);
  assert.ok(["localhost", "127.0.0.1"].includes(target.hostname));
  assert.equal(target.pathname, "/collab_test");
  const admin = postgres(url!, { max: 1 });
  let client: ReturnType<typeof postgres> | undefined;
  try {
    await migrate(drizzle(admin), { migrationsFolder: "./drizzle/network" });
    await admin`do $$ begin
      if not exists (select from pg_roles where rolname = 'collab_runtime') then
        create role collab_runtime login password 'test-runtime-only' nosuperuser nobypassrls;
      end if;
    end $$`;
    await admin`grant usage on schema public to collab_runtime`;
    await admin`grant select, insert, update, delete on all tables in schema public to collab_runtime`;
    target.username = "collab_runtime"; target.password = "test-runtime-only";
    client = postgres(target.toString(), { max: 4 });
    const db = drizzle(client, { schema });
    const adminDb = drizzle(admin, { schema });

    // People via the login path (definer identity lookup under the runtime role).
    const boss = await resolvePerson(db, { provider: "google", subject: "clm-boss" }, "Bea Boss"); // community admin
    const owner = await resolvePerson(db, { provider: "google", subject: "clm-owner" }, "Otto Owner"); // claimant
    const plain = await resolvePerson(db, { provider: "google", subject: "clm-plain" }, "Pat Plain"); // member, no authority

    // Two communities that both list org X; org Y is listed only in C1.
    await adminDb.insert(schema.networks).values({ id: "clm-n", slug: "clm-n", name: "N" });
    await adminDb.insert(schema.organizations).values([
      { id: "clm-op", name: "Operator", kind: "association" },
      { id: "clm-x", name: "Acme Widgets", kind: "business", description: "Original blurb." },
      { id: "clm-y", name: "Otto Detailing", kind: "business", description: "Car care." },
    ]);
    await adminDb.insert(schema.communities).values([
      { id: "clm-c1", networkId: "clm-n", operatorId: "clm-op", slug: "clm-c1", name: "C1", shortName: "C1", kind: "organizational", status: "active" },
      { id: "clm-c2", networkId: "clm-n", operatorId: "clm-op", slug: "clm-c2", name: "C2", shortName: "C2", kind: "organizational", status: "active" },
    ]);
    // The owner and admin belong to both communities; plain only to C1.
    await adminDb.insert(schema.personCommunityMemberships).values([
      { personId: boss.id, communityId: "clm-c1", status: "active" },
      { personId: boss.id, communityId: "clm-c2", status: "active" },
      { personId: owner.id, communityId: "clm-c1", status: "active" },
      { personId: owner.id, communityId: "clm-c2", status: "active" },
      { personId: plain.id, communityId: "clm-c1", status: "active" },
    ]);
    await adminDb.insert(schema.roleGrants).values({ id: "clm-adm", personId: boss.id, communityId: "clm-c1", role: "community_admin", grantedBy: boss.id });
    await adminDb.insert(schema.organizationCommunityMemberships).values([
      { organizationId: "clm-x", communityId: "clm-c1", status: "active" },
      { organizationId: "clm-x", communityId: "clm-c2", status: "active" },
      { organizationId: "clm-y", communityId: "clm-c1", status: "active" },
    ]);

    // Before any claim, the owner cannot edit X.
    await assert.rejects(editOrganizationProfile(db, owner.id, "clm-x", { description: "hijack" }));

    // Owner claims X in C1; the admin sees it and vouches.
    const { id: claimX } = await requestClaim(db, owner.id, "clm-x", "clm-c1", "I run Acme Widgets.");
    const queue = await readClaimRequests(db, boss.id, "clm-c1");
    assert.equal(queue.claims.find(c => c.id === claimX)?.personName, "Otto Owner");
    // A plain member cannot review.
    await assert.rejects(readClaimRequests(db, plain.id, "clm-c1"));
    await assert.rejects(reviewClaim(db, plain.id, claimX, "approved"));
    await reviewClaim(db, boss.id, claimX, "approved", "Confirmed by operator.");

    // The claim minted an active affiliation and a business_admin grant.
    const [aff] = await adminDb.select().from(schema.organizationAffiliations).where(and(
      eq(schema.organizationAffiliations.personId, owner.id), eq(schema.organizationAffiliations.organizationId, "clm-x")));
    assert.equal(aff.status, "active");
    const grants = await adminDb.select().from(schema.roleGrants).where(and(
      eq(schema.roleGrants.personId, owner.id), eq(schema.roleGrants.organizationId, "clm-x"), eq(schema.roleGrants.role, "business_admin")));
    assert.equal(grants.filter(g => g.revokedAt === null).length, 1);

    // One person, two businesses: claim Y too.
    const { id: claimY } = await requestClaim(db, owner.id, "clm-y", "clm-c1", "And Otto Detailing.");
    await reviewClaim(db, boss.id, claimY, "approved");

    // A canonical edit to X shows in BOTH communities that list it.
    await editOrganizationProfile(db, owner.id, "clm-x", { description: "Precision widgets since 1998.", website: "acme.example" });
    const c1 = await readDirectory(db, owner.id, "clm-c1");
    const c2 = await readDirectory(db, owner.id, "clm-c2");
    assert.equal(c1.organizations.find(o => o.id === "clm-x")?.description, "Precision widgets since 1998.");
    assert.equal(c2.organizations.find(o => o.id === "clm-x")?.description, "Precision widgets since 1998.");
    assert.equal(c2.organizations.find(o => o.id === "clm-x")?.website, "acme.example");

    // A community override is LOCAL: C1 shows the local headline/offer; C2 keeps canonical.
    await setListingOverride(db, owner.id, "clm-x", "clm-c1", { headline: "C1 members: free shipping", localOffer: "Ask for the C1 rate" });
    const c1b = await readDirectory(db, owner.id, "clm-c1");
    const c2b = await readDirectory(db, owner.id, "clm-c2");
    assert.equal(c1b.organizations.find(o => o.id === "clm-x")?.description, "C1 members: free shipping");
    assert.equal(c1b.organizations.find(o => o.id === "clm-x")?.localOffer, "Ask for the C1 rate");
    assert.equal(c2b.organizations.find(o => o.id === "clm-x")?.description, "Precision widgets since 1998.");
    assert.equal(c2b.organizations.find(o => o.id === "clm-x")?.localOffer, "");
    // Canonical row is untouched by the override.
    const [canonical] = await adminDb.select({ d: schema.organizations.description }).from(schema.organizations).where(eq(schema.organizations.id, "clm-x"));
    assert.equal(canonical.d, "Precision widgets since 1998.");

    // Hiding drops X from C1 only.
    await setListingOverride(db, owner.id, "clm-x", "clm-c1", { visibility: "hidden" });
    const c1c = await readDirectory(db, owner.id, "clm-c1");
    assert.equal(c1c.organizations.find(o => o.id === "clm-x"), undefined);
    assert.ok((await readDirectory(db, owner.id, "clm-c2")).organizations.find(o => o.id === "clm-x"));

    // RLS backstop: the plain member cannot self-mint a Business Admin grant, and
    // cannot see another member's claim by a raw query that omits the app filter.
    await assert.rejects(withActor(db, plain.id, tx =>
      tx.insert(schema.roleGrants).values({ id: "clm-evil", personId: plain.id, organizationId: "clm-x", role: "business_admin", grantedBy: plain.id })));
    await withActor(db, plain.id, async tx => {
      const visible = await tx.select().from(schema.claimRequests);
      assert.equal(visible.filter(c => c.personId === owner.id).length, 0);
    });
  } finally {
    if (client) await client.end();
    await admin.end();
  }
});
