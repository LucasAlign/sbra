import assert from "node:assert/strict";
import test from "node:test";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import * as schema from "../db/schema";
import { PostgresIdentityAccess } from "./identity-access";
import { PostgresDiscoveryPublishing } from "./discovery-publishing";
import { PostgresOrganizationsMembership } from "./organizations-membership";

// Proves the Discovery & Publishing and Organizations & Membership Postgres
// adapters end-to-end under the restricted runtime role.
const url = process.env.COLLAB_TEST_DATABASE_URL;

test("Postgres Discovery + Organizations adapters: scoped directory and gated edits", { skip: !url }, async () => {
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
    const identity = new PostgresIdentityAccess(db);
    const directory = new PostgresDiscoveryPublishing(db);
    const orgs = new PostgresOrganizationsMembership(db);

    const owner = await identity.resolveActor({ provider: "google", subject: `owner-${crypto.randomUUID()}` }, "Owner");
    const member = await identity.resolveActor({ provider: "google", subject: `member-${crypto.randomUUID()}` }, "Member");

    const net = `net-${crypto.randomUUID()}`;
    const community = `c-${crypto.randomUUID()}`;
    const org = `org-${crypto.randomUUID()}`;
    await db.insert(schema.networks).values({ id: net, slug: net, name: "Net" });
    await db.insert(schema.organizations).values([
      { id: "op-" + net, name: "Operator", kind: "association" },
      { id: org, name: "Brightside Bakery", kind: "business" },
    ]);
    await db.insert(schema.communities).values({ id: community, networkId: net, operatorId: "op-" + net, slug: community, name: "C", shortName: "C", kind: "organizational", status: "active" });
    await db.insert(schema.personCommunityMemberships).values([
      { personId: owner.personId, communityId: community, status: "active" },
      { personId: member.personId, communityId: community, status: "active" },
    ]);
    await db.insert(schema.organizationCommunityMemberships).values({ organizationId: org, communityId: community, status: "active" });

    // Directory read through the adapter: active members see the org, public fields only.
    const listing = await directory.readDirectory(member, community);
    assert.deepEqual(listing.organizations.map(o => o.id), [org]);
    assert.deepEqual(Object.keys(listing.organizations[0]).sort(), ["description", "id", "kind", "name"]);

    // Edit through the adapter is denied without an affiliation + grant. (The
    // Postgres adapter surfaces the repository's error; the demo adapter raises
    // ModuleError — unifying the error class across adapters is a later cleanup.)
    await assert.rejects(orgs.editOrganizationDescription(member, org, "membership is not ownership"));

    await db.insert(schema.organizationAffiliations).values({ personId: owner.personId, organizationId: org, status: "active" });
    await db.insert(schema.roleGrants).values({ id: `g-${crypto.randomUUID()}`, personId: owner.personId, organizationId: org, role: "business_admin", grantedBy: owner.personId });
    await orgs.editOrganizationDescription(owner, org, "Fresh bread daily");
    assert.equal((await directory.readDirectory(member, community)).organizations[0].description, "Fresh bread daily");
  } finally {
    if (client) await client.end();
    await admin.end();
  }
});
