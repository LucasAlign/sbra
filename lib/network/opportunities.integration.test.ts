import assert from "node:assert/strict";
import test from "node:test";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema";
import { withActor } from "../db/context";
import { resolvePerson } from "./repository";
import {
  postOpportunity, publishOpportunity, closeOpportunity, readOpportunities,
  respondToOpportunity, shareResponse, readResponses,
} from "./opportunities";

// Proves the M4 exit condition under the restricted runtime role: a member posts
// an opportunity, another responds, and neither is visible outside its published
// audience. Also exercises the private → published transition, the requester /
// responder / shared response audiences, and the RLS backstops for forged or
// out-of-audience writes.
const url = process.env.COLLAB_TEST_DATABASE_URL;

test("Postgres: opportunities are private until published; responses private unless shared", { skip: !url }, async () => {
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

    // People via the login path (definer identity lookup under the runtime role).
    const ann = await resolvePerson(db, { provider: "google", subject: "opp-ann" }, "Ann Author");   // requester
    const bob = await resolvePerson(db, { provider: "google", subject: "opp-bob" }, "Bob Responder"); // responder
    const cara = await resolvePerson(db, { provider: "google", subject: "opp-cara" }, "Cara Member"); // C1 member
    const dan = await resolvePerson(db, { provider: "google", subject: "opp-dan" }, "Dan Outsider");  // not in C1

    // C1 is the stage; C2 exists only so Dan is a real member of SOME community
    // but an outsider to C1.
    await adminDb.insert(schema.networks).values({ id: "opp-n", slug: "opp-n", name: "N" });
    await adminDb.insert(schema.organizations).values([
      { id: "opp-op", name: "Operator", kind: "association" },
      { id: "opp-acme", name: "Acme (unclaimed)", kind: "business" },
    ]);
    await adminDb.insert(schema.communities).values([
      { id: "opp-c1", networkId: "opp-n", operatorId: "opp-op", slug: "opp-c1", name: "C1", shortName: "C1", kind: "organizational", status: "active" },
      { id: "opp-c2", networkId: "opp-n", operatorId: "opp-op", slug: "opp-c2", name: "C2", shortName: "C2", kind: "organizational", status: "active" },
    ]);
    await adminDb.insert(schema.personCommunityMemberships).values([
      { personId: ann.id, communityId: "opp-c1", status: "active" },
      { personId: bob.id, communityId: "opp-c1", status: "active" },
      { personId: cara.id, communityId: "opp-c1", status: "active" },
      { personId: dan.id, communityId: "opp-c2", status: "active" },
    ]);

    const seen = (r: { opportunities: { id: string }[] }, id: string) => r.opportunities.some(o => o.id === id);

    // You cannot post on behalf of an organization you do not administer.
    await assert.rejects(postOpportunity(db, ann.id, { communityId: "opp-c1", kind: "need", title: "x", organizationId: "opp-acme" }));
    // An outsider cannot post into C1.
    await assert.rejects(postOpportunity(db, dan.id, { communityId: "opp-c1", kind: "need", title: "x" }));

    // Ann posts a private request.
    const { id: opp } = await postOpportunity(db, ann.id, {
      communityId: "opp-c1", kind: "need", title: "Need a bookkeeper", detail: "Quarterly filings.", geography: "Reading" });

    // Private: only the author sees it; fellow members do not, nor does the outsider.
    assert.ok(seen(await readOpportunities(db, ann.id, "opp-c1"), opp));
    assert.ok(!seen(await readOpportunities(db, bob.id, "opp-c1"), opp));
    assert.ok(!seen(await readOpportunities(db, cara.id, "opp-c1"), opp));
    assert.ok(!seen(await readOpportunities(db, dan.id, "opp-c1"), opp));

    // Only the author may publish it.
    await assert.rejects(publishOpportunity(db, bob.id, opp));
    await publishOpportunity(db, ann.id, opp);

    // Published: C1 members see it; the outsider still does not.
    assert.ok(seen(await readOpportunities(db, bob.id, "opp-c1"), opp));
    assert.ok(seen(await readOpportunities(db, cara.id, "opp-c1"), opp));
    assert.ok(!seen(await readOpportunities(db, dan.id, "opp-c1"), opp));

    // Bob responds; the outsider cannot.
    const { id: resp } = await respondToOpportunity(db, bob.id, opp, "I can help with quarterly filings.");
    await assert.rejects(respondToOpportunity(db, dan.id, opp, "me too"));

    // Before sharing: the responder and the requester see it; a fellow member does not.
    const has = (r: { responses: { id: string }[] }, id: string) => r.responses.some(x => x.id === id);
    assert.ok(has(await readResponses(db, bob.id, opp), resp));   // own
    assert.ok(has(await readResponses(db, ann.id, opp), resp));   // requester sees all
    assert.ok(!has(await readResponses(db, cara.id, opp), resp)); // not shared
    // RLS backstop: a raw query by a fellow member omitting app filters still hides it.
    await withActor(db, cara.id, async tx => {
      const rows = await tx.select().from(schema.opportunityResponses);
      assert.equal(rows.filter(x => x.authorId === bob.id).length, 0);
    });

    // Only the responder controls sharing.
    await assert.rejects(shareResponse(db, ann.id, resp, true));
    await shareResponse(db, bob.id, resp, true);

    // Shared: a fellow member of the audience now sees it; the outsider never does.
    assert.ok(has(await readResponses(db, cara.id, opp), resp));
    assert.equal((await readResponses(db, dan.id, opp)).responses.length, 0);

    // RLS backstops on writes: the outsider cannot self-insert an opportunity into
    // C1, and a member cannot forge one authored by someone else.
    await assert.rejects(withActor(db, dan.id, tx => tx.insert(schema.opportunities)
      .values({ id: "opp-evil", communityId: "opp-c1", authorId: dan.id, kind: "need", title: "sneak" })));
    await assert.rejects(withActor(db, cara.id, tx => tx.insert(schema.opportunities)
      .values({ id: "opp-forge", communityId: "opp-c1", authorId: ann.id, kind: "need", title: "forged" })));

    // Closing is the author's alone.
    await assert.rejects(closeOpportunity(db, cara.id, opp));
    await closeOpportunity(db, ann.id, opp);
    const [row] = await adminDb.select({ status: schema.opportunities.status })
      .from(schema.opportunities).where(eq(schema.opportunities.id, opp));
    assert.equal(row.status, "closed");
  } finally {
    if (client) await client.end();
    await admin.end();
  }
});
