// Domain-module contracts (M0).
//
// The architecture (§6.5) splits data access into five modules. M0 stands up all
// five *interfaces* so the seam's shape is fixed and later milestones fill in the
// demo + Postgres adapters behind them one at a time, rather than each feature
// reaching into raw persistence.
//
//   1. Identity & Access          — implemented in ./identity-access.ts (M0)
//   2. Organizations & Membership — M1/M2 (claiming, profiles, roster admin)
//   3. Discovery & Publishing     — M3/M4 (authorized directory, opportunities)
//   4. Relationships              — M6 (introductions, connections, referrals)
//   5. Community Operations       — M7 (announcements, home workspace)
//
// The implementations that exist today live in lib/network/{repository,membership}.ts.
// As each module is built, its logic moves behind the matching interface here and
// gains a demo adapter so seed mode and backend mode share one call path.

import type { ModuleActor, PublicProfile } from "./types";

/** Canonical, editable organization profile fields (M2). Edited once, shown everywhere. */
export type OrganizationProfile = {
  name?: string; kind?: string; description?: string; website?: string; locations?: string; serviceAreas?: string;
};

/** Per-community presentation layered over the canonical org, never overwriting it (M2). */
export type ListingOverride = { headline?: string; localOffer?: string; visibility?: "listed" | "hidden" };

/** A pending business claim as an administrator reviews it. */
export type ClaimReview = {
  id: string; personId: string; personName: string;
  organizationId: string; organizationName: string; evidence: string; createdAt: Date;
};

/** 2. Organizations & Membership — canonical orgs, affiliations, community rosters. */
export interface OrganizationsMembershipModule {
  /** Edit an organization's canonical description (requires an active Business Admin grant). */
  editOrganizationDescription(actor: ModuleActor, organizationId: string, description: string): Promise<void>;
  /** Edit any canonical profile fields (requires an active Business Admin grant). */
  editOrganizationProfile(actor: ModuleActor, organizationId: string, fields: OrganizationProfile): Promise<void>;
  /** Set a community-local listing override for an org the actor administers. */
  setListingOverride(actor: ModuleActor, organizationId: string, communityId: string, fields: ListingOverride): Promise<void>;
  /** File a claim to represent a business listed in a community (operator vouch). */
  requestClaim(actor: ModuleActor, organizationId: string, communityId: string, evidence: string): Promise<{ id: string }>;
  /** Withdraw the actor's own pending claim. */
  withdrawClaim(actor: ModuleActor, claimId: string): Promise<void>;
  /** As a community admin, approve or reject a pending claim. Approval grants Business Admin. */
  reviewClaim(actor: ModuleActor, claimId: string, decision: "approved" | "rejected", note?: string): Promise<void>;
  /** As a community admin, list pending claims awaiting a vouch. */
  readClaimRequests(actor: ModuleActor, communityId: string): Promise<{ claims: ClaimReview[] }>;
}

/** A directory listing: canonical fields with any community-local override applied. */
export type DirectoryListing = PublicProfile & {
  description: string; kind: string; website: string; locations: string; serviceAreas: string; localOffer: string;
};

/** A structured business need or offer (M4). */
export type OpportunityKind = "need" | "offer";

/** Fields to post a new opportunity. Private by default until published. */
export type OpportunityInput = {
  communityId: string; kind: OpportunityKind; title: string;
  detail?: string; geography?: string; organizationId?: string | null; expiresAt?: Date | null;
};

/** An opportunity as an authorized viewer sees it. */
export type Opportunity = {
  id: string; communityId: string; authorId: string; authorName: string;
  organizationId: string | null; organizationName: string | null;
  kind: string; title: string; detail: string; geography: string;
  status: string; visibility: string; expiresAt: Date | null; createdAt: Date; mine: boolean;
};

/** A response to an opportunity as an authorized viewer sees it. */
export type OpportunityResponse = {
  id: string; opportunityId: string; authorId: string; authorName: string;
  body: string; shared: boolean; createdAt: Date; mine: boolean;
};

/** 3. Discovery & Publishing — authorized directory, opportunities & responses. */
export interface DiscoveryPublishingModule {
  /** Paginated, audience-scoped directory of organizations for a community. */
  readDirectory(actor: ModuleActor, communityId: string, after?: string): Promise<{
    organizations: DirectoryListing[];
    nextCursor: string | null;
  }>;
  /** Post a structured need/offer in a community (private by default). */
  postOpportunity(actor: ModuleActor, input: OpportunityInput): Promise<{ id: string }>;
  /** Publish the actor's own opportunity to the owning community's members. */
  publishOpportunity(actor: ModuleActor, opportunityId: string): Promise<void>;
  /** Close the actor's own opportunity. */
  closeOpportunity(actor: ModuleActor, opportunityId: string): Promise<void>;
  /** Opportunities the actor may see in a community (their own + published ones). */
  readOpportunities(actor: ModuleActor, communityId: string, after?: string): Promise<{
    opportunities: Opportunity[];
    nextCursor: string | null;
  }>;
  /** Respond to an opportunity the actor can see (one response per person). */
  respondToOpportunity(actor: ModuleActor, opportunityId: string, body: string): Promise<{ id: string }>;
  /** As the responder, share (or unshare) the actor's own response with the audience. */
  shareResponse(actor: ModuleActor, responseId: string, shared: boolean): Promise<void>;
  /** Responses the actor may see: their own, all as the requester, shared otherwise. */
  readResponses(actor: ModuleActor, opportunityId: string): Promise<{ responses: OpportunityResponse[] }>;
}

/** 4. Relationships — member-driven connections, introductions, referrals (M6). */
export interface RelationshipsModule {
  // Introductions require recipient consent before contact sharing; connection
  // notes stay private to their owner. Methods land in M6.
  readonly milestone: "M6";
}

/** 5. Community Operations — announcements, home workspace, scoped admin (M7). */
export interface CommunityOperationsModule {
  // Announcements carry an explicit audience and author authority; the home
  // workspace surfaces open requests and next actions. Methods land in M7.
  readonly milestone: "M7";
}
