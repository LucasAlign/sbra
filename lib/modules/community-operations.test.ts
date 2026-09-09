import assert from "node:assert/strict";
import test from "node:test";
import { DemoCommunityOperations } from "./community-operations";
import { DemoDiscoveryPublishing } from "./discovery-publishing";
import { DemoRelationships } from "./relationships";
import { createDemoWorld, DEMO_COMMUNITY_ID, DEMO_OTHER_PERSON_ID } from "./demo-world";
import { DEMO_ACTOR_ID } from "./ids";
import { ModuleError } from "./types";

// In the demo world the actor administers the community; the other person is a
// plain member; a stranger belongs to nothing.
const actor = { personId: DEMO_ACTOR_ID, name: "Collab member" };
const other = { personId: DEMO_OTHER_PERSON_ID, name: "Jordan Rivera" };
const stranger = { personId: "nobody", name: "Nobody" };

test("demo Announcements: author authority, audience, and comments inherit access", async () => {
  const ops = new DemoCommunityOperations(createDemoWorld());
  // Author authority: a plain member cannot announce.
  await assert.rejects(ops.createAnnouncement(other, { communityId: DEMO_COMMUNITY_ID, title: "x" }), ModuleError);
  const { id } = await ops.createAnnouncement(actor, { communityId: DEMO_COMMUNITY_ID, title: "Mixer", body: "Soon." });

  // A member of the community sees it; a stranger does not.
  assert.ok((await ops.readAnnouncements(other, DEMO_COMMUNITY_ID)).announcements.some(a => a.id === id));
  assert.equal((await ops.readAnnouncements(stranger, DEMO_COMMUNITY_ID)).announcements.length, 0);

  // A member can comment; a stranger cannot even see it. Comments inherit the
  // announcement's audience, so the author sees the member's comment.
  const { id: c } = await ops.commentOnAnnouncement(other, id, "Great!");
  await assert.rejects(ops.commentOnAnnouncement(stranger, id, "no"), ModuleError);
  assert.ok((await ops.readAnnouncementComments(actor, id)).comments.some(x => x.id === c));
  assert.equal((await ops.readAnnouncements(actor, DEMO_COMMUNITY_ID)).announcements.find(a => a.id === id)?.commentCount, 1);
});

test("demo Home workspace: surfaces the actor's open items across modules", async () => {
  const world = createDemoWorld();
  const ops = new DemoCommunityOperations(world);
  const disc = new DemoDiscoveryPublishing(world);
  const rel = new DemoRelationships(world);

  // An announcement, an upcoming event, an open opportunity, and an introduction
  // awaiting the other member.
  await ops.createAnnouncement(actor, { communityId: DEMO_COMMUNITY_ID, title: "Notice" });
  const { id: event } = await disc.createEvent(actor, { communityId: DEMO_COMMUNITY_ID, title: "Meetup", startsAt: new Date(Date.now() + 86_400_000) });
  const { id: opp } = await disc.postOpportunity(other, { communityId: DEMO_COMMUNITY_ID, kind: "need", title: "Need help" });
  await disc.publishOpportunity(other, opp);
  const { id: intro } = await rel.requestIntroduction(actor, { communityId: DEMO_COMMUNITY_ID, partyIds: [other.personId], contact: "me@x" });

  const home = await ops.readHomeWorkspace(other);
  assert.ok(home.introductionsAwaiting.some(i => i.id === intro));
  assert.ok(home.upcomingEvents.some(e => e.id === event));
  assert.ok(home.openOpportunities.some(o => o.id === opp && o.mine));
  assert.ok(home.announcements.length >= 1);
});
