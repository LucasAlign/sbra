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

/** Fields to create an event (published to its first community atomically). */
export type EventInput = {
  communityId: string; title: string; startsAt: Date; endsAt?: Date | null;
  description?: string; location?: string; timezone?: string;
  capacity?: number | null; organizationId?: string | null;
};

/** An event as an authorized viewer sees it. Attendance stays private: `goingCount`
 *  is populated only for the organizer; everyone else gets `full` + their own `myStatus`. */
export type CommunityEvent = {
  id: string; organizerId: string; organizerName: string;
  organizationId: string | null; organizationName: string | null;
  title: string; description: string; location: string; timezone: string;
  startsAt: Date; endsAt: Date | null; capacity: number | null; status: string;
  mine: boolean; myStatus: string | null; full: boolean; goingCount: number | null;
};

/** One entry in an event's roster (organizer-only). */
export type EventAttendee = { personId: string; name: string; status: string; respondedAt: Date };

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
  /** Create an event and publish it to its first community (one owning row, no copies). */
  createEvent(actor: ModuleActor, input: EventInput): Promise<{ id: string }>;
  /** Publish an existing event to another community the actor actively belongs to. */
  publishEvent(actor: ModuleActor, eventId: string, communityId: string): Promise<void>;
  /** Cancel the actor's own event. */
  cancelEvent(actor: ModuleActor, eventId: string): Promise<void>;
  /** RSVP to an event the actor can see (one per person; capacity enforced). */
  rsvpToEvent(actor: ModuleActor, eventId: string, status: "going" | "not_going"): Promise<{ status: string }>;
  /** Events shared to a community that the actor may see, with their own RSVP status. */
  readEvents(actor: ModuleActor, communityId: string): Promise<{ events: CommunityEvent[] }>;
  /** As the organizer, read an event's private attendance roster. */
  readEventAttendance(actor: ModuleActor, eventId: string): Promise<{ attendees: EventAttendee[] }>;
}

/** Fields to request an introduction. The initiator is a party by default
 *  (asParty), providing their own contact; set asParty:false to only facilitate. */
export type IntroductionInput = {
  communityId: string; partyIds: string[]; message?: string; contact?: string; asParty?: boolean;
};

/** One participant of an introduction. `contact` is populated only once BOTH the
 *  viewer and this participant have accepted — contact is shared after acceptance. */
export type IntroductionParticipant = {
  personId: string; name: string; role: string; consent: string; contact: string;
};

/** An introduction as one of its participants sees it. */
export type Introduction = {
  id: string; communityId: string; createdBy: string; message: string; status: string;
  createdAt: Date; mine: boolean; myRole: string; myConsent: string; participants: IntroductionParticipant[];
};

/** A connection between the actor and another person. */
export type Connection = { personId: string; name: string; since: Date; introductionId: string | null };

/** A private relationship note (owner-only). */
export type RelationshipNote = { id: string; aboutPersonId: string; body: string; updatedAt: Date };

/** Fields to create a referral (to an existing connection). */
export type ReferralInput = { communityId: string; toPersonId: string; need?: string; note?: string };

export type ReferralOutcome = "won" | "not_won";

/** A referral as one of its two parties sees it. Points are derived from status. */
export type Referral = {
  id: string; communityId: string; fromPersonId: string; fromName: string; toPersonId: string; toName: string;
  need: string; note: string; status: "sent" | ReferralOutcome; points: number;
  createdAt: Date; closedAt: Date | null; direction: string;
};

/** 4. Relationships — member-driven connections, introductions, referrals (M6). */
export interface RelationshipsModule {
  /** Request an introduction naming one or more community members. */
  requestIntroduction(actor: ModuleActor, input: IntroductionInput): Promise<{ id: string }>;
  /** Respond to an introduction awaiting the actor (contact shared only on accept). */
  respondToIntroduction(actor: ModuleActor, introductionId: string, decision: "accepted" | "declined", contact?: string): Promise<{ status: string }>;
  /** Withdraw the actor's own pending introduction. */
  withdrawIntroduction(actor: ModuleActor, introductionId: string): Promise<void>;
  /** Introductions the actor takes part in, with per-participant contact gating. */
  readIntroductions(actor: ModuleActor): Promise<{ introductions: Introduction[] }>;
  /** The actor's active connections. */
  readConnections(actor: ModuleActor): Promise<{ connections: Connection[] }>;
  /** Add a private note about a person the actor is connected to. */
  addRelationshipNote(actor: ModuleActor, aboutPersonId: string, body: string): Promise<{ id: string }>;
  /** Edit one of the actor's own notes. */
  updateRelationshipNote(actor: ModuleActor, noteId: string, body: string): Promise<void>;
  /** The actor's own private notes about a person. */
  readRelationshipNotes(actor: ModuleActor, aboutPersonId: string): Promise<{ notes: RelationshipNote[] }>;
  /** Refer a connection within a community. */
  createReferral(actor: ModuleActor, input: ReferralInput): Promise<{ id: string }>;
  /** Let the receiving member mark the referral Won or Not Won. */
  updateReferralOutcome(actor: ModuleActor, referralId: string, status: ReferralOutcome): Promise<void>;
  /** Referrals the actor gave or received. */
  readReferrals(actor: ModuleActor): Promise<{ referrals: Referral[] }>;
}

/** Fields to create an announcement (published to its first community). */
export type AnnouncementInput = { communityId: string; title: string; body?: string };

/** An announcement as a member of a publishing community sees it. */
export type Announcement = {
  id: string; authorId: string; authorName: string; title: string; body: string;
  status: string; createdAt: Date; commentCount: number; mine: boolean;
};

/** A comment on an announcement (inherits the announcement's audience). */
export type AnnouncementComment = {
  id: string; announcementId: string; authorId: string; authorName: string; body: string; createdAt: Date; mine: boolean;
};

/** The home workspace: the actor's front door, aggregated and RLS-scoped. */
export type HomeWorkspace = {
  introductionsAwaiting: { id: string; communityId: string; message: string; createdAt: Date }[];
  upcomingEvents: { id: string; title: string; startsAt: Date; communityId: string }[];
  openOpportunities: { id: string; communityId: string; kind: string; title: string; createdAt: Date; mine: boolean }[];
  announcements: { id: string; communityId: string; title: string; authorName: string; createdAt: Date }[];
};

/** 5. Community Operations — announcements, home workspace, scoped admin (M7). */
export interface CommunityOperationsModule {
  /** Create an announcement and publish it to a community the actor administers. */
  createAnnouncement(actor: ModuleActor, input: AnnouncementInput): Promise<{ id: string }>;
  /** Publish an existing announcement to another community the actor administers. */
  publishAnnouncement(actor: ModuleActor, announcementId: string, communityId: string): Promise<void>;
  /** Archive the actor's own announcement. */
  archiveAnnouncement(actor: ModuleActor, announcementId: string): Promise<void>;
  /** Announcements published to a community the actor belongs to. */
  readAnnouncements(actor: ModuleActor, communityId: string): Promise<{ announcements: Announcement[] }>;
  /** Comment on an announcement the actor can see (comments inherit its audience). */
  commentOnAnnouncement(actor: ModuleActor, announcementId: string, body: string): Promise<{ id: string }>;
  /** Comments on an announcement the actor can see. */
  readAnnouncementComments(actor: ModuleActor, announcementId: string): Promise<{ comments: AnnouncementComment[] }>;
  /** The actor's home workspace across their communities. */
  readHomeWorkspace(actor: ModuleActor): Promise<HomeWorkspace>;
}
