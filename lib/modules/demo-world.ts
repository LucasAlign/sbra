// Shared in-memory dataset for the demo adapters (M0).
//
// The demo adapters mirror the Postgres adapters' authorization and projection
// against this small, coherent world instead of a database, so seed mode and
// tests exercise the same module call paths as backend mode. A fresh world is
// cheap to build, which keeps tests isolated.

import { DEMO_ACTOR_ID } from "./ids";

export type DemoPerson = { id: string; name: string };
export type DemoOrganization = {
  id: string; name: string; description: string; kind: string;
  website: string; locations: string; serviceAreas: string;
};
export type DemoStatus = "pending" | "active" | "suspended" | "left";
export type DemoGrant = {
  personId: string; role: string; organizationId?: string; communityId?: string;
  revokedAt?: Date | null; expiresAt?: Date | null;
};
export type DemoListingOverride = {
  organizationId: string; communityId: string; headline: string; localOffer: string; visibility: "listed" | "hidden";
};
export type DemoClaim = {
  id: string; personId: string; organizationId: string; communityId: string;
  evidence: string; status: "pending" | "approved" | "rejected" | "withdrawn"; createdAt: Date;
};
export type DemoOpportunity = {
  id: string; communityId: string; authorId: string; organizationId: string | null;
  kind: "need" | "offer"; title: string; detail: string; geography: string;
  status: "open" | "closed"; visibility: "private" | "community"; expiresAt: Date | null; createdAt: Date;
};
export type DemoResponse = {
  id: string; opportunityId: string; authorId: string; body: string; shared: boolean; createdAt: Date;
};
export type DemoEvent = {
  id: string; organizerId: string; organizationId: string | null; title: string;
  description: string; location: string; timezone: string; startsAt: Date; endsAt: Date | null;
  capacity: number | null; status: "scheduled" | "canceled";
};
export type DemoPublication = { eventId: string; communityId: string };
export type DemoRsvp = { eventId: string; personId: string; status: "going" | "not_going"; respondedAt: Date };
export type DemoIntroduction = {
  id: string; communityId: string; createdBy: string; message: string; status: "pending" | "withdrawn"; createdAt: Date;
};
export type DemoParticipant = {
  introductionId: string; personId: string; role: "introducer" | "party";
  consent: "pending" | "accepted" | "declined"; contact: string; respondedAt: Date | null;
};
export type DemoConnection = {
  personLow: string; personHigh: string; status: "active" | "archived"; introductionId: string | null; createdAt: Date;
};
export type DemoNote = { id: string; ownerId: string; aboutPersonId: string; body: string; updatedAt: Date };
export type DemoReferral = {
  id: string; communityId: string; fromPersonId: string; toPersonId: string; need: string; note: string;
  status: "open" | "closed" | "declined"; closedValue: string | null; createdAt: Date; closedAt: Date | null;
};
export type DemoAnnouncement = {
  id: string; authorId: string; title: string; body: string; status: "published" | "archived"; createdAt: Date;
};
export type DemoAnnouncementPublication = { announcementId: string; communityId: string };
export type DemoAnnouncementComment = { id: string; announcementId: string; authorId: string; body: string; createdAt: Date };

export type DemoWorld = {
  people: Map<string, DemoPerson>;
  communities: Map<string, { id: string; status: string }>;
  organizations: Map<string, DemoOrganization>;
  personMemberships: { personId: string; communityId: string; status: DemoStatus }[];
  orgMemberships: { organizationId: string; communityId: string; status: DemoStatus }[];
  affiliations: { personId: string; organizationId: string; status: DemoStatus }[];
  grants: DemoGrant[];
  listingOverrides: DemoListingOverride[];
  claims: DemoClaim[];
  opportunities: DemoOpportunity[];
  responses: DemoResponse[];
  events: DemoEvent[];
  publications: DemoPublication[];
  rsvps: DemoRsvp[];
  introductions: DemoIntroduction[];
  participants: DemoParticipant[];
  connections: DemoConnection[];
  notes: DemoNote[];
  referrals: DemoReferral[];
  announcements: DemoAnnouncement[];
  announcementPublications: DemoAnnouncementPublication[];
  announcementComments: DemoAnnouncementComment[];
};

const DEMO_OTHER_PERSON = "demo-person-jordan";
const DEMO_COMMUNITY = "demo-community";

/** A coherent demo world: the demo actor admins one business; a second member and
 *  business exist so scoping and isolation are observable. */
export function createDemoWorld(): DemoWorld {
  return {
    people: new Map([
      [DEMO_ACTOR_ID, { id: DEMO_ACTOR_ID, name: "Collab member" }],
      [DEMO_OTHER_PERSON, { id: DEMO_OTHER_PERSON, name: "Jordan Rivera" }],
    ]),
    communities: new Map([[DEMO_COMMUNITY, { id: DEMO_COMMUNITY, status: "active" }]]),
    organizations: new Map([
      ["demo-brightside", { id: "demo-brightside", name: "Brightside Bakery", description: "Fresh bread and pastries on Penn Ave.", kind: "business", website: "", locations: "Penn Ave.", serviceAreas: "Reading" }],
      ["demo-riverworks", { id: "demo-riverworks", name: "Riverworks Consulting", description: "Small-business bookkeeping and advisory.", kind: "business", website: "", locations: "", serviceAreas: "" }],
    ]),
    personMemberships: [
      { personId: DEMO_ACTOR_ID, communityId: DEMO_COMMUNITY, status: "active" },
      { personId: DEMO_OTHER_PERSON, communityId: DEMO_COMMUNITY, status: "active" },
    ],
    orgMemberships: [
      { organizationId: "demo-brightside", communityId: DEMO_COMMUNITY, status: "active" },
      { organizationId: "demo-riverworks", communityId: DEMO_COMMUNITY, status: "active" },
    ],
    affiliations: [{ personId: DEMO_ACTOR_ID, organizationId: "demo-brightside", status: "active" }],
    grants: [
      { personId: DEMO_ACTOR_ID, organizationId: "demo-brightside", role: "business_admin" },
      // The demo actor also administers the community, so they can vouch for
      // another member's claim (but not their own).
      { personId: DEMO_ACTOR_ID, communityId: DEMO_COMMUNITY, role: "community_admin" },
    ],
    listingOverrides: [],
    claims: [],
    opportunities: [],
    responses: [],
    events: [],
    publications: [],
    rsvps: [],
    introductions: [],
    participants: [],
    connections: [],
    notes: [],
    referrals: [],
    announcements: [],
    announcementPublications: [],
    announcementComments: [],
  };
}

export const DEMO_COMMUNITY_ID = DEMO_COMMUNITY;
export const DEMO_OTHER_PERSON_ID = DEMO_OTHER_PERSON;
