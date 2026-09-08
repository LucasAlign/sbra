import assert from "node:assert/strict";
import test from "node:test";
import { DemoDiscoveryPublishing } from "./discovery-publishing";
import { DemoOrganizationsMembership } from "./organizations-membership";
import { createDemoWorld, DEMO_COMMUNITY_ID, DEMO_OTHER_PERSON_ID } from "./demo-world";
import { DEMO_ACTOR_ID } from "./ids";
import { ModuleError } from "./types";

const actor = { personId: DEMO_ACTOR_ID, name: "Collab member" };
const other = { personId: DEMO_OTHER_PERSON_ID, name: "Jordan Rivera" };
const stranger = { personId: "nobody", name: "Nobody" };

test("demo Discovery: members see the authorized directory, public fields only", async () => {
  const directory = new DemoDiscoveryPublishing(createDemoWorld());
  const result = await directory.readDirectory(actor, DEMO_COMMUNITY_ID);
  assert.deepEqual(result.organizations.map(o => o.id), ["demo-brightside", "demo-riverworks"]);
  assert.deepEqual(Object.keys(result.organizations[0]).sort(), ["description", "id", "kind", "name"]);
  assert.equal(result.nextCursor, null);
});

test("demo Discovery: non-members and unknown communities are rejected", async () => {
  const directory = new DemoDiscoveryPublishing(createDemoWorld());
  await assert.rejects(directory.readDirectory(stranger, DEMO_COMMUNITY_ID), ModuleError);
  await assert.rejects(directory.readDirectory(actor, "unknown-community"), ModuleError);
});

test("demo Discovery: keyset pagination is bounded and resumable", async () => {
  const world = createDemoWorld();
  // Add enough orgs to force a second page (page size is 25).
  for (let i = 0; i < 30; i++) {
    const id = `demo-org-${String(i).padStart(2, "0")}`;
    world.organizations.set(id, { id, name: `Org ${i}`, description: "", kind: "business" });
    world.orgMemberships.push({ organizationId: id, communityId: DEMO_COMMUNITY_ID, status: "active" });
  }
  const directory = new DemoDiscoveryPublishing(world);
  const first = await directory.readDirectory(actor, DEMO_COMMUNITY_ID);
  assert.equal(first.organizations.length, 25);
  assert.ok(first.nextCursor);
  const second = await directory.readDirectory(actor, DEMO_COMMUNITY_ID, first.nextCursor!);
  assert.ok(second.organizations.length > 0);
  // No id repeats across pages.
  const ids = new Set(first.organizations.map(o => o.id));
  assert.ok(second.organizations.every(o => !ids.has(o.id)));
});

test("demo Organizations: only an affiliated Business Admin may edit", async () => {
  const world = createDemoWorld();
  const orgs = new DemoOrganizationsMembership(world);
  const directory = new DemoDiscoveryPublishing(world);

  await orgs.editOrganizationDescription(actor, "demo-brightside", "  New description  ");
  const listing = await directory.readDirectory(actor, DEMO_COMMUNITY_ID);
  assert.equal(listing.organizations.find(o => o.id === "demo-brightside")?.description, "New description");

  // Membership is not ownership; a member without a grant cannot edit.
  await assert.rejects(orgs.editOrganizationDescription(other, "demo-brightside", "hijack"), ModuleError);
  // The actor admins brightside, not riverworks.
  await assert.rejects(orgs.editOrganizationDescription(actor, "demo-riverworks", "not mine"), ModuleError);
  // Oversized input is rejected.
  await assert.rejects(orgs.editOrganizationDescription(actor, "demo-brightside", "x".repeat(5001)), ModuleError);
});

test("demo Organizations: a revoked grant no longer authorizes edits", async () => {
  const world = createDemoWorld();
  world.grants[0].revokedAt = new Date();
  const orgs = new DemoOrganizationsMembership(world);
  await assert.rejects(orgs.editOrganizationDescription(actor, "demo-brightside", "revoked"), ModuleError);
});
