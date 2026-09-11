import assert from "node:assert/strict";
import test from "node:test";
import { crmDashboard, normalizeCrmStore, previewCrmCsv, receivedReferralCandidates } from "./crm";

test("CRM migrates legacy contacts and their follow-up dates into a business workspace", () => {
  const store = normalizeCrmStore([{ id: "c1", name: "Pat", company: "Pat Co", followUp: "2026-09-11" }], "biz-1");
  const workspace = store.workspaces["biz-1"];
  assert.equal(workspace.contacts[0].name, "Pat");
  assert.equal(workspace.tasks[0].contactId, "c1");
  assert.equal(workspace.tasks[0].dueDate, "2026-09-11");
});

test("CRM dashboard separates due, overdue, open, and won work", () => {
  const store = normalizeCrmStore(null, "biz-1");
  const workspace = store.workspaces["biz-1"];
  workspace.tasks = [
    { id: "late", title: "Late", dueDate: "2026-09-09", createdAt: 1 },
    { id: "today", title: "Today", dueDate: "2026-09-10", createdAt: 2 },
    { id: "done", title: "Done", dueDate: "2026-09-09", completedAt: "2026-09-09", createdAt: 3 }
  ];
  workspace.opportunities = [
    { id: "open", contactId: "c1", title: "Open", stage: "proposal", value: null, expectedClose: "", source: "manual", note: "", stageHistory: [], createdAt: 1, updatedAt: 1 },
    { id: "won", contactId: "c1", title: "Won", stage: "won", value: null, expectedClose: "", source: "manual", note: "", stageHistory: [], createdAt: 1, updatedAt: 1 }
  ];
  assert.deepEqual(crmDashboard(workspace, "2026-09-10"), { contacts: 0, dueToday: 1, overdue: 1, openOpportunities: 1, wonOpportunities: 1 });
});

test("CRM offers each open received referral for conversion only once", () => {
  const store = normalizeCrmStore(null, "biz-1");
  const workspace = store.workspaces["biz-1"];
  workspace.opportunities.push({ id: "o1", contactId: "c1", title: "Existing", stage: "new", value: null, expectedClose: "", source: "referral", referralId: "r1", note: "", stageHistory: [], createdAt: 1, updatedAt: 1 });
  const referrals = [
    { id: "r1", kind: "lead" as const, giverId: "m2", receiverId: "m1", need: "One", status: "sent" as const, createdAt: 1 },
    { id: "r2", kind: "lead" as const, giverId: "m2", receiverId: "m1", need: "Two", status: "sent" as const, createdAt: 1 },
    { id: "r3", kind: "lead" as const, giverId: "m2", receiverId: "m1", need: "Three", status: "not_won" as const, createdAt: 1 }
  ];
  assert.deepEqual(receivedReferralCandidates(referrals, "m1", workspace).map(referral => referral.id), ["r2"]);
});

test("CSV import previews new, duplicate, and invalid contacts", () => {
  const existing = normalizeCrmStore([{ name: "Pat", email: "pat@example.com", phone: "(555) 111-2222" }], "biz-1").workspaces["biz-1"].contacts;
  const preview = previewCrmCsv("Name,Email,Phone\nPat Again,PAT@example.com,\nLee,lee@example.com,555-999-0000\nNo Email,bad-email,", existing);
  assert.deepEqual(preview.map(row => row.status), ["duplicate", "ready", "invalid"]);
});

test("CSV import handles quoted commas and duplicates within the file", () => {
  const preview = previewCrmCsv('Name,Company,Phone\n"Nguyen, Sam","Bright, Inc",5551112222\nOther,Elsewhere,(555) 111-2222', []);
  assert.equal(preview[0].contact.name, "Nguyen, Sam");
  assert.equal(preview[0].contact.company, "Bright, Inc");
  assert.equal(preview[1].status, "duplicate");
});
