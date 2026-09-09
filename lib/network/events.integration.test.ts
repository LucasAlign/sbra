import assert from "node:assert/strict";
import test from "node:test";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { and, eq } from "drizzle-orm";
import * as schema from "../db/schema";
import { withActor } from "../db/context";
import { resolvePerson } from "./repository";
import {
  createEvent, publishEvent, cancelEvent, rsvpToEvent, readEvents, readEventAttendance,
} from "./events";

// Proves the M5 exit condition under the restricted runtime role: one event
// appears in two approved communities with a single event ID and one RSVP per
// person, and private attendance stays private. Also exercises transactional
// capacity enforcement and the RLS backstops.
const url = process.env.COLLAB_TEST_DATABASE_URL;

test("Postgres: one event, many communities; one RSVP per person; private attendance", { skip: !url }, async () => {
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

    const org = await resolvePerson(db, { provider: "google", subject: "evt-org" }, "Olga Organizer");
    const amy = await resolvePerson(db, { provider: "google", subject: "evt-amy" }, "Amy Both");   // c1 + c2
    const ben = await resolvePerson(db, { provider: "google", subject: "evt-ben" }, "Ben C1");      // c1 only
    const cara = await resolvePerson(db, { provider: "google", subject: "evt-cara" }, "Cara C2");   // c2 only
    const dan = await resolvePerson(db, { provider: "google", subject: "evt-dan" }, "Dan Outside"); // c3 only

    await adminDb.insert(schema.networks).values({ id: "evt-n", slug: "evt-n", name: "N" });
    await adminDb.insert(schema.organizations).values({ id: "evt-op", name: "Operator", kind: "association" });
    await adminDb.insert(schema.communities).values([
      { id: "evt-c1", networkId: "evt-n", operatorId: "evt-op", slug: "evt-c1", name: "C1", shortName: "C1", kind: "organizational", status: "active" },
      { id: "evt-c2", networkId: "evt-n", operatorId: "evt-op", slug: "evt-c2", name: "C2", shortName: "C2", kind: "organizational", status: "active" },
      { id: "evt-c3", networkId: "evt-n", operatorId: "evt-op", slug: "evt-c3", name: "C3", shortName: "C3", kind: "organizational", status: "active" },
    ]);
    await adminDb.insert(schema.personCommunityMemberships).values([
      { personId: org.id, communityId: "evt-c1", status: "active" },
      { personId: org.id, communityId: "evt-c2", status: "active" },
      { personId: amy.id, communityId: "evt-c1", status: "active" },
      { personId: amy.id, communityId: "evt-c2", status: "active" },
      { personId: ben.id, communityId: "evt-c1", status: "active" },
      { personId: cara.id, communityId: "evt-c2", status: "active" },
      { personId: dan.id, communityId: "evt-c3", status: "active" },
    ]);

    const startsAt = new Date(Date.now() + 86_400_000);
    const has = (r: { events: { id: string }[] }, id: string) => r.events.some(e => e.id === id);

    // Create the event (auto-published to C1) with capacity 2, then publish to C2.
    const { id: ev } = await createEvent(db, org.id, { communityId: "evt-c1", title: "Mixer", startsAt, capacity: 2, location: "Downtown" });
    // A non-organizer cannot publish; the organizer cannot publish to a community
    // they do not belong to (C3).
    await assert.rejects(publishEvent(db, amy.id, ev, "evt-c2"));
    await assert.rejects(publishEvent(db, org.id, ev, "evt-c3"));
    await publishEvent(db, org.id, ev, "evt-c2");

    // One event ID, two communities, one owning row.
    const inC1 = await readEvents(db, amy.id, "evt-c1");
    const inC2 = await readEvents(db, amy.id, "evt-c2");
    assert.ok(has(inC1, ev) && has(inC2, ev));
    assert.equal(inC1.events.find(e => e.id === ev)!.id, inC2.events.find(e => e.id === ev)!.id);
    const [{ n: eventRows }] = await adminDb.execute(`select count(*)::int as n from community_events where id = '${ev}'`) as unknown as { n: number }[];
    const [{ n: pubRows }] = await adminDb.execute(`select count(*)::int as n from event_publications where event_id = '${ev}'`) as unknown as { n: number }[];
    assert.equal(Number(eventRows), 1);
    assert.equal(Number(pubRows), 2);
    // The outsider (C3 only) never sees it; a member of a publishing community does.
    assert.ok(!has(await readEvents(db, dan.id, "evt-c3"), ev));
    assert.ok(has(await readEvents(db, ben.id, "evt-c1"), ev));
    assert.ok(has(await readEvents(db, cara.id, "evt-c2"), ev));

    // Capacity is enforced transactionally: two go, the third is turned away.
    await rsvpToEvent(db, amy.id, ev, "going");
    await rsvpToEvent(db, ben.id, ev, "going");
    await assert.rejects(rsvpToEvent(db, cara.id, ev, "going"), /full/i);
    // A 'not_going' RSVP never consumes a spot.
    await rsvpToEvent(db, cara.id, ev, "not_going");
    // One RSVP per person: repeating 'going' does not add a row or a spot.
    await rsvpToEvent(db, amy.id, ev, "going");
    const amyRows = await adminDb.select().from(schema.eventRsvps).where(and(eq(schema.eventRsvps.eventId, ev), eq(schema.eventRsvps.personId, amy.id)));
    assert.equal(amyRows.length, 1);
    // Freeing a spot lets the next person in.
    await rsvpToEvent(db, amy.id, ev, "not_going");
    await rsvpToEvent(db, cara.id, ev, "going");

    // Private attendance: the organizer sees the roster; a member does not.
    const roster = await readEventAttendance(db, org.id, ev);
    assert.ok(roster.attendees.some(a => a.personId === ben.id && a.status === "going"));
    await assert.rejects(readEventAttendance(db, ben.id, ev));
    // A member sees their own RSVP and a `full` flag, but never the going count or
    // anyone else's RSVP row.
    const benView = (await readEvents(db, ben.id, "evt-c1")).events.find(e => e.id === ev)!;
    assert.equal(benView.myStatus, "going");
    assert.equal(benView.goingCount, null);
    await withActor(db, ben.id, async tx => {
      const rows = await tx.select().from(schema.eventRsvps);
      assert.ok(rows.every(r => r.personId === ben.id));
    });
    // The organizer's own view carries the count.
    assert.equal((await readEvents(db, org.id, "evt-c1")).events.find(e => e.id === ev)!.goingCount, 2);

    // RLS backstops on writes: the outsider cannot RSVP to an event they cannot
    // see, and a member cannot forge an event organized by someone else.
    await assert.rejects(rsvpToEvent(db, dan.id, ev, "going"));
    await assert.rejects(withActor(db, cara.id, tx => tx.insert(schema.communityEvents)
      .values({ id: "evt-forge", organizerId: org.id, title: "forged", startsAt })));

    // Canceling is the organizer's alone, and blocks further RSVPs.
    await assert.rejects(cancelEvent(db, amy.id, ev));
    await cancelEvent(db, org.id, ev);
    await assert.rejects(rsvpToEvent(db, ben.id, ev, "not_going"), /canceled/i);
    const [row] = await adminDb.select({ status: schema.communityEvents.status })
      .from(schema.communityEvents).where(eq(schema.communityEvents.id, ev));
    assert.equal(row.status, "canceled");
  } finally {
    if (client) await client.end();
    await admin.end();
  }
});
