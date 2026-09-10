import assert from "node:assert/strict";
import test from "node:test";
import { DemoRelationships } from "./relationships";
import { createDemoWorld, DEMO_COMMUNITY_ID, DEMO_OTHER_PERSON_ID } from "./demo-world";
import { DEMO_ACTOR_ID } from "./ids";
import { ModuleError } from "./types";

const actor = { personId: DEMO_ACTOR_ID, name: "Collab member" };
const other = { personId: DEMO_OTHER_PERSON_ID, name: "Jordan Rivera" };
const sam = { personId: "demo-person-sam", name: "Sam Member" };

// A third active member of the demo community, so "not connected" paths are testable.
function world() {
  const w = createDemoWorld();
  w.people.set(sam.personId, { id: sam.personId, name: sam.name });
  w.personMemberships.push({ personId: sam.personId, communityId: DEMO_COMMUNITY_ID, status: "active" });
  return w;
}

async function connectActorAndOther(rel: DemoRelationships) {
  const { id } = await rel.requestIntroduction(actor, { communityId: DEMO_COMMUNITY_ID, partyIds: [other.personId], contact: "me@x" });
  await rel.respondToIntroduction(other, id, "accepted", "you@y");
  return id;
}

test("demo Relationships: contact is shared only after acceptance, then a connection forms", async () => {
  const rel = new DemoRelationships(world());
  const { id } = await rel.requestIntroduction(actor, { communityId: DEMO_COMMUNITY_ID, partyIds: [other.personId], message: "Meet", contact: "me@x" });
  const contact = async (who: typeof actor, about: string) =>
    (await rel.readIntroductions(who)).introductions.find(i => i.id === id)?.participants.find(p => p.personId === about)?.contact;

  // Before acceptance the recipient sees no contact; the initiator sees only their own.
  assert.equal(await contact(other, actor.personId), "");
  assert.equal(await contact(actor, other.personId), "");
  assert.equal(await contact(actor, actor.personId), "me@x");
  // A non-participant cannot respond.
  await assert.rejects(rel.respondToIntroduction(sam, id, "accepted"), ModuleError);

  await rel.respondToIntroduction(other, id, "accepted", "you@y");
  // Now contacts are mutually visible and the intro is accepted.
  assert.equal(await contact(other, actor.personId), "me@x");
  assert.equal(await contact(actor, other.personId), "you@y");
  assert.equal((await rel.readIntroductions(actor)).introductions.find(i => i.id === id)?.status, "accepted");
  // Responding again is refused.
  await assert.rejects(rel.respondToIntroduction(other, id, "declined"), ModuleError);

  // A connection now exists between the two, and no one else.
  assert.ok((await rel.readConnections(actor)).connections.some(c => c.personId === other.personId));
  assert.ok((await rel.readConnections(other)).connections.some(c => c.personId === actor.personId));
  assert.equal((await rel.readConnections(sam)).connections.length, 0);
});

test("demo Relationships: notes are private to their owner", async () => {
  const rel = new DemoRelationships(world());
  await connectActorAndOther(rel);
  await rel.addRelationshipNote(actor, other.personId, "Prefers mornings.");
  assert.equal((await rel.readRelationshipNotes(actor, other.personId)).notes.length, 1);
  // The other party to the connection never sees the note.
  assert.equal((await rel.readRelationshipNotes(other, actor.personId)).notes.length, 0);
  // You can only note a connection.
  await assert.rejects(rel.addRelationshipNote(actor, sam.personId, "not connected"), ModuleError);
});

test("demo Relationships: referrals ride on connections and stay with the two parties", async () => {
  const rel = new DemoRelationships(world());
  await connectActorAndOther(rel);
  // An unconnected member cannot be referred.
  await assert.rejects(rel.createReferral(actor, { communityId: DEMO_COMMUNITY_ID, toPersonId: sam.personId, need: "x" }), ModuleError);
  const { id } = await rel.createReferral(actor, { communityId: DEMO_COMMUNITY_ID, toPersonId: other.personId, need: "Needs a bookkeeper." });
  // Both parties see it (with direction); a third member sees nothing.
  assert.ok((await rel.readReferrals(actor)).referrals.some(r => r.id === id && r.direction === "given"));
  assert.ok((await rel.readReferrals(other)).referrals.some(r => r.id === id && r.direction === "received"));
  assert.equal((await rel.readReferrals(sam)).referrals.length, 0);
  assert.equal((await rel.readReferrals(actor)).referrals.find(r => r.id === id)?.points, 10);
  // Only the receiver can choose Won or Not Won, and an outcome is final.
  await assert.rejects(rel.updateReferralOutcome(sam, id, "won"), ModuleError);
  await assert.rejects(rel.updateReferralOutcome(actor, id, "won"), ModuleError);
  await rel.updateReferralOutcome(other, id, "won");
  assert.equal((await rel.readReferrals(actor)).referrals.find(r => r.id === id)?.points, 50);
  await assert.rejects(rel.updateReferralOutcome(other, id, "not_won"), ModuleError);

  const { id: notWonId } = await rel.createReferral(actor, { communityId: DEMO_COMMUNITY_ID, toPersonId: other.personId, need: "Needs a printer." });
  await rel.updateReferralOutcome(other, notWonId, "not_won");
  assert.equal((await rel.readReferrals(actor)).referrals.find(r => r.id === notWonId)?.points, 10);
});

test("demo Relationships: a creator can withdraw a pending introduction", async () => {
  const rel = new DemoRelationships(world());
  const { id } = await rel.requestIntroduction(actor, { communityId: DEMO_COMMUNITY_ID, partyIds: [other.personId] });
  await rel.withdrawIntroduction(actor, id);
  assert.equal((await rel.readIntroductions(actor)).introductions.find(i => i.id === id)?.status, "withdrawn");
  await assert.rejects(rel.respondToIntroduction(other, id, "accepted"), ModuleError);
});
