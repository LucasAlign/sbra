import { and, asc, eq, gt, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as s from "../db/network-schema";
import type * as fullSchema from "../db/schema";
import { withActor } from "../db/context";
import { boundedText } from "./identity";

type Database = PostgresJsDatabase<typeof fullSchema>;

export async function resolvePerson(db: Database, identity: { provider: string; subject: string }, name: string) {
  return db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`${identity.provider}:${identity.subject}`}, 0))`);
    // Login runs before an actor context exists, so it cannot satisfy the own-row
    // RLS policy on person_identities. Resolve the subject through the SECURITY
    // DEFINER lookup; the person row itself (open SELECT) carries the name.
    const found = await tx.execute(sql`select collab_lookup_identity(${identity.provider}, ${identity.subject}) as person_id`);
    const personId = (found as unknown as { person_id: string | null }[])[0]?.person_id ?? null;
    if (personId) {
      const [existing] = await tx.select({ id: s.people.id, name: s.people.name }).from(s.people).where(eq(s.people.id, personId));
      if (existing) return existing;
    }
    const person = { id: crypto.randomUUID(), name: name.slice(0, 200) || "Collab member" };
    await tx.insert(s.people).values(person);
    await tx.insert(s.personIdentities).values({ ...identity, personId: person.id });
    return person;
  });
}

function communityAccess(personId: string, communityId: string) {
  return sql`exists (select 1 from ${s.personCommunityMemberships} m
    join ${s.communities} c on c.id = m.community_id
    where m.person_id = ${personId} and m.community_id = ${communityId}
      and m.status = 'active' and c.status = 'active')`;
}

// An active affiliation plus an unexpired Business Admin grant for the org,
// checked in the same statement as the write it authorizes.
function businessAdminAccess(personId: string, organizationId: string) {
  return sql`exists (
    select 1 from ${s.organizationAffiliations} a join ${s.roleGrants} g
    on g.organization_id = a.organization_id and g.person_id = a.person_id
    where a.person_id = ${personId} and a.organization_id = ${organizationId}
    and a.status = 'active' and g.role = 'business_admin' and g.revoked_at is null
    and (g.expires_at is null or g.expires_at > now()))`;
}

export async function readDirectory(db: Database, personId: string, communityId: string, after?: string) {
  boundedText(communityId, 200);
  if (after !== undefined) boundedText(after, 200);
  // Runs under the actor context so row-level security scopes the community and
  // organization-membership rows to what this person may see. Community listing
  // overrides layer local headline/offer/visibility over the canonical profile
  // without altering it; a 'hidden' override drops the org from this listing.
  return withActor(db, personId, async tx => {
    const [allowed] = await tx.select({ id: s.communities.id }).from(s.communities)
      .where(and(eq(s.communities.id, communityId), communityAccess(personId, communityId)));
    if (!allowed) throw new Error("This community is not available to your account.");
    const rows = await tx.select({ id: s.organizations.id, name: s.organizations.name,
      description: s.organizations.description, kind: s.organizations.kind, website: s.organizations.website,
      locations: s.organizations.locations, serviceAreas: s.organizations.serviceAreas,
      headline: s.communityListingOverrides.headline, localOffer: s.communityListingOverrides.localOffer,
      visibility: s.communityListingOverrides.visibility }).from(s.organizations)
      .innerJoin(s.organizationCommunityMemberships, eq(s.organizationCommunityMemberships.organizationId, s.organizations.id))
      .leftJoin(s.communityListingOverrides, and(eq(s.communityListingOverrides.organizationId, s.organizations.id),
        eq(s.communityListingOverrides.communityId, communityId)))
      .where(and(eq(s.organizationCommunityMemberships.communityId, communityId),
        eq(s.organizationCommunityMemberships.status, "active"), communityAccess(personId, communityId),
        sql`(${s.communityListingOverrides.visibility} is null or ${s.communityListingOverrides.visibility} <> 'hidden')`,
        after ? gt(s.organizations.id, after) : undefined)).orderBy(asc(s.organizations.id)).limit(26);
    const organizations = rows.slice(0, 25).map(r => ({
      id: r.id, name: r.name, kind: r.kind, website: r.website, locations: r.locations, serviceAreas: r.serviceAreas,
      // The local headline/offer take precedence for presentation; canonical
      // description is the fallback. Overrides never mutate canonical fields.
      description: r.headline || r.description, localOffer: r.localOffer ?? "" }));
    return { organizations, nextCursor: rows.length > 25 ? rows[24].id : null };
  });
}

export async function editOrganizationDescription(db: Database, personId: string, organizationId: string, description: string) {
  boundedText(organizationId, 200);
  if (typeof description !== "string" || description.length > 5000) throw new Error("Invalid description.");
  return editOrganizationProfile(db, personId, organizationId, { description });
}

const ORGANIZATION_KINDS = ["business", "chamber", "association", "municipality", "other"];

export type OrganizationProfileFields = {
  name?: string; kind?: string; description?: string; website?: string; locations?: string; serviceAreas?: string;
};

export async function editOrganizationProfile(db: Database, personId: string, organizationId: string, fields: OrganizationProfileFields) {
  boundedText(organizationId, 200);
  // Build only the provided fields so a caller can edit one or all. Canonical
  // edits flow to every community that lists the org.
  const set: Partial<Record<"name" | "kind" | "description" | "website" | "locations" | "serviceAreas", string>> = {};
  if (fields.name !== undefined) set.name = boundedText(fields.name, 200);
  if (fields.kind !== undefined) {
    if (!ORGANIZATION_KINDS.includes(fields.kind)) throw new Error("Invalid organization kind.");
    set.kind = fields.kind;
  }
  const optional: [keyof OrganizationProfileFields, number][] = [["description", 5000], ["website", 500], ["locations", 2000], ["serviceAreas", 2000]];
  for (const [key, max] of optional) {
    const value = fields[key];
    if (value === undefined) continue;
    if (typeof value !== "string" || value.length > max) throw new Error(`Invalid ${key}.`);
    set[key as "description" | "website" | "locations" | "serviceAreas"] = value.trim();
  }
  if (!Object.keys(set).length) throw new Error("No changes to save.");
  // Under the actor context, RLS on organizations independently confirms the
  // caller's Business Admin authority; the WHERE clause enforces it in the same UPDATE.
  const changed = await withActor(db, personId, tx => tx.update(s.organizations).set(set)
    .where(and(eq(s.organizations.id, organizationId), businessAdminAccess(personId, organizationId)))
    .returning({ id: s.organizations.id }));
  if (!changed.length) throw new Error("You cannot edit this organization.");
}

export type ListingOverrideFields = { headline?: string; localOffer?: string; visibility?: "listed" | "hidden" };

export async function setListingOverride(db: Database, personId: string, organizationId: string, communityId: string, fields: ListingOverrideFields) {
  boundedText(organizationId, 200); boundedText(communityId, 200);
  const headline = fields.headline ?? "";
  const localOffer = fields.localOffer ?? "";
  const visibility = fields.visibility ?? "listed";
  if (typeof headline !== "string" || headline.length > 200) throw new Error("Invalid headline.");
  if (typeof localOffer !== "string" || localOffer.length > 2000) throw new Error("Invalid offer.");
  if (visibility !== "listed" && visibility !== "hidden") throw new Error("Invalid visibility.");
  await withActor(db, personId, async tx => {
    // The org must actually be listed in this community, and the caller must be a
    // Business Admin of it (RLS on the override table enforces the latter too).
    const [listed] = await tx.select({ id: s.organizationCommunityMemberships.organizationId })
      .from(s.organizationCommunityMemberships).where(and(
        eq(s.organizationCommunityMemberships.organizationId, organizationId),
        eq(s.organizationCommunityMemberships.communityId, communityId),
        eq(s.organizationCommunityMemberships.status, "active"), businessAdminAccess(personId, organizationId)));
    if (!listed) throw new Error("You cannot set a listing for this organization here.");
    // Update-then-insert rather than upsert: the override's SELECT policy is
    // scoped to community members, so ON CONFLICT DO UPDATE could be blocked for a
    // Business Admin who is not one. Each statement passes the admin write policy.
    const updated = await tx.update(s.communityListingOverrides)
      .set({ headline: headline.trim(), localOffer: localOffer.trim(), visibility, updatedBy: personId, updatedAt: sql`now()` })
      .where(and(eq(s.communityListingOverrides.organizationId, organizationId), eq(s.communityListingOverrides.communityId, communityId)))
      .returning({ organizationId: s.communityListingOverrides.organizationId });
    if (!updated.length) await tx.insert(s.communityListingOverrides)
      .values({ organizationId, communityId, headline: headline.trim(), localOffer: localOffer.trim(), visibility, updatedBy: personId });
  });
}
