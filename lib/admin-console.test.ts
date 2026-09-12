import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCsv,
  canonicalSupportStatus,
  correctReferralStatus,
  duplicateEvent,
  filterModerationPosts,
  isStaleReferral,
  recordModerationAction,
  updateBusinessProfile,
  validateEventTiming
} from "./admin-console";
import type { Business, CommunityEvent, CommunityPost, Referral } from "./types";

test("canonicalSupportStatus maps legacy workflow text to an honest admin state", () => {
  assert.equal(canonicalSupportStatus("Resolved yesterday"), "Resolved");
  assert.equal(canonicalSupportStatus("Closed by staff"), "Resolved");
  assert.equal(canonicalSupportStatus("Assigned to SBRA staff"), "In progress");
  assert.equal(canonicalSupportStatus("Waiting on member match"), "In progress");
  assert.equal(canonicalSupportStatus("New request"), "Open");
});

test("buildCsv escapes commas, quotes, and newlines", () => {
  assert.equal(
    buildCsv([
      ["Metric", "Value"],
      ["Members, active", 85],
      ["Quoted", 'a "value"'],
      ["Line", "one\ntwo"]
    ]),
    'Metric,Value\n"Members, active",85\nQuoted,"a ""value"""\nLine,"one\ntwo"'
  );
});

test("isStaleReferral identifies only open referrals past the threshold", () => {
  const now = Date.UTC(2026, 8, 11);
  const referral = { id: "r1", status: "sent", createdAt: now - 8 * 86_400_000 } as Referral;
  assert.equal(isStaleReferral(referral, now), true);
  assert.equal(isStaleReferral({ ...referral, status: "won" }, now), false);
  assert.equal(isStaleReferral({ ...referral, createdAt: now - 6 * 86_400_000 }, now), false);
});

test("filterModerationPosts supports all, hidden, and visible text search", () => {
  const posts = [
    { id: "p1", author: "Ari", businessName: "Studio 413", category: "Win", body: "Ribbon cutting", hidden: false },
    { id: "p2", author: "Jordan", businessName: "SBRA", category: "Announcement", body: "Deadline", hidden: true }
  ] as CommunityPost[];

  assert.deepEqual(filterModerationPosts(posts, "hidden", "").map((post) => post.id), ["p2"]);
  assert.deepEqual(filterModerationPosts(posts, "all", "studio").map((post) => post.id), ["p1"]);
  assert.deepEqual(filterModerationPosts(posts, "visible", "deadline"), []);
});

test("event helpers preserve duration while duplicating and reject inverted times", () => {
  const event = { id: "e1", title: "Breakfast", startsAt: 1_000, endsAt: 4_600, status: "canceled" } as CommunityEvent;
  assert.equal(validateEventTiming(5_000, 4_999), "End time must be after the start time.");
  assert.equal(validateEventTiming(5_000, 6_000), null);
  assert.deepEqual(duplicateEvent(event, "e2", 11_000), {
    ...event, id: "e2", title: "Breakfast (copy)", startsAt: 11_000, endsAt: 14_600, status: "scheduled"
  });
});

test("referral corrections retain a privacy-safe audit trail", () => {
  const referral = { id: "r1", status: "sent", createdAt: 100 } as Referral;
  const corrected = correctReferralStatus(referral, "won", "Jordan", 500, "Confirmed with receiver");
  assert.equal(corrected.status, "won");
  assert.equal(corrected.closedAt, 500);
  assert.deepEqual(corrected.adminAudit, [{
    at: 500, actor: "Jordan", fromStatus: "sent", toStatus: "won", note: "Confirmed with receiver"
  }]);
  assert.equal("prospectContact" in corrected.adminAudit![0], false);
});

test("business profile updates trim editable directory fields", () => {
  const business = { id: "b1", name: "Old", tier: "solo" } as Business;
  const updated = updateBusinessProfile(business, {
    name: " New Name ", category: " Legal ", description: " About ", servicesOffered: " Contracts ",
    referralsWanted: " Founders ", website: " https://example.test ", address: " 1 Main ", city: " Reading "
  });
  assert.equal(updated.name, "New Name");
  assert.equal(updated.city, "Reading");
  assert.equal(updated.tier, "solo");
});

test("moderation actions require a reason and append visible history", () => {
  const post = { id: "p1", hidden: false } as CommunityPost;
  assert.throws(() => recordModerationAction(post, "hidden", " ", "Jordan", 50), /reason/i);
  const hidden = recordModerationAction(post, "hidden", "Off-topic solicitation", "Jordan", 50);
  assert.equal(hidden.hidden, true);
  assert.equal(hidden.moderationReason, "Off-topic solicitation");
  assert.deepEqual(hidden.moderationHistory, [
    { at: 50, actor: "Jordan", action: "hidden", reason: "Off-topic solicitation" }
  ]);
});
