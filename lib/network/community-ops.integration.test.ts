import assert from "node:assert/strict";
import test from "node:test";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import * as schema from "../db/schema";
import { withActor } from "../db/context";
import { resolvePerson, editOrganizationProfile, readDirectory } from "./repository";
import { requestClaim, reviewClaim } from "./claims";
import { createEvent, publishEvent, readEvents } from "./events";
import { postOpportunity, publishOpportunity, respondToOpportunity, readOpportunities } from "./opportunities";
import { requestIntroduction, respondToIntroduction, readConnections } from "./relationships";
import {
  createAnnouncement, publishAnnouncement, commentOnAnnouncement,
  readAnnouncements, readAnnouncementComments, readHomeWorkspace,
} from "./community-ops";

const url = process.env.COLLAB_TEST_DATABASE_URL;

async function setup(admin: ReturnType<typeof postgres>) {
  await migrate(drizzle(admin), { migrationsFolder: "./drizzle/network" });
  await admin`do $$ begin
    if not exists (select from pg_roles where rolname = 'collab_runtime') then
      create role collab_runtime login password 'test-runtime-only' nosuperuser nobypassrls;
    end if;
  end $$`;
  await admin`grant usage on schema public to collab_runtime`;
  await admin`grant select, insert, update, delete on all tables in schema public to collab_runtime`;
}

// Announcements carry author authority, reach only their published communities,
// and comments inherit the announcement's audience.
test("Postgres: announcements — author authority, audience, comments inherit access", { skip: !url }, async () => {
  const target = new URL(url!);
  assert.ok(["localhost", "127.0.0.1"].includes(target.hostname));
  assert.equal(target.pathname, "/collab_test");
  const admin = postgres(url!, { max: 1 });
  let client: ReturnType<typeof postgres> | undefined;
  try {
    await setup(admin);
    target.username = "collab_runtime"; target.password = "test-runtime-only";
    client = postgres(target.toString(), { max: 4 });
    const db = drizzle(client, { schema });
    const adminDb = drizzle(admin, { schema });

    const boss = await resolvePerson(db, { provider: "google", subject: "aon-boss" }, "Bea Boss"); // admin of c1 + c2
    const mem = await resolvePerson(db, { provider: "google", subject: "aon-mem" }, "Mo Member");  // c1
    const out = await resolvePerson(db, { provider: "google", subject: "aon-out" }, "Ola Out");    // c2

    await adminDb.insert(schema.networks).values({ id: "aon-n", slug: "aon-n", name: "N" });
    await adminDb.insert(schema.organizations).values({ id: "aon-op", name: "Operator", kind: "association" });
    await adminDb.insert(schema.communities).values([
      { id: "aon-c1", networkId: "aon-n", operatorId: "aon-op", slug: "aon-c1", name: "C1", shortName: "C1", kind: "organizational", status: "active" },
      { id: "aon-c2", networkId: "aon-n", operatorId: "aon-op", slug: "aon-c2", name: "C2", shortName: "C2", kind: "organizational", status: "active" },
    ]);
    await adminDb.insert(schema.personCommunityMemberships).values([
      { personId: boss.id, communityId: "aon-c1", status: "active" },
      { personId: boss.id, communityId: "aon-c2", status: "active" },
      { personId: mem.id, communityId: "aon-c1", status: "active" },
      { personId: out.id, communityId: "aon-c2", status: "active" },
    ]);
    await adminDb.insert(schema.roleGrants).values([
      { id: "aon-g1", personId: boss.id, communityId: "aon-c1", role: "community_admin", grantedBy: boss.id },
      { id: "aon-g2", personId: boss.id, communityId: "aon-c2", role: "community_admin", grantedBy: boss.id },
    ]);

    const seenIn = async (who: string, community: string, id: string) =>
      (await readAnnouncements(db, who, community)).announcements.some(a => a.id === id);

    // Author authority: a plain member cannot announce.
    await assert.rejects(createAnnouncement(db, mem.id, { communityId: "aon-c1", title: "x" }));
    const { id } = await createAnnouncement(db, boss.id, { communityId: "aon-c1", title: "Quarterly mixer", body: "Details inside." });

    // Published to C1 only: the C1 member sees it; the C2-only member does not.
    assert.ok(await seenIn(mem.id, "aon-c1", id));
    assert.ok(!(await seenIn(out.id, "aon-c2", id)));
    // The C1 member can comment; the outsider cannot even see it to comment.
    const { id: c1comment } = await commentOnAnnouncement(db, mem.id, id, "Looking forward to it.");
    await assert.rejects(commentOnAnnouncement(db, out.id, id, "me too"));
    await withActor(db, out.id, async tx => {
      assert.equal((await tx.select().from(schema.announcements)).filter(a => a.id === id).length, 0);
      assert.equal((await tx.select().from(schema.announcementComments)).filter(c => c.announcementId === id).length, 0);
    });

    // Publish to C2 (author is admin there too). Now the C2 member sees it, and —
    // comments inherit the announcement's audience — sees the C1 member's comment.
    await publishAnnouncement(db, boss.id, id, "aon-c2");
    assert.ok(await seenIn(out.id, "aon-c2", id));
    assert.ok((await readAnnouncementComments(db, out.id, id)).comments.some(c => c.id === c1comment));
    // The outsider can now comment; the author (any audience) sees both comments.
    await commentOnAnnouncement(db, out.id, id, "From C2!");
    assert.equal((await readAnnouncementComments(db, boss.id, id)).comments.length, 2);
  } finally {
    if (client) await client.end();
    await admin.end();
  }
});

// The Berks MVP exit: two communities share a business and an event while private
// operations stay separate, and members complete an opportunity → introduction.
test("Postgres: MVP acceptance — shared business & event, private ops separate, opportunity to introduction", { skip: !url }, async () => {
  const target = new URL(url!);
  const admin = postgres(url!, { max: 1 });
  let client: ReturnType<typeof postgres> | undefined;
  try {
    await setup(admin);
    target.username = "collab_runtime"; target.password = "test-runtime-only";
    client = postgres(target.toString(), { max: 4 });
    const db = drizzle(client, { schema });
    const adminDb = drizzle(admin, { schema });

    const boss = await resolvePerson(db, { provider: "google", subject: "mvp-boss" }, "Bea Boss"); // admin c1
    const amy = await resolvePerson(db, { provider: "google", subject: "mvp-amy" }, "Amy");         // c1 + c2, owns biz
    const ben = await resolvePerson(db, { provider: "google", subject: "mvp-ben" }, "Ben");         // c1
    const cara = await resolvePerson(db, { provider: "google", subject: "mvp-cara" }, "Cara");      // c2

    await adminDb.insert(schema.networks).values({ id: "mvp-n", slug: "mvp-n", name: "N" });
    await adminDb.insert(schema.organizations).values([
      { id: "mvp-op", name: "Operator", kind: "association" },
      { id: "mvp-biz", name: "Shared Biz", kind: "business", description: "Original." },
    ]);
    await adminDb.insert(schema.communities).values([
      { id: "mvp-c1", networkId: "mvp-n", operatorId: "mvp-op", slug: "mvp-c1", name: "C1", shortName: "C1", kind: "organizational", status: "active" },
      { id: "mvp-c2", networkId: "mvp-n", operatorId: "mvp-op", slug: "mvp-c2", name: "C2", shortName: "C2", kind: "organizational", status: "active" },
    ]);
    await adminDb.insert(schema.personCommunityMemberships).values([
      { personId: boss.id, communityId: "mvp-c1", status: "active" },
      { personId: amy.id, communityId: "mvp-c1", status: "active" },
      { personId: amy.id, communityId: "mvp-c2", status: "active" },
      { personId: ben.id, communityId: "mvp-c1", status: "active" },
      { personId: cara.id, communityId: "mvp-c2", status: "active" },
    ]);
    await adminDb.insert(schema.roleGrants).values({ id: "mvp-g", personId: boss.id, communityId: "mvp-c1", role: "community_admin", grantedBy: boss.id });
    // The business is listed in BOTH communities.
    await adminDb.insert(schema.organizationCommunityMemberships).values([
      { organizationId: "mvp-biz", communityId: "mvp-c1", status: "active" },
      { organizationId: "mvp-biz", communityId: "mvp-c2", status: "active" },
    ]);

    // --- Shared business: Amy claims it in C1, an admin vouches, and a canonical
    // edit shows in BOTH communities' directories.
    const { id: claim } = await requestClaim(db, amy.id, "mvp-biz", "mvp-c1", "I run it.");
    await reviewClaim(db, boss.id, claim, "approved");
    await editOrganizationProfile(db, amy.id, "mvp-biz", { description: "Under new management." });
    assert.equal((await readDirectory(db, ben.id, "mvp-c1")).organizations.find(o => o.id === "mvp-biz")?.description, "Under new management.");
    assert.equal((await readDirectory(db, cara.id, "mvp-c2")).organizations.find(o => o.id === "mvp-biz")?.description, "Under new management.");

    // --- Shared event: one event ID reaches both communities.
    const { id: event } = await createEvent(db, amy.id, { communityId: "mvp-c1", title: "Network night", startsAt: new Date(Date.now() + 86_400_000) });
    await publishEvent(db, amy.id, event, "mvp-c2");
    assert.ok((await readEvents(db, ben.id, "mvp-c1")).events.some(e => e.id === event));
    assert.ok((await readEvents(db, cara.id, "mvp-c2")).events.some(e => e.id === event));

    // --- Private operations stay separate: a C1 opportunity and a C1 announcement
    // never reach the C2-only member.
    const { id: opp } = await postOpportunity(db, amy.id, { communityId: "mvp-c1", kind: "need", title: "Need a printer" });
    await publishOpportunity(db, amy.id, opp);
    const { id: ann } = await createAnnouncement(db, boss.id, { communityId: "mvp-c1", title: "C1 members only" });
    assert.ok((await readOpportunities(db, ben.id, "mvp-c1")).opportunities.some(o => o.id === opp));
    assert.ok(!(await readOpportunities(db, cara.id, "mvp-c2")).opportunities.some(o => o.id === opp));
    assert.ok(!(await readAnnouncements(db, cara.id, "mvp-c2")).announcements.some(a => a.id === ann));

    // --- Opportunity → introduction: Ben responds, then Amy introduces herself to
    // Ben; his acceptance forms a connection.
    await respondToOpportunity(db, ben.id, opp, "I have a spare printer.");
    const { id: intro } = await requestIntroduction(db, amy.id, { communityId: "mvp-c1", partyIds: [ben.id], contact: "amy@x" });

    // The home workspace surfaces Ben's open items before he acts.
    const home = await readHomeWorkspace(db, ben.id);
    assert.ok(home.introductionsAwaiting.some(i => i.id === intro));
    assert.ok(home.upcomingEvents.some(e => e.id === event));
    assert.ok(home.openOpportunities.some(o => o.id === opp));

    await respondToIntroduction(db, ben.id, intro, "accepted", "ben@y");
    assert.ok((await readConnections(db, amy.id)).connections.some(c => c.personId === ben.id));
    assert.ok((await readConnections(db, ben.id)).connections.some(c => c.personId === amy.id));
  } finally {
    if (client) await client.end();
    await admin.end();
  }
});
