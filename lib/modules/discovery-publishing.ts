// Discovery & Publishing domain module (M0 directory + M4 opportunities).
//
// Owns the authorized community directory (which organizations a member may see,
// and each one's public projection) and the opportunities primitive: structured
// needs/offers that are private until published to a community, with responses
// private to the requester and responder unless shared. Demo and Postgres
// adapters implement one interface; the Postgres adapter delegates to the
// transactional, RLS-backed logic in lib/network/{repository,opportunities}.ts.

import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as fullSchema from "../db/schema";
import { readDirectory } from "../network/repository";
import {
  closeOpportunity, postOpportunity, publishOpportunity, readOpportunities,
  readResponses, respondToOpportunity, shareResponse,
} from "../network/opportunities";
import type { DiscoveryPublishingModule, OpportunityInput } from "./contracts";
import type { DemoWorld, DemoOpportunity } from "./demo-world";
import { ModuleActor, ModuleError } from "./types";

type Database = PostgresJsDatabase<typeof fullSchema>;
const PAGE = 25;
const OPPORTUNITY_KINDS = ["need", "offer"] as const;

// --- Postgres adapter -------------------------------------------------------

export class PostgresDiscoveryPublishing implements DiscoveryPublishingModule {
  constructor(private readonly db: Database) {}

  // Delegates to the keyset-paginated, membership-scoped query covered by the
  // network integration test; the projection there is already public-only.
  readDirectory(actor: ModuleActor, communityId: string, after?: string) {
    return readDirectory(this.db, actor.personId, communityId, after);
  }
  postOpportunity(actor: ModuleActor, input: OpportunityInput) {
    return postOpportunity(this.db, actor.personId, input);
  }
  publishOpportunity(actor: ModuleActor, opportunityId: string) {
    return publishOpportunity(this.db, actor.personId, opportunityId);
  }
  closeOpportunity(actor: ModuleActor, opportunityId: string) {
    return closeOpportunity(this.db, actor.personId, opportunityId);
  }
  readOpportunities(actor: ModuleActor, communityId: string, after?: string) {
    return readOpportunities(this.db, actor.personId, communityId, after);
  }
  respondToOpportunity(actor: ModuleActor, opportunityId: string, body: string) {
    return respondToOpportunity(this.db, actor.personId, opportunityId, body);
  }
  shareResponse(actor: ModuleActor, responseId: string, shared: boolean) {
    return shareResponse(this.db, actor.personId, responseId, shared);
  }
  readResponses(actor: ModuleActor, opportunityId: string) {
    return readResponses(this.db, actor.personId, opportunityId);
  }
}

// --- Demo adapter -----------------------------------------------------------

export class DemoDiscoveryPublishing implements DiscoveryPublishingModule {
  constructor(private readonly world: DemoWorld) {}

  private activeMember(personId: string, communityId: string): boolean {
    return this.world.communities.get(communityId)?.status === "active"
      && this.world.personMemberships.some(m => m.personId === personId && m.communityId === communityId && m.status === "active");
  }

  private canAdminOrg(personId: string, organizationId: string): boolean {
    const now = Date.now();
    return this.world.affiliations.some(a => a.personId === personId && a.organizationId === organizationId && a.status === "active")
      && this.world.grants.some(g => g.personId === personId && g.organizationId === organizationId
        && g.role === "business_admin" && !g.revokedAt && (!g.expiresAt || g.expiresAt.getTime() > now));
  }

  // Mirrors collab_can_see_opportunity: author always; members once published.
  private canSee(personId: string, opp: DemoOpportunity): boolean {
    return opp.authorId === personId || (opp.visibility === "community" && this.activeMember(personId, opp.communityId));
  }

  async readDirectory(actor: ModuleActor, communityId: string, after?: string) {
    // Same gate as the SQL: the community must be active and the actor an active
    // member of it, or the directory is not available to them.
    if (!this.activeMember(actor.personId, communityId)) {
      throw new ModuleError("This community is not available to your account.");
    }
    const orgIds = this.world.orgMemberships
      .filter(m => m.communityId === communityId && m.status === "active")
      .map(m => m.organizationId)
      // A 'hidden' community override drops the org from this listing.
      .filter(id => this.world.listingOverrides.find(
        o => o.organizationId === id && o.communityId === communityId)?.visibility !== "hidden")
      .filter(id => (after ? id > after : true))
      .sort();
    // Fetch one extra row to know whether another page exists.
    const page = orgIds.slice(0, PAGE + 1).map(id => {
      const org = this.world.organizations.get(id)!;
      const override = this.world.listingOverrides.find(o => o.organizationId === id && o.communityId === communityId);
      // Public projection only — never spread the stored row. Local override wins
      // for presentation; canonical description is the fallback.
      return { id: org.id, name: org.name, kind: org.kind, website: org.website,
        locations: org.locations, serviceAreas: org.serviceAreas,
        description: override?.headline || org.description, localOffer: override?.localOffer ?? "" };
    });
    return { organizations: page.slice(0, PAGE), nextCursor: page.length > PAGE ? page[PAGE - 1].id : null };
  }

  async postOpportunity(actor: ModuleActor, input: OpportunityInput) {
    if (!input.title?.trim() || input.title.length > 200) throw new ModuleError("Invalid title.");
    if (!OPPORTUNITY_KINDS.includes(input.kind)) throw new ModuleError("Choose whether this is a need or an offer.");
    const detail = input.detail ?? "";
    const geography = input.geography ?? "";
    if (detail.length > 5000) throw new ModuleError("Invalid detail.");
    if (geography.length > 500) throw new ModuleError("Invalid geography.");
    if (!this.activeMember(actor.personId, input.communityId)) {
      throw new ModuleError("This community is not available to your account.");
    }
    const organizationId = input.organizationId ?? null;
    if (organizationId && !this.canAdminOrg(actor.personId, organizationId)) {
      throw new ModuleError("You cannot post on behalf of that organization.");
    }
    const opportunity: DemoOpportunity = { id: crypto.randomUUID(), communityId: input.communityId,
      authorId: actor.personId, organizationId, kind: input.kind, title: input.title.trim(),
      detail: detail.trim(), geography: geography.trim(), status: "open", visibility: "private",
      expiresAt: input.expiresAt ?? null, createdAt: new Date() };
    this.world.opportunities.push(opportunity);
    return { id: opportunity.id };
  }

  async publishOpportunity(actor: ModuleActor, opportunityId: string) {
    const opp = this.world.opportunities.find(o => o.id === opportunityId && o.authorId === actor.personId);
    if (!opp) throw new ModuleError("You cannot publish this request.");
    opp.visibility = "community";
  }

  async closeOpportunity(actor: ModuleActor, opportunityId: string) {
    const opp = this.world.opportunities.find(o => o.id === opportunityId && o.authorId === actor.personId);
    if (!opp) throw new ModuleError("You cannot close this request.");
    opp.status = "closed";
  }

  async readOpportunities(actor: ModuleActor, communityId: string, after?: string) {
    const visible = this.world.opportunities
      .filter(o => o.communityId === communityId && this.canSee(actor.personId, o))
      .filter(o => (after ? o.id > after : true))
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const page = visible.slice(0, PAGE + 1).map(o => ({
      id: o.id, communityId: o.communityId, authorId: o.authorId,
      authorName: this.world.people.get(o.authorId)?.name ?? "",
      organizationId: o.organizationId, organizationName: o.organizationId ? this.world.organizations.get(o.organizationId)?.name ?? null : null,
      kind: o.kind, title: o.title, detail: o.detail, geography: o.geography, status: o.status,
      visibility: o.visibility, expiresAt: o.expiresAt, createdAt: o.createdAt, mine: o.authorId === actor.personId }));
    return { opportunities: page.slice(0, PAGE), nextCursor: page.length > PAGE ? page[PAGE - 1].id : null };
  }

  async respondToOpportunity(actor: ModuleActor, opportunityId: string, body: string) {
    if (!body?.trim() || body.length > 5000) throw new ModuleError("Add a short response.");
    const opp = this.world.opportunities.find(o => o.id === opportunityId);
    if (!opp || !this.canSee(actor.personId, opp)) throw new ModuleError("This request is not available to your account.");
    const existing = this.world.responses.find(r => r.opportunityId === opportunityId && r.authorId === actor.personId);
    if (existing) { existing.body = body.trim(); return { id: existing.id }; }
    const response = { id: crypto.randomUUID(), opportunityId, authorId: actor.personId, body: body.trim(), shared: false, createdAt: new Date() };
    this.world.responses.push(response);
    return { id: response.id };
  }

  async shareResponse(actor: ModuleActor, responseId: string, shared: boolean) {
    const response = this.world.responses.find(r => r.id === responseId && r.authorId === actor.personId);
    if (!response) throw new ModuleError("You cannot change this response.");
    response.shared = shared;
  }

  async readResponses(actor: ModuleActor, opportunityId: string) {
    const opp = this.world.opportunities.find(o => o.id === opportunityId);
    const responses = this.world.responses
      .filter(r => r.opportunityId === opportunityId)
      // Mirrors response_select: own response; all as the requester; shared to the
      // audience otherwise.
      .filter(r => r.authorId === actor.personId
        || opp?.authorId === actor.personId
        || (r.shared && !!opp && this.canSee(actor.personId, opp)))
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || (a.id < b.id ? -1 : 1))
      .map(r => ({ id: r.id, opportunityId: r.opportunityId, authorId: r.authorId,
        authorName: this.world.people.get(r.authorId)?.name ?? "", body: r.body, shared: r.shared,
        createdAt: r.createdAt, mine: r.authorId === actor.personId }));
    return { responses };
  }
}
