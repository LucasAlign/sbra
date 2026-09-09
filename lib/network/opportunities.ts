import { and, asc, eq, gt, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as fullSchema from "../db/schema";
import * as s from "../db/network-schema";
import { withActor } from "../db/context";
import { boundedText } from "./identity";

type Database = PostgresJsDatabase<typeof fullSchema>;

// Opportunities & requests (M4): the core networking primitive.
//
// A member posts a structured need/offer in a community. It is private by
// default; publishing exposes it to that community's active members. Members
// respond; a response is private to the requester (opportunity author) and the
// responder, until the responder shares it with the opportunity's audience. All
// authorization is also enforced independently by row-level security (0008); the
// app checks here give clean errors and run every write under the actor context.

const OPPORTUNITY_KINDS = ["need", "offer"] as const;
export type OpportunityKind = (typeof OPPORTUNITY_KINDS)[number];

export type OpportunityInput = {
  communityId: string; kind: OpportunityKind; title: string;
  detail?: string; geography?: string; organizationId?: string | null; expiresAt?: Date | null;
};

function activeMember(personId: string, communityId: string) {
  return sql`exists (select 1 from ${s.personCommunityMemberships} m
    join ${s.communities} c on c.id = m.community_id
    where m.person_id = ${personId} and m.community_id = ${communityId}
      and m.status = 'active' and c.status = 'active')`;
}

// An active affiliation plus an unexpired Business Admin grant for the org: you
// may only represent an organization you actually administer.
function businessAdminAccess(personId: string, organizationId: string) {
  return sql`exists (select 1 from ${s.organizationAffiliations} a
    join ${s.roleGrants} g on g.organization_id = a.organization_id and g.person_id = a.person_id
    where a.person_id = ${personId} and a.organization_id = ${organizationId}
      and a.status = 'active' and g.role = 'business_admin' and g.revoked_at is null
      and (g.expires_at is null or g.expires_at > now()))`;
}

export async function postOpportunity(db: Database, personId: string, input: OpportunityInput) {
  const communityId = boundedText(input.communityId, 200);
  const title = boundedText(input.title, 200);
  if (!OPPORTUNITY_KINDS.includes(input.kind)) throw new Error("Choose whether this is a need or an offer.");
  const detail = input.detail ?? "";
  const geography = input.geography ?? "";
  if (typeof detail !== "string" || detail.length > 5000) throw new Error("Invalid detail.");
  if (typeof geography !== "string" || geography.length > 500) throw new Error("Invalid geography.");
  const organizationId = input.organizationId ? boundedText(input.organizationId, 200) : null;
  const expiresAt = input.expiresAt ?? null;
  if (expiresAt !== null && !(expiresAt instanceof Date)) throw new Error("Invalid expiry.");
  return withActor(db, personId, async tx => {
    // The author must be an active member of the owning community (RLS enforces
    // this on INSERT too); a represented org must be one they administer.
    const [member] = await tx.select({ id: s.communities.id }).from(s.communities)
      .where(and(eq(s.communities.id, communityId), activeMember(personId, communityId)));
    if (!member) throw new Error("This community is not available to your account.");
    if (organizationId) {
      const [org] = await tx.select({ ok: businessAdminAccess(personId, organizationId) })
        .from(s.organizations).where(eq(s.organizations.id, organizationId));
      if (!org?.ok) throw new Error("You cannot post on behalf of that organization.");
    }
    const opportunity = { id: crypto.randomUUID(), communityId, authorId: personId, organizationId,
      kind: input.kind, title, detail: detail.trim(), geography: geography.trim(), expiresAt };
    await tx.insert(s.opportunities).values(opportunity);
    return { id: opportunity.id };
  });
}

export async function publishOpportunity(db: Database, personId: string, opportunityId: string) {
  boundedText(opportunityId, 200);
  // Publishing is the private → community-audience transition; author only.
  const changed = await withActor(db, personId, tx => tx.update(s.opportunities)
    .set({ visibility: "community" })
    .where(and(eq(s.opportunities.id, opportunityId), eq(s.opportunities.authorId, personId)))
    .returning({ id: s.opportunities.id }));
  if (!changed.length) throw new Error("You cannot publish this request.");
}

export async function closeOpportunity(db: Database, personId: string, opportunityId: string) {
  boundedText(opportunityId, 200);
  const changed = await withActor(db, personId, tx => tx.update(s.opportunities)
    .set({ status: "closed" })
    .where(and(eq(s.opportunities.id, opportunityId), eq(s.opportunities.authorId, personId)))
    .returning({ id: s.opportunities.id }));
  if (!changed.length) throw new Error("You cannot close this request.");
}

export async function readOpportunities(db: Database, personId: string, communityId: string, after?: string) {
  boundedText(communityId, 200);
  if (after !== undefined) boundedText(after, 200);
  // RLS scopes rows to what this actor may see (their own, plus published ones in
  // communities they actively belong to); the WHERE narrows to this community.
  return withActor(db, personId, async tx => {
    const author = alias(s.people, "opportunity_author");
    const rows = await tx.select({ id: s.opportunities.id, communityId: s.opportunities.communityId,
      authorId: s.opportunities.authorId, authorName: author.name,
      organizationId: s.opportunities.organizationId, organizationName: s.organizations.name,
      kind: s.opportunities.kind, title: s.opportunities.title, detail: s.opportunities.detail,
      geography: s.opportunities.geography, status: s.opportunities.status,
      visibility: s.opportunities.visibility, expiresAt: s.opportunities.expiresAt,
      createdAt: s.opportunities.createdAt })
      .from(s.opportunities)
      .innerJoin(author, eq(author.id, s.opportunities.authorId))
      .leftJoin(s.organizations, eq(s.organizations.id, s.opportunities.organizationId))
      .where(and(eq(s.opportunities.communityId, communityId), after ? gt(s.opportunities.id, after) : undefined))
      .orderBy(asc(s.opportunities.id)).limit(26);
    const opportunities = rows.slice(0, 25).map(r => ({ ...r, mine: r.authorId === personId }));
    return { opportunities, nextCursor: rows.length > 25 ? rows[24].id : null };
  });
}

export async function respondToOpportunity(db: Database, personId: string, opportunityId: string, body: string) {
  boundedText(opportunityId, 200);
  const text = boundedText(body, 5000);
  return withActor(db, personId, async tx => {
    // You may only respond to an opportunity you can see (RLS also enforces this
    // on INSERT); pre-check gives a clean error instead of a policy violation.
    const [visible] = await tx.select({ id: s.opportunities.id }).from(s.opportunities)
      .where(eq(s.opportunities.id, opportunityId));
    if (!visible) throw new Error("This request is not available to your account.");
    // One response per person: update-then-insert. The responder can SELECT their
    // own row, so this is safe under RLS; editing the body never changes sharing.
    const updated = await tx.update(s.opportunityResponses).set({ body: text })
      .where(and(eq(s.opportunityResponses.opportunityId, opportunityId), eq(s.opportunityResponses.authorId, personId)))
      .returning({ id: s.opportunityResponses.id });
    if (updated.length) return { id: updated[0].id };
    const response = { id: crypto.randomUUID(), opportunityId, authorId: personId, body: text };
    await tx.insert(s.opportunityResponses).values(response);
    return { id: response.id };
  });
}

export async function shareResponse(db: Database, personId: string, responseId: string, shared: boolean) {
  boundedText(responseId, 200);
  if (typeof shared !== "boolean") throw new Error("Invalid sharing state.");
  // Only the responder controls whether their response reaches the wider audience.
  const changed = await withActor(db, personId, tx => tx.update(s.opportunityResponses)
    .set({ shared })
    .where(and(eq(s.opportunityResponses.id, responseId), eq(s.opportunityResponses.authorId, personId)))
    .returning({ id: s.opportunityResponses.id }));
  if (!changed.length) throw new Error("You cannot change this response.");
}

export async function readResponses(db: Database, personId: string, opportunityId: string) {
  boundedText(opportunityId, 200);
  // RLS decides which responses this actor sees: their own, all of them if they
  // are the requester, and any shared response otherwise.
  return withActor(db, personId, async tx => {
    const author = alias(s.people, "response_author");
    const responses = await tx.select({ id: s.opportunityResponses.id, opportunityId: s.opportunityResponses.opportunityId,
      authorId: s.opportunityResponses.authorId, authorName: author.name, body: s.opportunityResponses.body,
      shared: s.opportunityResponses.shared, createdAt: s.opportunityResponses.createdAt })
      .from(s.opportunityResponses)
      .innerJoin(author, eq(author.id, s.opportunityResponses.authorId))
      .where(eq(s.opportunityResponses.opportunityId, opportunityId))
      .orderBy(asc(s.opportunityResponses.createdAt), asc(s.opportunityResponses.id)).limit(200);
    return { responses: responses.map(r => ({ ...r, mine: r.authorId === personId })) };
  });
}
