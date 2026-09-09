import assert from "node:assert/strict";
import test from "node:test";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import * as schema from "../db/schema";
import { resolveCommunityBySlug, resolveRegionBySlug } from "./discovery";

// Proves slug routing resolves to exactly one active community, never falls back
// to another tenant on an unknown or non-active slug, projects only public brand
// fields, and lists regional communities scoped to the region. Runs as the
// restricted runtime role (the catalog is readable without an actor context).
const url = process.env.COLLAB_TEST_DATABASE_URL;

test("Postgres: slug routing resolves scoped, public community context", { skip: !url }, async () => {
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

    await adminDb.insert(schema.networks).values({ id: "disc-n", slug: "disc-n", name: "N" });
    await adminDb.insert(schema.regions).values([
      { id: "disc-berks", networkId: "disc-n", slug: "disc-berks", name: "Berks County" },
      { id: "disc-lehigh", networkId: "disc-n", slug: "disc-lehigh", name: "Lehigh County" },
    ]);
    await adminDb.insert(schema.organizations).values({ id: "disc-op", name: "Operator", kind: "association" });
    await adminDb.insert(schema.communities).values([
      { id: "disc-ca", networkId: "disc-n", operatorId: "disc-op", slug: "disc-a", name: "Alpha Collab", shortName: "Alpha", description: "First", kind: "organizational", status: "active", locale: "en" },
      { id: "disc-cb", networkId: "disc-n", operatorId: "disc-op", slug: "disc-b", name: "Beta Cámara", shortName: "Beta", description: "Segundo", kind: "organizational", status: "active", locale: "es", logo: "https://example.test/b.png" },
      { id: "disc-cd", networkId: "disc-n", operatorId: "disc-op", slug: "disc-d", name: "Draft Collab", shortName: "Draft", description: "Hidden", kind: "organizational", status: "draft", locale: "en" },
      { id: "disc-cl", networkId: "disc-n", operatorId: "disc-op", slug: "disc-l", name: "Lehigh Collab", shortName: "Lehigh", description: "Other region", kind: "geographic", status: "active", locale: "en" },
    ]);
    await adminDb.insert(schema.communityRegions).values([
      { communityId: "disc-ca", networkId: "disc-n", regionId: "disc-berks" },
      { communityId: "disc-cb", networkId: "disc-n", regionId: "disc-berks" },
      { communityId: "disc-cd", networkId: "disc-n", regionId: "disc-berks" },
      { communityId: "disc-cl", networkId: "disc-n", regionId: "disc-lehigh" },
    ]);

    // A known slug resolves to exactly that community, public fields only.
    const alpha = await resolveCommunityBySlug(db, "disc-a");
    assert.equal(alpha.id, "disc-ca");
    assert.equal(alpha.locale, "en");
    assert.deepEqual(Object.keys(alpha).sort(),
      ["description", "id", "kind", "locale", "logo", "name", "shortName", "slug"]);
    assert.equal((await resolveCommunityBySlug(db, "disc-b")).logo, "https://example.test/b.png");

    // Unknown slug and a non-active (draft) slug both error — never a fallback.
    await assert.rejects(resolveCommunityBySlug(db, "disc-zzz"));
    await assert.rejects(resolveCommunityBySlug(db, "disc-d"));

    // Regional discovery lists only that region's ACTIVE communities.
    const berks = await resolveRegionBySlug(db, "disc-berks");
    assert.equal(berks.region.name, "Berks County");
    assert.deepEqual(berks.communities.map(c => c.id).sort(), ["disc-ca", "disc-cb"]);
    // The Lehigh community and the draft never leak into Berks.
    assert.ok(!berks.communities.some(c => c.id === "disc-cl" || c.id === "disc-cd"));
    assert.equal((await resolveRegionBySlug(db, "disc-lehigh")).communities.map(c => c.id).join(","), "disc-cl");

    // Unknown region errors.
    await assert.rejects(resolveRegionBySlug(db, "disc-none"));
  } finally {
    if (client) await client.end();
    await admin.end();
  }
});
