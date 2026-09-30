import test from "node:test";
import assert from "node:assert/strict";
import { nationwideCommunities, nationwideSeed, showcaseMember, demoToolSamples, demoCrmStore } from "./nationwide-demo";
import { communityCatalog } from "./network/catalog";
import { readAppLocation } from "./ui-state";

test("fictional networks stay out of the production catalog and support bookmarks", () => {
  for (const community of nationwideCommunities) {
    assert.ok(!communityCatalog.some(c => c.id === community.id));
    assert.equal(readAppLocation(`#view=events&community=${community.id}`).community, community.id);
  }
  assert.equal(nationwideSeed("sbra"), undefined);
});

test("every demo relationship, comment, and RSVP resolves within its community", () => {
  const contentIds = new Set<string>();
  for (const community of nationwideCommunities) {
    const data = nationwideSeed(community.id)!;
    const members = new Set(data.members.map(m => m.id));
    const businesses = new Set(data.businesses.map(b => b.id));
    const posts = new Set(data.posts.map(p => p.id));
    const events = new Set(data.events.map(e => e.id));
    assert.ok(members.has(showcaseMember.id));
    data.members.forEach(m => assert.ok(businesses.has(m.businessId)));
    data.posts.forEach(p => assert.ok(members.has(p.authorId!)));
    data.comments.forEach(c => { assert.ok(posts.has(c.postId)); assert.ok(members.has(c.authorId)); });
    data.reactions.forEach(r => { assert.ok(posts.has(r.postId)); assert.ok(members.has(r.memberId)); });
    data.rsvps.forEach(r => { assert.ok(events.has(r.eventId)); assert.ok(members.has(r.memberId)); });
    data.referrals.forEach(r => { assert.ok(members.has(r.giverId)); assert.ok(members.has(r.receiverId)); assert.ok(members.has(r.introducedMemberId!)); });
    for (const record of [...data.posts, ...data.events, ...data.referrals]) {
      assert.ok(!contentIds.has(record.id), `Duplicate community record: ${record.id}`);
      contentIds.add(record.id);
    }
  }
});

test("tool examples are serializable and have reserved example contacts", () => {
  const samples = demoToolSamples();
  assert.doesNotThrow(() => JSON.parse(JSON.stringify(samples)));
  const workspace = demoCrmStore().workspaces[showcaseMember.businessId];
  const contacts = workspace.contacts;
  assert.ok(workspace.tasks.every(t => contacts.some(c => c.id === t.contactId)));
  assert.ok(workspace.opportunities.every(o => contacts.some(c => c.id === o.contactId)));
  assert.equal(contacts.length, 6);
  assert.ok(contacts.every(c => c.email.endsWith("@example.com")));
});
