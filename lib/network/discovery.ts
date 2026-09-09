import { and, asc, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as fullSchema from "../db/schema";
import * as s from "../db/network-schema";
import { boundedText } from "./identity";

type Database = PostgresJsDatabase<typeof fullSchema>;

// Community context + regional discovery, resolved by slug server-side (M3).
//
// The catalog (communities / networks / regions / community_regions) is readable
// by the app under RLS `USING (true)`, so these resolve without an actor context
// — they are pre-auth routing, not member data. They return a PUBLIC projection
// only (brand/locale/logo, never operator or membership internals); the
// membership-gated directory read stays in repository.readDirectory.
//
// An unknown slug throws — it never falls back to another tenant. Only ACTIVE
// communities resolve, so a draft/suspended/archived community is not routable.

// Public, brand-level fields safe to render for anyone who reaches the URL.
const communityPublic = {
  id: s.communities.id, slug: s.communities.slug, name: s.communities.name,
  shortName: s.communities.shortName, description: s.communities.description,
  logo: s.communities.logo, locale: s.communities.locale, kind: s.communities.kind,
} as const;

export type CommunityContext = {
  id: string; slug: string; name: string; shortName: string;
  description: string; logo: string | null; locale: string; kind: string;
};

export async function resolveCommunityBySlug(db: Database, slug: string): Promise<CommunityContext> {
  boundedText(slug, 200);
  const rows = await db.select(communityPublic).from(s.communities)
    .where(and(eq(s.communities.slug, slug), eq(s.communities.status, "active"))).limit(2);
  // Slugs are unique per network; with more than one network a bare slug is
  // ambiguous rather than a safe fallback, so refuse it.
  if (rows.length !== 1) throw new Error("Community not found.");
  return rows[0];
}

export type RegionDiscovery = { region: { slug: string; name: string }; communities: CommunityContext[] };

export async function resolveRegionBySlug(db: Database, slug: string): Promise<RegionDiscovery> {
  boundedText(slug, 200);
  const regions = await db.select({ id: s.regions.id, slug: s.regions.slug, name: s.regions.name })
    .from(s.regions).where(eq(s.regions.slug, slug)).limit(2);
  if (regions.length !== 1) throw new Error("Region not found.");
  const region = regions[0];
  const communities = await db.select(communityPublic).from(s.communities)
    .innerJoin(s.communityRegions, eq(s.communityRegions.communityId, s.communities.id))
    .where(and(eq(s.communityRegions.regionId, region.id), eq(s.communities.status, "active")))
    .orderBy(asc(s.communities.name)).limit(200);
  return { region: { slug: region.slug, name: region.name }, communities };
}
