import assert from "node:assert/strict";
import test from "node:test";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema";
import { PostgresIdentityAccess } from "./identity-access";
import { ModuleError } from "./types";

// Proves the Identity & Access Postgres adapter end-to-end under the restricted
// runtime role — the same disposable DB the network integration suite uses.
const url = process.env.COLLAB_TEST_DATABASE_URL;

test("Postgres Identity & Access: resolve and edit a profile", { skip: !url }, async () => {
  const target = new URL(url!);
  assert.ok(["localhost", "127.0.0.1"].includes(target.hostname));
  assert.equal(target.pathname, "/collab_test");
  const admin = postgres(url!, { max: 1 });
  let client: ReturnType<typeof postgres> | undefined;
  try {
    await migrate(drizzle(admin), { migrationsFolder: "./drizzle/network" });
    // Idempotent role setup (the network suite may run in the same DB).
    await admin`do $$ begin
      if not exists (select from pg_roles where rolname = 'collab_runtime') then
        create role collab_runtime login password 'test-runtime-only' nosuperuser nobypassrls;
      end if;
    end $$`;
    await admin`grant usage on schema public to collab_runtime`;
    await admin`grant select, insert, update, delete on all tables in schema public to collab_runtime`;
    target.username = "collab_runtime"; target.password = "test-runtime-only";
    client = postgres(target.toString(), { max: 4 });
    const module = new PostgresIdentityAccess(drizzle(client, { schema }));

    const subject = `mod-${crypto.randomUUID()}`;
    const first = await module.resolveActor({ provider: "google", subject }, "Dana");
    const again = await module.resolveActor({ provider: "google", subject }, "Ignored");
    assert.equal(first.personId, again.personId); // First sight creates; later sights reuse.

    assert.equal((await module.getMyProfile(first)).name, "Dana");
    const updated = await module.updateProfileName(first, "  Dana Osei  ");
    assert.equal(updated.name, "Dana Osei"); // Bounded + trimmed, persisted.
    assert.equal((await module.getMyProfile(first)).name, "Dana Osei");

    // Cross-check the write actually landed in the row the adapter targeted.
    const [row] = await drizzle(admin, { schema }).select({ name: schema.people.name })
      .from(schema.people).where(eq(schema.people.id, first.personId));
    assert.equal(row.name, "Dana Osei");

    await assert.rejects(module.getMyProfile({ personId: "ghost", name: "?" }), ModuleError);
    await assert.rejects(module.updateProfileName(first, ""));
  } finally {
    if (client) await client.end();
    await admin.end();
  }
});
