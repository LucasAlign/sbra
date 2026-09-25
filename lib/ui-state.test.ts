import assert from "node:assert/strict";
import test from "node:test";
import type { Member } from "./types";
import { hasLeadContact, invoiceReadinessError } from "./member-validation";

test("leads need both a name and contact details", () => {
  assert.equal(hasLeadContact(" ", "555-0100"), false);
  assert.equal(hasLeadContact("Sam", " "), false);
  assert.equal(hasLeadContact("Sam", "555-0100"), true);
});

test("invoice readiness rejects blank, invalid and zero-value documents", () => {
  const doc = { fromName: "Shop", toName: "Client", number: "1001", date: "2026-09-24", dueDate: "", taxRate: "", items: [{ desc: "Service", qty: "1", rate: "20" }] };
  assert.equal(invoiceReadinessError(doc), null);
  assert.ok(invoiceReadinessError({ ...doc, toName: " " }));
  assert.ok(invoiceReadinessError({ ...doc, dueDate: "2026-09-23" }));
  assert.ok(invoiceReadinessError({ ...doc, items: [] }));
  for (const rate of ["", "0", "-1", "Infinity"]) assert.ok(invoiceReadinessError({ ...doc, items: [{ desc: "Service", qty: "1", rate }] }));
  assert.ok(invoiceReadinessError({ ...doc, items: [{ desc: " ", qty: "1", rate: "20" }] }));
});
import {
  eligibleReferralMembers,
  isValidEmail,
  matchesSearch,
  readAppLocation,
  supportAlertDestination
} from "./ui-state";

test("bookmarks restore valid screens and keep directory-only communities scoped", () => {
  assert.deepEqual(readAppLocation("#view=support&community=sbra"), { view: "support", community: "sbra" });
  assert.deepEqual(readAppLocation("#view=admin&community=berks-latino-chamber"), { view: "directory", community: "berks-latino-chamber" });
  assert.deepEqual(readAppLocation("#view=bad&community=bad"), { view: "community", community: "sbra" });
});

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
