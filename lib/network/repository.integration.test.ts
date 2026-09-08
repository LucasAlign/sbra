import assert from "node:assert/strict";
import test from "node:test";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema";
import { resolvePerson, readDirectory, editOrganizationDescription } from "./repository";
import { acceptInvitation, changeMembership, communityAdminAccess, invitePerson, readMembershipAdmin, revokeInvitation } from "./membership";

// This suite creates fixtures and a restricted role. Never point it at app data.
const url = process.env.COLLAB_TEST_DATABASE_URL;

test("Postgres: identities, constraints, directory isolation, and grant revocation", { skip: !url }, async () => {
  const target = new URL(url!);
  assert.ok(["localhost", "127.0.0.1"].includes(target.hostname));
  assert.equal(target.pathname, "/collab_test");
  const admin = postgres(url!, { max: 1 });
  let client: ReturnType<typeof postgres> | undefined;
  try {
    await migrate(drizzle(admin), { migrationsFolder: "./drizzle/network" });
    await migrate(drizzle(admin), { migrationsFolder: "./drizzle/network" });
    await admin`create role collab_runtime login password 'test-runtime-only' nosuperuser nobypassrls`;
    await admin`grant usage on schema public to collab_runtime`;
    await admin`grant select, insert, update, delete on all tables in schema public to collab_runtime`;
    target.username = "collab_runtime"; target.password = "test-runtime-only";
    client = postgres(target.toString(), { max: 4 });
    const db = drizzle(client, { schema });
    const persons = await Promise.all(Array.from({ length: 5 }, () => resolvePerson(db, { provider: "google", subject: "alice" }, "Alice")));
    assert.equal(new Set(persons.map(p => p.id)).size, 1);
    const alice = persons[0];
    const bob = await resolvePerson(db, { provider: "google", subject: "bob" }, "Alice");
    assert.notEqual(alice.id, bob.id); // Same display name does not link accounts.
    await db.insert(schema.networks).values([{ id: "n", slug: "n", name: "Network" }, { id: "other", slug: "other", name: "Other" }]);
    await db.insert(schema.organizations).values([
      { id: "operator", name: "Operator", kind: "association" },
      { id: "shared", name: "Shared business", kind: "business" },
      { id: "private-b", name: "B only", kind: "business" },
    ]);
    await db.insert(schema.communities).values(["a", "b"].map(id => ({ id, networkId: "n", operatorId: "operator", slug: id, name: id, shortName: id, kind: "organizational", status: "active" })));
    await db.insert(schema.personCommunityMemberships).values([
      { personId: alice.id, communityId: "a", status: "active" },
      { personId: bob.id, communityId: "b", status: "active" },
    ]);
    await db.insert(schema.organizationCommunityMemberships).values([
      { organizationId: "shared", communityId: "a", status: "active", tier: "secret-a" },
      { organizationId: "shared", communityId: "b", status: "active", tier: "secret-b" },
      { organizationId: "private-b", communityId: "b", status: "active" },
    ]);
    const directory = await readDirectory(db, alice.id, "a");
    assert.deepEqual(directory.organizations.map(o => o.id), ["shared"]);
    assert.deepEqual(Object.keys(directory.organizations[0]).sort(), ["description", "id", "kind", "name"]);
    await assert.rejects(readDirectory(db, alice.id, "b"));
    await assert.rejects(readDirectory(db, alice.id, "unknown"));
    await assert.rejects(editOrganizationDescription(db, alice.id, "shared", "unauthorized"));
    await db.insert(schema.organizationAffiliations).values({ personId: alice.id, organizationId: "shared", status: "active" });
    await db.insert(schema.roleGrants).values({ id: "grant", personId: alice.id, organizationId: "shared", role: "business_admin", grantedBy: alice.id });
    await editOrganizationDescription(db, alice.id, "shared", "Updated canonical profile");
    assert.equal((await readDirectory(db, bob.id, "b")).organizations.find(o => o.id === "shared")?.description, "Updated canonical profile");
    await db.update(schema.roleGrants).set({ revokedAt: new Date() }).where(eq(schema.roleGrants.id, "grant"));
    await assert.rejects(editOrganizationDescription(db, alice.id, "shared", "revoked"));
    await db.update(schema.personCommunityMemberships).set({ status: "suspended" }).where(eq(schema.personCommunityMemberships.personId, alice.id));
    await assert.rejects(readDirectory(db, alice.id, "a"));
    await db.insert(schema.regions).values({ id: "other-region", networkId: "other", slug: "other", name: "Other" });
    await assert.rejects(db.insert(schema.communityRegions).values({ communityId: "a", networkId: "n", regionId: "other-region" }));
    await assert.rejects(db.insert(schema.roleGrants).values({ id: "invalid", personId: alice.id, role: "business_admin", communityId: "a", grantedBy: alice.id }));

    // Community onboarding grants membership only, and is isolated from the
    // organization-admin grant above and from Bob's existing membership in B.
    await db.update(schema.personCommunityMemberships).set({ status: "active" }).where(eq(schema.personCommunityMemberships.personId, alice.id));
    await db.insert(schema.roleGrants).values({ id: "admin-a", personId: alice.id, communityId: "a", role: "community_admin", grantedBy: alice.id });
    const charlie = await resolvePerson(db, { provider: "google", subject: "charlie" }, "Charlie");
    const access = await db.select({ admin: communityAdminAccess(alice.id, schema.communities.id) }).from(schema.communities).where(eq(schema.communities.id, "a"));
    assert.equal(access[0].admin, true);
    await assert.rejects(invitePerson(db, bob.id, "a", charlie.id));
    await assert.rejects(invitePerson(db, alice.id, "b", charlie.id));
    await assert.rejects(invitePerson(db, alice.id, "a", "unknown-account"));
    const invitation = await invitePerson(db, alice.id, "a", bob.id);
    assert.equal((await invitePerson(db, alice.id, "a", bob.id)).id, invitation.id);
    await assert.rejects(acceptInvitation(db, charlie.id, invitation.id));
    const acceptance = await Promise.allSettled([acceptInvitation(db, bob.id, invitation.id), acceptInvitation(db, bob.id, invitation.id)]);
    assert.equal(acceptance.filter(result => result.status === "fulfilled").length, 1);
    assert.equal((await readDirectory(db, bob.id, "a")).organizations[0].id, "shared");
    await assert.rejects(editOrganizationDescription(db, bob.id, "shared", "membership is not ownership"));
    await assert.rejects(readMembershipAdmin(db, bob.id, "a"));
    const roster = await readMembershipAdmin(db, alice.id, "a");
    assert.equal(roster.members.find(member => member.id === alice.id)?.administrator, true);
    assert.equal(roster.members.find(member => member.id === bob.id)?.administrator, false);
    await changeMembership(db, alice.id, "a", bob.id, "suspended");
    await assert.rejects(readDirectory(db, bob.id, "a"));
    assert.ok((await readDirectory(db, bob.id, "b")).organizations.length > 0);
    await assert.rejects(invitePerson(db, alice.id, "a", bob.id));
    await changeMembership(db, alice.id, "a", bob.id, "active");
    await assert.rejects(changeMembership(db, alice.id, "a", alice.id, "suspended"));

    const expired = await invitePerson(db, alice.id, "a", charlie.id);
    await db.update(schema.communityInvitations).set({ createdAt: new Date(Date.now() - 8 * 86400000), expiresAt: new Date(Date.now() - 1000) })
      .where(eq(schema.communityInvitations.id, expired.id));
    await assert.rejects(acceptInvitation(db, charlie.id, expired.id));
    const revoked = await invitePerson(db, alice.id, "a", charlie.id);
    await assert.rejects(revokeInvitation(db, alice.id, "b", revoked.id));
    await revokeInvitation(db, alice.id, "a", revoked.id);
    await assert.rejects(acceptInvitation(db, charlie.id, revoked.id));
    const staleIssuer = await invitePerson(db, alice.id, "a", charlie.id);
    await db.update(schema.roleGrants).set({ revokedAt: new Date() }).where(eq(schema.roleGrants.id, "admin-a"));
    await assert.rejects(acceptInvitation(db, charlie.id, staleIssuer.id));
    await assert.rejects(readMembershipAdmin(db, alice.id, "a"));
    await assert.rejects(changeMembership(db, alice.id, "a", bob.id, "suspended"));
    const acceptedAudit = await db.select().from(schema.membershipAudit).where(eq(schema.membershipAudit.action, "invitation.accepted"));
    assert.equal(acceptedAudit.length, 1);
    assert.equal(acceptedAudit[0].targetId, bob.id);
    assert.equal(acceptedAudit[0].communityId, "a");
  } finally {
    if (client) await client.end();
    await admin.end();
  }
});
