import assert from "node:assert/strict";
import test from "node:test";
import { DemoIdentityAccess } from "./identity-access";
import { ModuleError } from "./types";

test("demo Identity & Access: resolve, read, and edit a profile", async () => {
  const module = new DemoIdentityAccess();

  const first = await module.resolveActor({ provider: "google", subject: "alice" }, "Alice");
  const again = await module.resolveActor({ provider: "google", subject: "alice" }, "Ignored");
  assert.equal(first.personId, again.personId); // First sight creates; later sights reuse.
  assert.equal(again.name, "Alice");

  const bob = await module.resolveActor({ provider: "google", subject: "bob" }, "Alice");
  assert.notEqual(first.personId, bob.personId); // Same display name never links accounts.

  const profile = await module.getMyProfile(first);
  assert.deepEqual(profile, { id: first.personId, name: "Alice" });

  const updated = await module.updateProfileName(first, "  Alice Ng  ");
  assert.equal(updated.name, "Alice Ng"); // Bounded + trimmed.
  assert.equal((await module.getMyProfile(first)).name, "Alice Ng");
  assert.equal((await module.getMyProfile(bob)).name, "Alice"); // Edit is scoped to the actor.

  for (const bad of ["", "   ", "x".repeat(201)]) {
    await assert.rejects(module.updateProfileName(first, bad));
  }
  await assert.rejects(module.getMyProfile({ personId: "ghost", name: "?" }), ModuleError);
});

test("demo Identity & Access: seeded actor round-trips", async () => {
  const module = new DemoIdentityAccess([{ id: "demo-person", name: "Collab member", identity: { provider: "demo", subject: "demo" } }]);
  const actor = await module.resolveActor({ provider: "demo", subject: "demo" }, "Whatever");
  assert.equal(actor.personId, "demo-person");
  assert.equal((await module.updateProfileName(actor, "Renamed")).name, "Renamed");
});
