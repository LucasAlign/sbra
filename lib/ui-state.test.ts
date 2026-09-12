import assert from "node:assert/strict";
import test from "node:test";
import type { Member } from "./types";
import {
  eligibleReferralMembers,
  isValidEmail,
  matchesSearch,
  supportAlertDestination
} from "./ui-state";

test("directory search matches every normalized token regardless of word order", () => {
  const business = "Service 360 Group Plumbing, Heating, Cooling, and Electrical Services";
  assert.equal(matchesSearch(business, "plumb"), true);
  assert.equal(matchesSearch(business, "plumber"), true);
  assert.equal(matchesSearch(business, "heating service"), true);
  assert.equal(matchesSearch(business, "service heating"), true);
  assert.equal(matchesSearch(business, "heating bakery"), false);
});

test("onboarding requires a plausible complete email address", () => {
  assert.equal(isValidEmail("jamie@example.test"), true);
  assert.equal(isValidEmail("not-an-email"), false);
  assert.equal(isValidEmail("name@localhost"), false);
});

test("referral recipients exclude the actor and pending memberships", () => {
  const members = [
    { id: "actor", pending: false },
    { id: "active", pending: false },
    { id: "pending", pending: true }
  ] as Member[];
  assert.deepEqual(eligibleReferralMembers(members, "actor").map((member) => member.id), ["active"]);
});

test("support alerts route administrators to the support queue", () => {
  assert.deepEqual(supportAlertDestination("admin"), { view: "admin", adminTab: "support" });
  assert.deepEqual(supportAlertDestination("member"), { view: "support" });
});
