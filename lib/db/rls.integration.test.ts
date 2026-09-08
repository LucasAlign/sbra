import assert from "node:assert/strict";
import test from "node:test";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { eq, sql } from "drizzle-orm";
import * as schema from "./schema";
import { withActor } from "./context";
import { resolvePerson } from "../network/repository";
import { PostgresIdentityAccess } from "../modules/identity-access";

// Proves row-level security on `people` under the restricted runtime role: the
// profile edit works through the actor context, and every attempt to touch
// another person's row — or to write with no context at all — is stopped by the
// database, independent of the application's own WHERE clauses.
const url = process.env.COLLAB_TEST_DATABASE_URL;

test("Postgres RLS: a person can only modify their own profile row", { skip: !url }, async () => {
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
    const nameOf = async (id: string) =>
      (await adminDb.select({ name: schema.people.name }).from(schema.people).where(eq(schema.people.id, id)))[0]?.name;

    // RLS is actually enabled on people (guards against a missed migration).
    const rls = await adminDb.execute<{ relrowsecurity: boolean }>(
      sql`select relrowsecurity from pg_class where relname = 'people'`);
    assert.equal(rls[0]?.relrowsecurity, true);

    const identity = new PostgresIdentityAccess(db);
    const alice = await resolvePerson(db, { provider: "google", subject: `rls-a-${crypto.randomUUID()}` }, "Alice");
    const bob = await resolvePerson(db, { provider: "google", subject: `rls-b-${crypto.randomUUID()}` }, "Bob");

    // 1. The module edit (runs inside withActor) updates the actor's own row.
    await identity.updateProfileName({ personId: alice.id, name: alice.name }, "Alice Ng");
    assert.equal(await nameOf(alice.id), "Alice Ng");

    // 2. With Alice's context, an attempt to rewrite Bob's row touches nothing.
    const hijack = await withActor(db, alice.id, tx =>
      tx.update(schema.people).set({ name: "hijacked" }).where(eq(schema.people.id, bob.id)).returning({ id: schema.people.id }));
    assert.equal(hijack.length, 0);
    assert.equal(await nameOf(bob.id), "Bob");

    // 3. With no actor context at all, even an own-id update matches nothing.
    const noContext = await db.update(schema.people).set({ name: "no-context" })
      .where(eq(schema.people.id, alice.id)).returning({ id: schema.people.id });
    assert.equal(noContext.length, 0);
    assert.equal(await nameOf(alice.id), "Alice Ng");

    // 4. Reads are not restricted — names are visible for the directory/roster.
    const seen = await db.select({ name: schema.people.name }).from(schema.people).where(eq(schema.people.id, bob.id));
    assert.equal(seen[0]?.name, "Bob");

    // 5. Deletes are denied to the runtime role (no DELETE policy → default deny).
    const deleted = await db.delete(schema.people).where(eq(schema.people.id, bob.id)).returning({ id: schema.people.id });
    assert.equal(deleted.length, 0);
    assert.equal(await nameOf(bob.id), "Bob");
  } finally {
    if (client) await client.end();
    await admin.end();
  }
});
