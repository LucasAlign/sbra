import assert from "node:assert/strict";
import test from "node:test";
import { canAccess, type AccessFacts } from "./permissions";
import { getCommunity, communityCatalog, communityRegionCatalog } from "./catalog";

const now = new Date("2026-09-08T12:00:00Z");
const actor: AccessFacts = {
  personId: "alice",
  memberships: [
    { personId: "alice", communityId: "a", status: "active" },
    { personId: "alice", communityId: "b", status: "active" },
    { personId: "alice", communityId: "c", status: "suspended" },
  ],
  affiliations: [
    { personId: "alice", organizationId: "one", status: "active" },
    { personId: "alice", organizationId: "two", status: "active" },
  ],
  grants: [
    { personId: "alice", role: "community_admin", communityId: "a" },
    { personId: "alice", role: "community_admin", communityId: "c" },
    { personId: "alice", role: "business_admin", organizationId: "one" },
    { personId: "alice", role: "business_admin", organizationId: "two" },
  ],
};

test("one identity can represent multiple businesses and join multiple communities", () => {
  for (const organizationId of ["one", "two"]) assert.equal(canAccess(actor, { action: "organization.manage", organizationId }), true);
  for (const communityId of ["a", "b"]) assert.equal(canAccess(actor, { action: "community.read", communityId, status: "active" }), true);
  assert.equal(canAccess(actor, { action: "community.manage", communityId: "a", status: "active" }), true);
  assert.equal(canAccess(actor, { action: "community.manage", communityId: "b", status: "active" }), false);
  assert.equal(canAccess(actor, { action: "organization.manage", organizationId: "unrelated" }), false);
});

test("suspension and community closure override an administrative grant", () => {
  assert.equal(canAccess(actor, { action: "community.manage", communityId: "c", status: "active" }), false);
  assert.equal(canAccess(actor, { action: "community.read", communityId: "a", status: "archived" }), false);
  assert.equal(canAccess({ ...actor, affiliations: [] }, { action: "organization.manage", organizationId: "one" }), false);
});

test("expired, revoked, and another person's grants do not confer access", () => {
  for (const grant of [
    { personId: "alice", expiresAt: now },
    { personId: "alice", revokedAt: now },
    { personId: "bob" },
  ]) {
    assert.equal(canAccess({ ...actor, grants: [{ ...grant, role: "community_admin", communityId: "a" }] },
      { action: "community.manage", communityId: "a", status: "active" }, now), false);
  }
});

test("platform and regional administration do not inherit private tenant access", () => {
  const admin: AccessFacts = { ...actor, memberships: [], grants: [
    { personId: "alice", role: "platform_admin" },
    { personId: "alice", role: "regional_admin", regionId: "berks" },
  ] };
  assert.equal(canAccess(admin, { action: "platform.manage" }), true);
  assert.equal(canAccess(admin, { action: "region.manage", regionId: "berks" }), true);
  assert.equal(canAccess(admin, { action: "region.manage", regionId: "other" }), false);
  assert.equal(canAccess(admin, { action: "community.read", communityId: "a", status: "active" }), false);
  assert.equal(canAccess(admin, { action: "relationship.read", participantIds: ["bob", "carol"] }), false);
  assert.equal(canAccess(admin, { action: "relationship.read", participantIds: ["alice", "bob"] }), true);
});

test("public visitors cannot use private identities or grants", () => {
  const visitor = { ...actor, personId: null };
  assert.equal(canAccess(visitor, { action: "public.read" }), true);
  assert.equal(canAccess(visitor, { action: "community.read", communityId: "a", status: "active" }), false);
});

test("Berks is configuration with separate geographic and operator communities", () => {
  assert.equal(getCommunity("berks-community").kind, "geographic");
  assert.notEqual(getCommunity("sbra").operatorId, getCommunity("berks-latino-chamber").operatorId);
  assert.equal(communityRegionCatalog.length, communityCatalog.length);
  assert.throws(() => getCommunity("unknown"), /Unknown community/);
});
