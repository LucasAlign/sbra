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
  assert.deepEqual(Object.keys(result.organizations[0]).sort(),
    ["description", "id", "kind", "localOffer", "locations", "name", "serviceAreas", "website"]);
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
    world.organizations.set(id, { id, name: `Org ${i}`, description: "", kind: "business", website: "", locations: "", serviceAreas: "" });
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

test("demo Organizations: a canonical profile edit shows in the listing", async () => {
  const world = createDemoWorld();
  const orgs = new DemoOrganizationsMembership(world);
  const directory = new DemoDiscoveryPublishing(world);
  await orgs.editOrganizationProfile(actor, "demo-brightside", { name: "Brightside Bakery & Cafe", serviceAreas: "Reading, Wyomissing" });
  const listing = await directory.readDirectory(actor, DEMO_COMMUNITY_ID);
  const org = listing.organizations.find(o => o.id === "demo-brightside");
  assert.equal(org?.name, "Brightside Bakery & Cafe");
  assert.equal(org?.serviceAreas, "Reading, Wyomissing");
  // Invalid kind is rejected.
  await assert.rejects(orgs.editOrganizationProfile(actor, "demo-brightside", { kind: "spaceship" }), ModuleError);
});

test("demo Organizations: a listing override is local and can hide a listing", async () => {
  const world = createDemoWorld();
  const orgs = new DemoOrganizationsMembership(world);
  const directory = new DemoDiscoveryPublishing(world);
  await orgs.setListingOverride(actor, "demo-brightside", DEMO_COMMUNITY_ID, { headline: "Local special: free coffee", localOffer: "10% off for members" });
  const listing = await directory.readDirectory(actor, DEMO_COMMUNITY_ID);
  const org = listing.organizations.find(o => o.id === "demo-brightside");
  assert.equal(org?.description, "Local special: free coffee"); // headline wins for presentation
  assert.equal(org?.localOffer, "10% off for members");
  // The canonical description is untouched by the override.
  assert.equal(world.organizations.get("demo-brightside")?.description, "Fresh bread and pastries on Penn Ave.");
  // Hiding drops it from the directory.
  await orgs.setListingOverride(actor, "demo-brightside", DEMO_COMMUNITY_ID, { visibility: "hidden" });
  const hidden = await directory.readDirectory(actor, DEMO_COMMUNITY_ID);
  assert.equal(hidden.organizations.find(o => o.id === "demo-brightside"), undefined);
  // Only a Business Admin of the org may set it.
  await assert.rejects(orgs.setListingOverride(other, "demo-brightside", DEMO_COMMUNITY_ID, { headline: "x" }), ModuleError);
});

test("demo Claims: request -> admin vouch -> Business Admin grant", async () => {
  const world = createDemoWorld();
  const orgs = new DemoOrganizationsMembership(world);
  // Jordan is a member but has no authority over riverworks yet.
  await assert.rejects(orgs.editOrganizationDescription(other, "demo-riverworks", "mine now"), ModuleError);
  const { id } = await orgs.requestClaim(other, "demo-riverworks", DEMO_COMMUNITY_ID, "I own Riverworks.");
  // A second request is idempotent while one is pending.
  const again = await orgs.requestClaim(other, "demo-riverworks", DEMO_COMMUNITY_ID, "again");
  assert.equal(again.id, id);
  // The admin sees the pending claim and approves it.
  const pending = await orgs.readClaimRequests(actor, DEMO_COMMUNITY_ID);
  assert.equal(pending.claims.find(c => c.id === id)?.personName, "Jordan Rivera");
  await orgs.reviewClaim(actor, id, "approved");
  // Jordan can now edit the business they represent.
  await orgs.editOrganizationDescription(other, "demo-riverworks", "Bookkeeping done right.");
  assert.equal(world.organizations.get("demo-riverworks")?.description, "Bookkeeping done right.");
  // The claim is off the pending queue.
  const cleared = await orgs.readClaimRequests(actor, DEMO_COMMUNITY_ID);
  assert.equal(cleared.claims.length, 0);
});

test("demo Claims: only a community admin may review, and never their own claim", async () => {
  const world = createDemoWorld();
  const orgs = new DemoOrganizationsMembership(world);
  const { id } = await orgs.requestClaim(other, "demo-riverworks", DEMO_COMMUNITY_ID, "mine");
  // A plain member cannot review.
  await assert.rejects(orgs.readClaimRequests(other, DEMO_COMMUNITY_ID), ModuleError);
  await assert.rejects(orgs.reviewClaim(other, id, "approved"), ModuleError);
  // An admin filing their own claim cannot approve it themselves.
  const self = await orgs.requestClaim(actor, "demo-riverworks", DEMO_COMMUNITY_ID, "also mine");
  await assert.rejects(orgs.reviewClaim(actor, self.id, "approved"), ModuleError);
});
