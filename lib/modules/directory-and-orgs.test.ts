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

// A third active member of the demo community, so response-audience scoping (a
// fellow member who is neither requester nor responder) is observable.
const third = { personId: "demo-person-sam", name: "Sam Member" };
function worldWithThird() {
  const world = createDemoWorld();
  world.people.set(third.personId, { id: third.personId, name: third.name });
  world.personMemberships.push({ personId: third.personId, communityId: DEMO_COMMUNITY_ID, status: "active" });
  return world;
}

test("demo Opportunities: private until published, then visible to community members", async () => {
  const world = worldWithThird();
  const disc = new DemoDiscoveryPublishing(world);
  const seen = (r: { opportunities: { id: string }[] }, id: string) => r.opportunities.some(o => o.id === id);

  // Posting on behalf of an org you do not administer is rejected.
  await assert.rejects(disc.postOpportunity(other, { communityId: DEMO_COMMUNITY_ID, kind: "need", title: "x", organizationId: "demo-brightside" }), ModuleError);
  // Non-members cannot post.
  await assert.rejects(disc.postOpportunity(stranger, { communityId: DEMO_COMMUNITY_ID, kind: "need", title: "x" }), ModuleError);

  const { id } = await disc.postOpportunity(other, { communityId: DEMO_COMMUNITY_ID, kind: "need", title: "Need a printer", detail: "Flyers." });
  // Private: only the author sees it.
  assert.ok(seen(await disc.readOpportunities(other, DEMO_COMMUNITY_ID), id));
  assert.ok(!seen(await disc.readOpportunities(actor, DEMO_COMMUNITY_ID), id));
  assert.ok(!seen(await disc.readOpportunities(third, DEMO_COMMUNITY_ID), id));

  // Only the author may publish.
  await assert.rejects(disc.publishOpportunity(actor, id), ModuleError);
  await disc.publishOpportunity(other, id);

  // Published: members see it; a stranger never does.
  assert.ok(seen(await disc.readOpportunities(actor, DEMO_COMMUNITY_ID), id));
  assert.ok(seen(await disc.readOpportunities(third, DEMO_COMMUNITY_ID), id));
  assert.ok(!seen(await disc.readOpportunities(stranger, DEMO_COMMUNITY_ID), id));
});

test("demo Opportunities: responses stay private to requester/responder unless shared", async () => {
  const world = worldWithThird();
  const disc = new DemoDiscoveryPublishing(world);
  const has = (r: { responses: { id: string }[] }, id: string) => r.responses.some(x => x.id === id);
  // Requester (other) posts and publishes; responder (actor) replies.
  const { id: opp } = await disc.postOpportunity(other, { communityId: DEMO_COMMUNITY_ID, kind: "need", title: "Need a caterer" });
  await disc.publishOpportunity(other, opp);
  const { id: resp } = await disc.respondToOpportunity(actor, opp, "I cater events.");
  // A stranger (outside the audience) cannot respond.
  await assert.rejects(disc.respondToOpportunity(stranger, opp, "me"), ModuleError);

  // Before sharing: responder and requester see it; a fellow member does not.
  assert.ok(has(await disc.readResponses(actor, opp), resp));
  assert.ok(has(await disc.readResponses(other, opp), resp));
  assert.ok(!has(await disc.readResponses(third, opp), resp));

  // Only the responder controls sharing.
  await assert.rejects(disc.shareResponse(other, resp, true), ModuleError);
  await disc.shareResponse(actor, resp, true);
  // Shared: the fellow member now sees it; a stranger still does not.
  assert.ok(has(await disc.readResponses(third, opp), resp));
  assert.equal((await disc.readResponses(stranger, opp)).responses.length, 0);

  // Re-responding edits the single response without changing its shared state.
  const again = await disc.respondToOpportunity(actor, opp, "Updated: I cater events and meetings.");
  assert.equal(again.id, resp);
  assert.equal(world.responses.find(r => r.id === resp)?.shared, true);
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

// A second active community with the actor as a member of both, so shared event
// discovery across communities is observable in the demo world.
const COMMUNITY_2 = "demo-community-2";
const sam = { personId: "demo-person-sam", name: "Sam Member" };
function worldForEvents() {
  const world = createDemoWorld();
  world.communities.set(COMMUNITY_2, { id: COMMUNITY_2, status: "active" });
  world.people.set(sam.personId, { id: sam.personId, name: sam.name });
  world.personMemberships.push(
    { personId: DEMO_ACTOR_ID, communityId: COMMUNITY_2, status: "active" }, // organizer in both
    { personId: sam.personId, communityId: COMMUNITY_2, status: "active" },  // C2 only
  );
  return world;
}
const soon = () => new Date(Date.now() + 86_400_000);

test("demo Events: one event reaches two communities with a single shared ID", async () => {
  const disc = new DemoDiscoveryPublishing(worldForEvents());
  const has = (r: { events: { id: string }[] }, id: string) => r.events.some(e => e.id === id);
  const { id } = await disc.createEvent(actor, { communityId: DEMO_COMMUNITY_ID, title: "Mixer", startsAt: soon() });
  // A non-organizer cannot publish it elsewhere.
  await assert.rejects(disc.publishEvent(other, id, COMMUNITY_2), ModuleError);
  await disc.publishEvent(actor, id, COMMUNITY_2);
  // The same ID surfaces in both communities; each community's member sees it.
  assert.ok(has(await disc.readEvents(other, DEMO_COMMUNITY_ID), id)); // C1 member
  assert.ok(has(await disc.readEvents(sam, COMMUNITY_2), id));         // C2 member
  // A stranger who belongs to neither community never sees it.
  assert.ok(!has(await disc.readEvents(stranger, DEMO_COMMUNITY_ID), id));
});

test("demo Events: capacity enforced, one RSVP per person, attendance private", async () => {
  const world = worldForEvents();
  const disc = new DemoDiscoveryPublishing(world);
  const { id } = await disc.createEvent(actor, { communityId: DEMO_COMMUNITY_ID, title: "Small workshop", startsAt: soon(), capacity: 1 });
  await disc.publishEvent(actor, id, COMMUNITY_2);

  // One spot: the first 'going' takes it; the next is turned away.
  await disc.rsvpToEvent(other, id, "going");
  await assert.rejects(disc.rsvpToEvent(sam, id, "going"), /full/i);
  // 'not_going' never consumes a spot; repeating 'going' does not add a row.
  await disc.rsvpToEvent(sam, id, "not_going");
  await disc.rsvpToEvent(other, id, "going");
  assert.equal(world.rsvps.filter(r => r.eventId === id).length, 2);
  assert.equal(world.rsvps.filter(r => r.eventId === id && r.status === "going").length, 1);

  // Attendance is private: the organizer sees the roster; a member does not.
  const roster = await disc.readEventAttendance(actor, id);
  assert.ok(roster.attendees.some(a => a.personId === other.personId && a.status === "going"));
  await assert.rejects(disc.readEventAttendance(other, id), ModuleError);
  // A member sees their own status and `full`, but not the going count.
  const view = (await disc.readEvents(other, DEMO_COMMUNITY_ID)).events.find(e => e.id === id)!;
  assert.equal(view.myStatus, "going");
  assert.equal(view.full, true);
  assert.equal(view.goingCount, null);
  // The organizer's view carries the count.
  assert.equal((await disc.readEvents(actor, DEMO_COMMUNITY_ID)).events.find(e => e.id === id)!.goingCount, 1);

  // A stranger cannot RSVP; canceling is the organizer's and blocks new RSVPs.
  await assert.rejects(disc.rsvpToEvent(stranger, id, "going"), ModuleError);
  await assert.rejects(disc.cancelEvent(other, id), ModuleError);
  await disc.cancelEvent(actor, id);
  await assert.rejects(disc.rsvpToEvent(sam, id, "going"), /canceled/i);
});
