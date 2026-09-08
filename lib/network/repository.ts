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
    const [existing] = await tx.select({ id: s.people.id, name: s.people.name }).from(s.personIdentities)
      .innerJoin(s.people, eq(s.people.id, s.personIdentities.personId))
      .where(and(eq(s.personIdentities.provider, identity.provider), eq(s.personIdentities.subject, identity.subject)));
    if (existing) return existing;
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

export async function readDirectory(db: Database, personId: string, communityId: string, after?: string) {
  boundedText(communityId, 200);
  if (after !== undefined) boundedText(after, 200);
  // Runs under the actor context so row-level security scopes the community and
  // organization-membership rows to what this person may see.
  return withActor(db, personId, async tx => {
    const [allowed] = await tx.select({ id: s.communities.id }).from(s.communities)
      .where(and(eq(s.communities.id, communityId), communityAccess(personId, communityId)));
    if (!allowed) throw new Error("This community is not available to your account.");
    const rows = await tx.select({ id: s.organizations.id, name: s.organizations.name,
      description: s.organizations.description, kind: s.organizations.kind }).from(s.organizations)
      .innerJoin(s.organizationCommunityMemberships, eq(s.organizationCommunityMemberships.organizationId, s.organizations.id))
      .where(and(eq(s.organizationCommunityMemberships.communityId, communityId),
        eq(s.organizationCommunityMemberships.status, "active"), communityAccess(personId, communityId),
        after ? gt(s.organizations.id, after) : undefined)).orderBy(asc(s.organizations.id)).limit(26);
    return { organizations: rows.slice(0, 25), nextCursor: rows.length > 25 ? rows[24].id : null };
  });
}

export async function editOrganizationDescription(db: Database, personId: string, organizationId: string, description: string) {
  boundedText(organizationId, 200);
  if (typeof description !== "string" || description.length > 5000) throw new Error("Invalid description.");
  // Under the actor context, RLS on organizations independently confirms the
  // caller's Business Admin authority for this organization.
  const changed = await withActor(db, personId, tx => tx.update(s.organizations).set({ description: description.trim() })
    .where(and(eq(s.organizations.id, organizationId), sql`exists (
      select 1 from ${s.organizationAffiliations} a join ${s.roleGrants} g
      on g.organization_id = a.organization_id and g.person_id = a.person_id
      where a.person_id = ${personId} and a.organization_id = ${organizationId}
      and a.status = 'active' and g.role = 'business_admin' and g.revoked_at is null
      and (g.expires_at is null or g.expires_at > now()))`)).returning({ id: s.organizations.id }));
  if (!changed.length) throw new Error("You cannot edit this organization.");
}
