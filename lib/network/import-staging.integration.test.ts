import assert from "node:assert/strict";
import test from "node:test";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema";
import { withActor } from "../db/context";
import { resolvePerson } from "./repository";
import { readImportBatches, recordMerge, stageImportBatch } from "./import-staging";

// Proves import staging is private to the owning community's admins and that the
// person_identities lockdown holds: login still resolves through the SECURITY
// DEFINER lookup, but a runtime-role read cannot enumerate another person's
// identities.
const url = process.env.COLLAB_TEST_DATABASE_URL;

test("Postgres: import staging is community-private and identities are locked down", { skip: !url }, async () => {
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

    // Login path: resolving twice returns the same person (definer lookup works
    // under the runtime role even though person_identities SELECT is locked).
    const a1 = await resolvePerson(db, { provider: "google", subject: "imp-a1" }, "Ada One");
    const again = await resolvePerson(db, { provider: "google", subject: "imp-a1" }, "Ada One");
    assert.equal(again.id, a1.id);
    const a2 = await resolvePerson(db, { provider: "google", subject: "imp-a2" }, "Ada Two");
    const plain = await resolvePerson(db, { provider: "google", subject: "imp-plain" }, "Pat Plain");

    await adminDb.insert(schema.networks).values({ id: "imp-n", slug: "imp-n", name: "N" });
    await adminDb.insert(schema.organizations).values({ id: "imp-op", name: "Operator", kind: "association" });
    await adminDb.insert(schema.communities).values([
      { id: "imp-c1", networkId: "imp-n", operatorId: "imp-op", slug: "imp-c1", name: "C1", shortName: "C1", kind: "organizational", status: "active" },
      { id: "imp-c2", networkId: "imp-n", operatorId: "imp-op", slug: "imp-c2", name: "C2", shortName: "C2", kind: "organizational", status: "active" },
    ]);
    await adminDb.insert(schema.personCommunityMemberships).values([
      { personId: a1.id, communityId: "imp-c1", status: "active" },
      { personId: a2.id, communityId: "imp-c2", status: "active" },
      { personId: plain.id, communityId: "imp-c1", status: "active" },
    ]);
    await adminDb.insert(schema.roleGrants).values([
      { id: "imp-g1", personId: a1.id, communityId: "imp-c1", role: "community_admin", grantedBy: a1.id },
      { id: "imp-g2", personId: a2.id, communityId: "imp-c2", role: "community_admin", grantedBy: a2.id },
    ]);

    // A1 stages an import into C1; a plain member cannot.
    const { batchId, count } = await stageImportBatch(db, a1.id, "imp-c1", "chamber.csv",
      [{ externalId: "1", payload: "Acme" }, { externalId: "2", payload: "Beta" }], "Q3 roster");
    assert.equal(count, 2);
    await assert.rejects(stageImportBatch(db, plain.id, "imp-c1", "sneaky.csv", []));
    await recordMerge(db, a1.id, "imp-c1", "organization", "imp-survivor", "imp-dupe", "same business");

    // A1 sees the batch; the other community's admin does not.
    assert.equal((await readImportBatches(db, a1.id, "imp-c1")).batches.find(b => b.id === batchId)?.source, "chamber.csv");
    await assert.rejects(readImportBatches(db, a2.id, "imp-c1"));

    // RLS backstop: a raw read under C2's admin cannot see C1's staged rows.
    await withActor(db, a2.id, async tx => {
      const batches = await tx.select().from(schema.importBatches);
      assert.equal(batches.filter(b => b.communityId === "imp-c1").length, 0);
      const records = await tx.select().from(schema.sourceRecords);
      assert.equal(records.filter(r => r.batchId === batchId).length, 0);
    });

    // person_identities lockdown: a runtime-role read sees only its own identity,
    // never another person's — even with a raw query omitting a filter.
    await withActor(db, a1.id, async tx => {
      const rows = await tx.select().from(schema.personIdentities);
      assert.ok(rows.every(r => r.personId === a1.id));
      assert.ok(rows.some(r => r.subject === "imp-a1"));
      assert.equal(rows.filter(r => r.personId === plain.id).length, 0);
    });
  } finally {
    if (client) await client.end();
    await admin.end();
  }
});
