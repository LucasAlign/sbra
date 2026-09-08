import assert from "node:assert/strict";
import test from "node:test";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { and, eq } from "drizzle-orm";
import * as schema from "./schema";
import { withActor } from "./context";

// Proves the relational row-level security backstop directly: raw queries that
// omit the application's WHERE clauses still cannot cross tenant boundaries under
// the restricted runtime role. Fixtures are created via the privileged owner.
const url = process.env.COLLAB_TEST_DATABASE_URL;

test("Postgres RLS: the relational graph is scoped to the actor's memberships", { skip: !url }, async () => {
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

    // Two isolated communities, each with an admin and a plain member.
    const P = "rls2";
    await adminDb.insert(schema.people).values([
      { id: `${P}-amem`, name: "A Member" }, { id: `${P}-aadm`, name: "A Admin" },
      { id: `${P}-bmem`, name: "B Member" }, { id: `${P}-badm`, name: "B Admin" },
    ]);
    await adminDb.insert(schema.networks).values({ id: `${P}-n`, slug: `${P}-n`, name: "N" });
    await adminDb.insert(schema.organizations).values([
      { id: `${P}-op`, name: "Operator", kind: "association" },
      { id: `${P}-orgb`, name: "B Org", kind: "business" },
    ]);
    await adminDb.insert(schema.communities).values(["a", "b"].map(x => ({
      id: `${P}-${x}`, networkId: `${P}-n`, operatorId: `${P}-op`, slug: `${P}-${x}`, name: x, shortName: x, kind: "organizational", status: "active" as const })));
    await adminDb.insert(schema.personCommunityMemberships).values([
      { personId: `${P}-amem`, communityId: `${P}-a`, status: "active" },
      { personId: `${P}-aadm`, communityId: `${P}-a`, status: "active" },
      { personId: `${P}-bmem`, communityId: `${P}-b`, status: "active" },
      { personId: `${P}-badm`, communityId: `${P}-b`, status: "active" },
    ]);
    await adminDb.insert(schema.roleGrants).values([
      { id: `${P}-ga`, personId: `${P}-aadm`, communityId: `${P}-a`, role: "community_admin", grantedBy: `${P}-aadm` },
      { id: `${P}-gb`, personId: `${P}-badm`, communityId: `${P}-b`, role: "community_admin", grantedBy: `${P}-badm` },
    ]);
    await adminDb.insert(schema.organizationCommunityMemberships).values({ organizationId: `${P}-orgb`, communityId: `${P}-b`, status: "active" });
    await adminDb.insert(schema.communityInvitations).values({ id: `${P}-inv`, communityId: `${P}-b`, recipientId: `${P}-bmem`, issuedBy: `${P}-badm`, expiresAt: new Date(Date.now() + 86400000) });
    await adminDb.insert(schema.membershipAudit).values({ id: `${P}-aud`, communityId: `${P}-b`, actorId: `${P}-badm`, targetId: `${P}-bmem`, action: "invitation.created" });

    const inB = <T extends { communityId: unknown }>(rows: T[]) => rows.filter(r => r.communityId === `${P}-b`);

    // A plain member of A sees nothing belonging to community B, across the graph.
    await withActor(db, `${P}-amem`, async tx => {
      assert.equal(inB(await tx.select().from(schema.personCommunityMemberships)).length, 0);
      assert.equal(inB(await tx.select().from(schema.roleGrants)).length, 0);
      assert.equal(inB(await tx.select().from(schema.communityInvitations)).length, 0);
      assert.equal(inB(await tx.select().from(schema.organizationCommunityMemberships)).length, 0);
      assert.equal(inB(await tx.select().from(schema.membershipAudit)).length, 0);
      // They do see their own membership row.
      const own = await tx.select().from(schema.personCommunityMemberships).where(eq(schema.personCommunityMemberships.personId, `${P}-amem`));
      assert.equal(own.length, 1);
    });

    // A member of B does see B's directory rows (scoped read, not blanket deny).
    await withActor(db, `${P}-bmem`, async tx => {
      assert.equal(inB(await tx.select().from(schema.organizationCommunityMemberships)).length, 1);
      // But a plain member cannot read B's audit log (admin-only).
      assert.equal(inB(await tx.select().from(schema.membershipAudit)).length, 0);
    });

    // B's admin sees B's roster, grants, and audit; still nothing from A.
    await withActor(db, `${P}-badm`, async tx => {
      assert.equal(inB(await tx.select().from(schema.personCommunityMemberships)).length, 2);
      assert.equal(inB(await tx.select().from(schema.membershipAudit)).length, 1);
      const fromA = (await tx.select().from(schema.personCommunityMemberships)).filter(r => r.communityId === `${P}-a`);
      assert.equal(fromA.length, 0);
    });

    // Write backstop: a plain member cannot grant themselves admin (INSERT is
    // rejected by the policy). Each attempt is its own transaction because a
    // failed statement aborts the surrounding one.
    await assert.rejects(withActor(db, `${P}-amem`, tx =>
      tx.insert(schema.roleGrants).values({ id: `${P}-evil`, personId: `${P}-amem`, communityId: `${P}-a`, role: "community_admin", grantedBy: `${P}-amem` })));
    // Nor suspend another member: the UPDATE is filtered to zero rows.
    await withActor(db, `${P}-amem`, async tx => {
      const changed = await tx.update(schema.personCommunityMemberships).set({ status: "suspended" })
        .where(and(eq(schema.personCommunityMemberships.personId, `${P}-aadm`), eq(schema.personCommunityMemberships.communityId, `${P}-a`)))
        .returning({ personId: schema.personCommunityMemberships.personId });
      assert.equal(changed.length, 0);
    });
    // The admin's membership is untouched.
    const [stillActive] = await adminDb.select({ status: schema.personCommunityMemberships.status })
      .from(schema.personCommunityMemberships)
      .where(and(eq(schema.personCommunityMemberships.personId, `${P}-aadm`), eq(schema.personCommunityMemberships.communityId, `${P}-a`)));
    assert.equal(stillActive.status, "active");
  } finally {
    if (client) await client.end();
    await admin.end();
  }
});
