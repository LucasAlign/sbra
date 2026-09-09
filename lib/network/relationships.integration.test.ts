import assert from "node:assert/strict";
import test from "node:test";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import * as schema from "../db/schema";
import { withActor } from "../db/context";
import { resolvePerson } from "./repository";
import {
  requestIntroduction, respondToIntroduction, withdrawIntroduction, readIntroductions,
  readConnections, addRelationshipNote, readRelationshipNotes,
  createReferral, updateReferralOutcome, readReferrals,
} from "./relationships";

// Proves the M6 exit conditions under the restricted runtime role: an
// introduction shares contact only after the recipient accepts, accepted parties
// become connections, a connection never exposes either party's private notes,
// and referrals (with their financial detail) stay with the two parties.
const url = process.env.COLLAB_TEST_DATABASE_URL;

test("Postgres: consent-gated introductions, private notes, party-only referrals", { skip: !url }, async () => {
  const target = new URL(url!);
  assert.ok(["localhost", "127.0.0.1"].includes(target.hostname));
  assert.equal(target.pathname, "/collab_test");
  const admin = postgres(url!, { max: 1 });
  let client: ReturnType<typeof postgres> | undefined;
  try {
    await migrate(drizzle(admin), { migrationsFolder: "./drizzle/network" });
    await admin`do $$ begin
      if not exists (select from pg_roles where rolname = 'collab_runtime') then
        create role collab_runtime login password 'test-runtime-only' nosuperuser nobypassrls;
      end if;
    end $$`;
    await admin`grant usage on schema public to collab_runtime`;
    await admin`grant select, insert, update, delete on all tables in schema public to collab_runtime`;
    target.username = "collab_runtime"; target.password = "test-runtime-only";
    client = postgres(target.toString(), { max: 4 });
    const db = drizzle(client, { schema });
    const adminDb = drizzle(admin, { schema });

    const ann = await resolvePerson(db, { provider: "google", subject: "rel-ann" }, "Ann");
    const bob = await resolvePerson(db, { provider: "google", subject: "rel-bob" }, "Bob");
    const cara = await resolvePerson(db, { provider: "google", subject: "rel-cara" }, "Cara");
    const dan = await resolvePerson(db, { provider: "google", subject: "rel-dan" }, "Dan"); // c2 only

    await adminDb.insert(schema.networks).values({ id: "rel-n", slug: "rel-n", name: "N" });
    await adminDb.insert(schema.organizations).values({ id: "rel-op", name: "Operator", kind: "association" });
    await adminDb.insert(schema.communities).values([
      { id: "rel-c1", networkId: "rel-n", operatorId: "rel-op", slug: "rel-c1", name: "C1", shortName: "C1", kind: "organizational", status: "active" },
      { id: "rel-c2", networkId: "rel-n", operatorId: "rel-op", slug: "rel-c2", name: "C2", shortName: "C2", kind: "organizational", status: "active" },
    ]);
    await adminDb.insert(schema.personCommunityMemberships).values([
      { personId: ann.id, communityId: "rel-c1", status: "active" },
      { personId: bob.id, communityId: "rel-c1", status: "active" },
      { personId: cara.id, communityId: "rel-c1", status: "active" },
      { personId: dan.id, communityId: "rel-c2", status: "active" },
    ]);

    const introOf = async (who: string, id: string) => (await readIntroductions(db, who)).introductions.find(i => i.id === id);
    const contactSeenBy = async (who: string, id: string, about: string) =>
      (await introOf(who, id))?.participants.find(p => p.personId === about)?.contact;

    // You cannot introduce someone who is not a member of the community.
    await assert.rejects(requestIntroduction(db, ann.id, { communityId: "rel-c1", partyIds: [dan.id] }));

    // Ann requests an introduction to Bob, supplying her own contact.
    const { id: intro } = await requestIntroduction(db, ann.id, { communityId: "rel-c1", partyIds: [bob.id], message: "You two should talk.", contact: "ann@example.test" });

    // Before Bob accepts, Bob cannot see Ann's contact (shared only after accept).
    assert.equal(await contactSeenBy(bob.id, intro, ann.id), "");
    assert.equal((await introOf(bob.id, intro))?.status, "pending");
    // Ann sees her own contact, but not Bob's (he hasn't accepted).
    assert.equal(await contactSeenBy(ann.id, intro, ann.id), "ann@example.test");
    assert.equal(await contactSeenBy(ann.id, intro, bob.id), "");
    // A non-participant cannot respond, and cannot even see the introduction rows.
    await assert.rejects(respondToIntroduction(db, cara.id, intro, "accepted"));
    await withActor(db, cara.id, async tx => {
      assert.equal((await tx.select().from(schema.introductions)).filter(i => i.id === intro).length, 0);
      assert.equal((await tx.select().from(schema.introductionParticipants)).filter(p => p.introductionId === intro).length, 0);
    });

    // Bob accepts with his contact. Now contacts are mutually visible.
    await respondToIntroduction(db, bob.id, intro, "accepted", "bob@example.test");
    assert.equal(await contactSeenBy(bob.id, intro, ann.id), "ann@example.test");
    assert.equal(await contactSeenBy(ann.id, intro, bob.id), "bob@example.test");
    assert.equal((await introOf(ann.id, intro))?.status, "accepted");
    // Responding again is refused (no longer pending).
    await assert.rejects(respondToIntroduction(db, bob.id, intro, "declined"));

    // Acceptance formed a connection between Ann and Bob (and only them).
    assert.ok((await readConnections(db, ann.id)).connections.some(c => c.personId === bob.id));
    assert.ok((await readConnections(db, bob.id)).connections.some(c => c.personId === ann.id));
    assert.equal((await readConnections(db, cara.id)).connections.length, 0);

    // Private notes: Ann notes Bob; the note is hers alone.
    await addRelationshipNote(db, ann.id, bob.id, "Prefers email in the mornings.");
    assert.equal((await readRelationshipNotes(db, ann.id, bob.id)).notes.length, 1);
    // Bob — the other party to the connection — cannot see Ann's note by any query.
    assert.equal((await readRelationshipNotes(db, bob.id, ann.id)).notes.length, 0);
    await withActor(db, bob.id, async tx => {
      const rows = await tx.select().from(schema.relationshipNotes);
      assert.ok(rows.every(n => n.ownerId === bob.id));
    });
    // You can only note a connection.
    await assert.rejects(addRelationshipNote(db, ann.id, cara.id, "not connected"));

    // Referrals ride on the connection; Cara (unconnected) cannot be referred.
    await assert.rejects(createReferral(db, ann.id, { communityId: "rel-c1", toPersonId: cara.id, need: "x" }));
    const { id: ref } = await createReferral(db, ann.id, { communityId: "rel-c1", toPersonId: bob.id, need: "Client needs a bookkeeper." });
    // Both parties see it; a third member never does (no leaderboard/projection).
    assert.ok((await readReferrals(db, ann.id)).referrals.some(r => r.id === ref && r.direction === "given"));
    assert.ok((await readReferrals(db, bob.id)).referrals.some(r => r.id === ref && r.direction === "received"));
    await withActor(db, cara.id, async tx => {
      assert.equal((await tx.select().from(schema.memberReferrals)).filter(r => r.id === ref).length, 0);
    });

    // The receiver closes it with a value; the financial detail stays with the two.
    await assert.rejects(updateReferralOutcome(db, cara.id, ref, "closed", 999));
    await updateReferralOutcome(db, bob.id, ref, "closed", 1500);
    assert.equal((await readReferrals(db, ann.id)).referrals.find(r => r.id === ref)?.closedValue, "1500.00");

    // Withdrawal: a fresh pending introduction can be withdrawn by its creator,
    // after which the recipient can no longer act on it.
    const { id: intro2 } = await requestIntroduction(db, ann.id, { communityId: "rel-c1", partyIds: [cara.id] });
    await withdrawIntroduction(db, ann.id, intro2);
    assert.equal((await introOf(ann.id, intro2))?.status, "withdrawn");
    await assert.rejects(respondToIntroduction(db, cara.id, intro2, "accepted"));
  } finally {
    if (client) await client.end();
    await admin.end();
  }
});
