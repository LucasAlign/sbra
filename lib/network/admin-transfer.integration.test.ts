import assert from "node:assert/strict";
import test from "node:test";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { and, eq } from "drizzle-orm";
import * as schema from "../db/schema";
import { resolvePerson } from "./repository";
import { changeMembership, readAudit, readMembershipAdmin, transferAdministrator } from "./membership";

const url = process.env.COLLAB_TEST_DATABASE_URL;

test("Postgres: administrator transfer keeps an admin, audits, and the log is immutable", { skip: !url }, async () => {
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

    const alice = await resolvePerson(db, { provider: "google", subject: "t-alice" }, "Alice");
    const bob = await resolvePerson(db, { provider: "google", subject: "t-bob" }, "Bob");
    const carol = await resolvePerson(db, { provider: "google", subject: "t-carol" }, "Carol");
    const dana = await resolvePerson(db, { provider: "google", subject: "t-dana" }, "Dana"); // never a member

    // Distinct fixture ids so this file coexists with the other integration
    // suites in the same disposable database.
    await db.insert(schema.networks).values({ id: "tn", slug: "tn", name: "Network" });
    await db.insert(schema.organizations).values({ id: "top", name: "Operator", kind: "association" });
    await db.insert(schema.communities).values({ id: "tc", networkId: "tn", operatorId: "top", slug: "tc", name: "tc", shortName: "tc", kind: "organizational", status: "active" });
    await db.insert(schema.personCommunityMemberships).values([
      { personId: alice.id, communityId: "tc", status: "active" },
      { personId: bob.id, communityId: "tc", status: "active" },
      { personId: carol.id, communityId: "tc", status: "active" },
    ]);
    await db.insert(schema.roleGrants).values({ id: "t-admin", personId: alice.id, communityId: "tc", role: "community_admin", grantedBy: alice.id });

    // Guards.
    await assert.rejects(transferAdministrator(db, alice.id, "tc", alice.id)); // not to self
    await assert.rejects(transferAdministrator(db, alice.id, "tc", dana.id)); // successor must be a member
    await assert.rejects(transferAdministrator(db, carol.id, "tc", bob.id)); // initiator must be an admin

    // Transfer alice -> bob.
    await transferAdministrator(db, alice.id, "tc", bob.id);

    // Bob is now the admin; alice is not. The community never had zero admins.
    const bobRoster = await readMembershipAdmin(db, bob.id, "tc");
    assert.equal(bobRoster.members.find(m => m.id === bob.id)?.administrator, true);
    assert.equal(bobRoster.members.find(m => m.id === alice.id)?.administrator, false);
    await assert.rejects(readMembershipAdmin(db, alice.id, "tc")); // alice lost admin

    // Exactly one active community_admin grant remains.
    const activeAdmins = await db.select().from(schema.roleGrants).where(and(
      eq(schema.roleGrants.communityId, "tc"), eq(schema.roleGrants.role, "community_admin")));
    assert.equal(activeAdmins.filter(g => g.revokedAt === null).length, 1);

    // The new admin (bob) still cannot be suspended — last-admin protection holds.
    await assert.rejects(changeMembership(db, bob.id, "tc", bob.id, "suspended"));

    // Audit: the transfer is recorded, actor=alice, target=bob.
    const log = await readAudit(db, bob.id, "tc");
    const transfer = log.entries.find(e => e.action === "administrator.transferred");
    assert.ok(transfer);
    assert.equal(transfer!.actorName, "Alice");
    assert.equal(transfer!.targetName, "Bob");
    // Non-admins cannot read the audit log.
    await assert.rejects(readAudit(db, carol.id, "tc"));

    // Idempotent grant: transferring back to alice (bob is initiator) does not
    // create a duplicate grant for a successor who is later re-appointed.
    await transferAdministrator(db, bob.id, "tc", alice.id);
    await transferAdministrator(db, alice.id, "tc", bob.id);
    const bobGrants = await db.select().from(schema.roleGrants).where(and(
      eq(schema.roleGrants.personId, bob.id), eq(schema.roleGrants.communityId, "tc"),
      eq(schema.roleGrants.role, "community_admin")));
    assert.equal(bobGrants.filter(g => g.revokedAt === null).length, 1);

    // Audit rows are immutable at the DB level, even for the app role.
    const [row] = await db.select({ id: schema.membershipAudit.id }).from(schema.membershipAudit).limit(1);
    await assert.rejects(db.update(schema.membershipAudit).set({ action: "membership.restored" }).where(eq(schema.membershipAudit.id, row.id)));
    await assert.rejects(db.delete(schema.membershipAudit).where(eq(schema.membershipAudit.id, row.id)));
  } finally {
    if (client) await client.end();
    await admin.end();
  }
});
