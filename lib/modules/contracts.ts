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

/** 2. Organizations & Membership — canonical orgs, affiliations, community rosters. */
export interface OrganizationsMembershipModule {
  /** Edit an organization's canonical description (requires an active Business Admin grant). */
  editOrganizationDescription(actor: ModuleActor, organizationId: string, description: string): Promise<void>;
  // M1/M2 add: claim requests, profile fields, listing overrides, roster admin,
  // invitations, and membership status changes (currently in lib/network/membership.ts).
}

/** 3. Discovery & Publishing — authorized directory and published content. */
export interface DiscoveryPublishingModule {
  /** Paginated, audience-scoped directory of organizations for a community. */
  readDirectory(actor: ModuleActor, communityId: string, after?: string): Promise<{
    organizations: (PublicProfile & { description: string; kind: string })[];
    nextCursor: string | null;
  }>;
  // M4 adds: opportunities and responses with per-audience publication.
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
