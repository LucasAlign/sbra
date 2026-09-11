import { sql } from "drizzle-orm";
import { pgTable, text, timestamp, boolean, integer, numeric, primaryKey, unique, check, foreignKey, index } from "drizzle-orm/pg-core";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const status = () => text("status", { enum: ["pending", "active", "suspended", "left"] }).notNull().default("pending");

export const people = pgTable("people", {
  id: text("id").primaryKey(), name: text("name").notNull(), createdAt: createdAt(),
});
// Provider subjects, never roster emails, establish login identity.
export const personIdentities = pgTable("person_identities", {
  provider: text("provider").notNull(), subject: text("subject").notNull(),
  personId: text("person_id").notNull().references(() => people.id),
}, t => [primaryKey({ columns: [t.provider, t.subject] })]);

export const organizations = pgTable("organizations", {
  id: text("id").primaryKey(), name: text("name").notNull(),
  kind: text("kind").notNull(), description: text("description").notNull().default(""),
  // Canonical profile fields (M2): edited once, shown in every listing.
  website: text("website").notNull().default(""),
  locations: text("locations").notNull().default(""),
  serviceAreas: text("service_areas").notNull().default(""),
  createdAt: createdAt(),
}, t => [check("organization_kind", sql`${t.kind} in ('business', 'chamber', 'association', 'municipality', 'other')`)]);

// A deliberately small CRM boundary: one private, versioned workspace document
// per member business. The revision supports optimistic concurrency for shared
// business logins, while the document can be normalized into relational tables
// later if usage calls for it.
export const businessCrmWorkspaces = pgTable("business_crm_workspaces", {
  organizationId: text("organization_id").primaryKey().references(() => organizations.id),
  revision: integer("revision").notNull().default(1),
  version: integer("version").notNull().default(2),
  data: text("data").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const networks = pgTable("networks", {
  id: text("id").primaryKey(), slug: text("slug").notNull().unique(), name: text("name").notNull(),
});
export const regions = pgTable("regions", {
  id: text("id").primaryKey(), networkId: text("network_id").notNull().references(() => networks.id),
  slug: text("slug").notNull(), name: text("name").notNull(),
}, t => [unique().on(t.networkId, t.slug), unique().on(t.id, t.networkId)]);

export const communities = pgTable("communities", {
  id: text("id").primaryKey(), networkId: text("network_id").notNull().references(() => networks.id),
  operatorId: text("operator_id").notNull().references(() => organizations.id),
  slug: text("slug").notNull(), name: text("name").notNull(), shortName: text("short_name").notNull(),
  description: text("description").notNull().default(""), logo: text("logo"),
  locale: text("locale").notNull().default("en"), kind: text("kind").notNull(),
  status: text("status").notNull().default("draft"), createdAt: createdAt(),
}, t => [unique().on(t.networkId, t.slug), unique().on(t.id, t.networkId),
  check("community_kind", sql`${t.kind} in ('geographic', 'organizational', 'interest')`),
  check("community_status", sql`${t.status} in ('draft', 'active', 'suspended', 'archived')`)]);

export const communityRegions = pgTable("community_regions", {
  communityId: text("community_id").notNull(), regionId: text("region_id").notNull(), networkId: text("network_id").notNull(),
}, t => [primaryKey({ columns: [t.communityId, t.regionId] }),
  foreignKey({ columns: [t.communityId, t.networkId], foreignColumns: [communities.id, communities.networkId] }),
  foreignKey({ columns: [t.regionId, t.networkId], foreignColumns: [regions.id, regions.networkId] })]);

export const organizationAffiliations = pgTable("organization_affiliations", {
  personId: text("person_id").notNull().references(() => people.id),
  organizationId: text("organization_id").notNull().references(() => organizations.id),
  title: text("title").notNull().default(""), status: status(), createdAt: createdAt(),
}, t => [primaryKey({ columns: [t.personId, t.organizationId] }),
  check("affiliation_status", sql`${t.status} in ('pending', 'active', 'suspended', 'left')`)]);

export const personCommunityMemberships = pgTable("person_community_memberships", {
  personId: text("person_id").notNull().references(() => people.id),
  communityId: text("community_id").notNull().references(() => communities.id), status: status(), createdAt: createdAt(),
}, t => [primaryKey({ columns: [t.personId, t.communityId] }), index().on(t.communityId, t.status),
  check("person_membership_status", sql`${t.status} in ('pending', 'active', 'suspended', 'left')`)]);

export const organizationCommunityMemberships = pgTable("organization_community_memberships", {
  organizationId: text("organization_id").notNull().references(() => organizations.id),
  communityId: text("community_id").notNull().references(() => communities.id),
  status: status(), tier: text("tier"), createdAt: createdAt(),
}, t => [primaryKey({ columns: [t.organizationId, t.communityId] }), index().on(t.communityId, t.status),
  check("organization_membership_status", sql`${t.status} in ('pending', 'active', 'suspended', 'left')`)]);

export const roleGrants = pgTable("role_grants", {
  id: text("id").primaryKey(), personId: text("person_id").notNull().references(() => people.id),
  role: text("role").notNull(), regionId: text("region_id").references(() => regions.id),
  communityId: text("community_id").references(() => communities.id),
  organizationId: text("organization_id").references(() => organizations.id),
  grantedBy: text("granted_by").notNull().references(() => people.id),
  createdAt: createdAt(), expiresAt: timestamp("expires_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
}, t => [index().on(t.personId), check("role_scope", sql`
  (${t.role} = 'platform_admin' and ${t.regionId} is null and ${t.communityId} is null and ${t.organizationId} is null) or
  (${t.role} = 'regional_admin' and ${t.regionId} is not null and ${t.communityId} is null and ${t.organizationId} is null) or
  (${t.role} = 'community_admin' and ${t.regionId} is null and ${t.communityId} is not null and ${t.organizationId} is null) or
  (${t.role} = 'business_admin' and ${t.regionId} is null and ${t.communityId} is null and ${t.organizationId} is not null)
`)]);

export const communityInvitations = pgTable("community_invitations", {
  id: text("id").primaryKey(),
  communityId: text("community_id").notNull().references(() => communities.id),
  recipientId: text("recipient_id").notNull().references(() => people.id),
  issuedBy: text("issued_by").notNull().references(() => people.id),
  createdAt: createdAt(), expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
}, t => [index().on(t.recipientId), index().on(t.communityId),
  check("invitation_expiry", sql`${t.expiresAt} > ${t.createdAt}`),
  check("invitation_terminal_state", sql`not (${t.acceptedAt} is not null and ${t.revokedAt} is not null)`)]);

export const membershipAudit = pgTable("membership_audit", {
  id: text("id").primaryKey(), communityId: text("community_id").notNull().references(() => communities.id),
  actorId: text("actor_id").references(() => people.id),
  targetId: text("target_id").notNull().references(() => people.id),
  action: text("action").notNull(), createdAt: createdAt(),
}, t => [index().on(t.communityId, t.createdAt), check("membership_audit_action", sql`${t.action} in
  ('invitation.created', 'invitation.revoked', 'invitation.accepted', 'membership.suspended', 'membership.restored', 'community.provisioned', 'administrator.transferred',
    'claim.requested', 'claim.approved', 'claim.rejected', 'claim.withdrawn')`)]);

// --- Verified business claiming (M1 verified claims / M2) -------------------
// A signed-in member asks to represent a business listed in a community. The
// community admin vouches (operator vouch): approval atomically grants Business
// Admin + an active affiliation. Disputes are decided by the community admin.
export const claimRequests = pgTable("claim_requests", {
  id: text("id").primaryKey(),
  personId: text("person_id").notNull().references(() => people.id),
  organizationId: text("organization_id").notNull().references(() => organizations.id),
  communityId: text("community_id").notNull().references(() => communities.id),
  status: text("status").notNull().default("pending"),
  evidence: text("evidence").notNull().default(""),
  reviewedBy: text("reviewed_by").references(() => people.id),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  decisionNote: text("decision_note").notNull().default(""),
  createdAt: createdAt(),
}, t => [index().on(t.communityId, t.status), index().on(t.personId),
  check("claim_status", sql`${t.status} in ('pending', 'approved', 'rejected', 'withdrawn')`)]);

// Per-community presentation of a canonical organization: a local headline/offer
// and visibility, layered over (never overwriting) the canonical profile.
export const communityListingOverrides = pgTable("community_listing_overrides", {
  organizationId: text("organization_id").notNull().references(() => organizations.id),
  communityId: text("community_id").notNull().references(() => communities.id),
  headline: text("headline").notNull().default(""),
  localOffer: text("local_offer").notNull().default(""),
  visibility: text("visibility").notNull().default("listed"),
  updatedBy: text("updated_by").notNull().references(() => people.id),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [primaryKey({ columns: [t.organizationId, t.communityId] }),
  check("listing_visibility", sql`${t.visibility} in ('listed', 'hidden')`)]);

// --- Private import staging (M1) -------------------------------------------
// Ingested rows stay private to the operator's community, never assign
// ownership, and never surface in any member-facing projection. Claiming is the
// only path from a staged record to a real affiliation.
export const importBatches = pgTable("import_batches", {
  id: text("id").primaryKey(),
  communityId: text("community_id").notNull().references(() => communities.id),
  source: text("source").notNull(),
  note: text("note").notNull().default(""),
  createdBy: text("created_by").notNull().references(() => people.id),
  createdAt: createdAt(),
}, t => [index().on(t.communityId)]);

export const sourceRecords = pgTable("source_records", {
  id: text("id").primaryKey(),
  batchId: text("batch_id").notNull().references(() => importBatches.id),
  externalId: text("external_id").notNull().default(""),
  payload: text("payload").notNull().default(""),
  createdAt: createdAt(),
}, t => [index().on(t.batchId)]);

export const externalEntityLinks = pgTable("external_entity_links", {
  id: text("id").primaryKey(),
  sourceRecordId: text("source_record_id").notNull().references(() => sourceRecords.id),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  createdAt: createdAt(),
}, t => [unique().on(t.sourceRecordId, t.entityType),
  check("external_link_entity", sql`${t.entityType} in ('organization', 'person')`)]);

export const mergeHistory = pgTable("merge_history", {
  id: text("id").primaryKey(),
  entityType: text("entity_type").notNull(),
  survivingId: text("surviving_id").notNull(),
  mergedId: text("merged_id").notNull(),
  communityId: text("community_id").references(() => communities.id),
  reason: text("reason").notNull().default(""),
  mergedBy: text("merged_by").notNull().references(() => people.id),
  createdAt: createdAt(),
}, t => [check("merge_entity", sql`${t.entityType} in ('organization', 'person')`),
  check("merge_distinct", sql`${t.survivingId} <> ${t.mergedId}`)]);

// --- Opportunities & requests (M4) -----------------------------------------
// The core networking primitive: a structured business need ('need') or offer
// ('offer'), authored in an owning community, optionally on behalf of a
// represented organization. Private by default; publishing exposes it to the
// owning community's active members ('community'). Responses stay private to the
// requester (the opportunity author) and the responder unless the responder
// shares theirs with that same audience.
export const opportunities = pgTable("opportunities", {
  id: text("id").primaryKey(),
  communityId: text("community_id").notNull().references(() => communities.id),
  authorId: text("author_id").notNull().references(() => people.id),
  organizationId: text("organization_id").references(() => organizations.id),
  kind: text("kind").notNull(),
  title: text("title").notNull(),
  detail: text("detail").notNull().default(""),
  geography: text("geography").notNull().default(""),
  status: text("status").notNull().default("open"),
  visibility: text("visibility").notNull().default("private"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: createdAt(),
}, t => [index().on(t.communityId, t.status), index().on(t.authorId),
  check("opportunity_kind", sql`${t.kind} in ('need', 'offer')`),
  check("opportunity_status", sql`${t.status} in ('open', 'closed')`),
  check("opportunity_visibility", sql`${t.visibility} in ('private', 'community')`)]);

// One response per person per opportunity (the responder edits their single
// response, including whether it is shared beyond the requester).
export const opportunityResponses = pgTable("opportunity_responses", {
  id: text("id").primaryKey(),
  opportunityId: text("opportunity_id").notNull().references(() => opportunities.id),
  authorId: text("author_id").notNull().references(() => people.id),
  body: text("body").notNull().default(""),
  shared: boolean("shared").notNull().default(false),
  createdAt: createdAt(),
}, t => [unique().on(t.opportunityId, t.authorId), index().on(t.opportunityId)]);

// --- Events & RSVP (M5) -----------------------------------------------------
// One canonical event, organized by a person (optionally on behalf of an org),
// is PUBLISHED to many communities (see event_publications) — there are no
// per-community copies. Discovery is shared across the communities an event is
// published to; a member sees an event if they are an active member of any
// community it reaches. Attendance is private: a participant sees only their own
// RSVP, while the organizer sees the roster. Named `community_events` /
// `event_rsvps` to avoid colliding with the legacy prototype's events/rsvps.
export const communityEvents = pgTable("community_events", {
  id: text("id").primaryKey(),
  organizerId: text("organizer_id").notNull().references(() => people.id),
  organizationId: text("organization_id").references(() => organizations.id),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  location: text("location").notNull().default(""),
  timezone: text("timezone").notNull().default("UTC"),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  capacity: integer("capacity"),
  status: text("status").notNull().default("scheduled"),
  createdAt: createdAt(),
}, t => [index().on(t.organizerId),
  check("event_status", sql`${t.status} in ('scheduled', 'canceled')`),
  check("event_capacity", sql`${t.capacity} is null or ${t.capacity} > 0`),
  check("event_time_order", sql`${t.endsAt} is null or ${t.endsAt} >= ${t.startsAt}`)]);

// A single event reaches many communities; no copies. PK (event, community).
export const eventPublications = pgTable("event_publications", {
  eventId: text("event_id").notNull().references(() => communityEvents.id),
  communityId: text("community_id").notNull().references(() => communities.id),
  publishedBy: text("published_by").notNull().references(() => people.id),
  createdAt: createdAt(),
}, t => [primaryKey({ columns: [t.eventId, t.communityId] }), index().on(t.communityId)]);

// One RSVP per person per event; the person edits their own. Capacity is enforced
// in the RSVP transaction (advisory-locked per event) against the going count.
export const eventRsvps = pgTable("event_rsvps", {
  eventId: text("event_id").notNull().references(() => communityEvents.id),
  personId: text("person_id").notNull().references(() => people.id),
  status: text("status").notNull().default("going"),
  respondedAt: timestamp("responded_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [primaryKey({ columns: [t.eventId, t.personId] }),
  check("rsvp_status", sql`${t.status} in ('going', 'not_going')`)]);

// --- Introductions, connections & referrals (M6) ---------------------------
// Member-driven relationships with consent. An introduction names participants;
// each party's contact is exchanged only once they accept. Accepted parties
// become connections. Each person keeps private relationship notes. Referrals
// ride on connections and use the simplified points model.
export const introductions = pgTable("introductions", {
  id: text("id").primaryKey(),
  communityId: text("community_id").notNull().references(() => communities.id),
  createdBy: text("created_by").notNull().references(() => people.id),
  message: text("message").notNull().default(""),
  status: text("status").notNull().default("pending"),
  createdAt: createdAt(),
}, t => [index().on(t.communityId), index().on(t.createdBy),
  check("introduction_status", sql`${t.status} in ('pending', 'accepted', 'declined', 'withdrawn')`)]);

// A participant's `contact` (how to reach them) is written only on acceptance and
// is projection-gated to accepted co-participants — contact is shared only after
// acceptance. RLS keeps the rows visible to participants of the introduction only.
export const introductionParticipants = pgTable("introduction_participants", {
  introductionId: text("introduction_id").notNull().references(() => introductions.id),
  personId: text("person_id").notNull().references(() => people.id),
  role: text("role").notNull().default("party"),
  consent: text("consent").notNull().default("pending"),
  contact: text("contact").notNull().default(""),
  respondedAt: timestamp("responded_at", { withTimezone: true }),
}, t => [primaryKey({ columns: [t.introductionId, t.personId] }), index().on(t.personId),
  check("participant_role", sql`${t.role} in ('introducer', 'party')`),
  check("participant_consent", sql`${t.consent} in ('pending', 'accepted', 'declined')`)]);

// A symmetric connection between two people, stored with a canonical ordering
// (person_low < person_high) so there is at most one row per pair. Formed when an
// introduction's parties accept, or directly.
export const connections = pgTable("connections", {
  personLow: text("person_low").notNull().references(() => people.id),
  personHigh: text("person_high").notNull().references(() => people.id),
  status: text("status").notNull().default("active"),
  introductionId: text("introduction_id").references(() => introductions.id),
  createdAt: createdAt(),
}, t => [primaryKey({ columns: [t.personLow, t.personHigh] }), index().on(t.personHigh),
  check("connection_status", sql`${t.status} in ('active', 'archived')`),
  check("connection_distinct", sql`${t.personLow} < ${t.personHigh}`)]);

// A private note one person keeps about another; visible only to its owner. A
// connection never exposes either party's notes.
export const relationshipNotes = pgTable("relationship_notes", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull().references(() => people.id),
  aboutPersonId: text("about_person_id").notNull().references(() => people.id),
  body: text("body").notNull().default(""),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [index().on(t.ownerId, t.aboutPersonId)]);

// A referral between two connected members. The whole row is visible only to
// the giver and receiver. Points are derived from status: 10 when sent and 40
// additional when won. Named
// `member_referrals` so it never collides with the legacy prototype's `referrals`.
export const memberReferrals = pgTable("member_referrals", {
  id: text("id").primaryKey(),
  communityId: text("community_id").notNull().references(() => communities.id),
  fromPersonId: text("from_person_id").notNull().references(() => people.id),
  toPersonId: text("to_person_id").notNull().references(() => people.id),
  need: text("need").notNull().default(""),
  note: text("note").notNull().default(""),
  status: text("status").notNull().default("sent"),
  createdAt: createdAt(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
}, t => [index().on(t.fromPersonId), index().on(t.toPersonId),
  check("referral_status", sql`${t.status} in ('sent', 'won', 'not_won')`),
  check("referral_distinct", sql`${t.fromPersonId} <> ${t.toPersonId}`)]);

// --- Announcements (M7) -----------------------------------------------------
// A community communication with author authority: created by a community admin
// and PUBLISHED to one or more communities they administer (no copies). Members
// of a community it reaches can read it and comment; comments inherit the
// announcement's audience.
export const announcements = pgTable("announcements", {
  id: text("id").primaryKey(),
  authorId: text("author_id").notNull().references(() => people.id),
  title: text("title").notNull(),
  body: text("body").notNull().default(""),
  status: text("status").notNull().default("published"),
  createdAt: createdAt(),
}, t => [index().on(t.authorId),
  check("announcement_status", sql`${t.status} in ('published', 'archived')`)]);

export const announcementPublications = pgTable("announcement_publications", {
  announcementId: text("announcement_id").notNull().references(() => announcements.id),
  communityId: text("community_id").notNull().references(() => communities.id),
  publishedBy: text("published_by").notNull().references(() => people.id),
  createdAt: createdAt(),
}, t => [primaryKey({ columns: [t.announcementId, t.communityId] }), index().on(t.communityId)]);

export const announcementComments = pgTable("announcement_comments", {
  id: text("id").primaryKey(),
  announcementId: text("announcement_id").notNull().references(() => announcements.id),
  authorId: text("author_id").notNull().references(() => people.id),
  body: text("body").notNull().default(""),
  createdAt: createdAt(),
}, t => [index().on(t.announcementId)]);

// --- Legacy backfill (M8) ---------------------------------------------------
// Maps a deployed prototype entity (a legacy member or business row) to its
// canonical id, or flags it for manual review. Entirely an operations /
// provisioning concern written by the privileged backfill path; RLS is enabled
// with NO policy, so the restricted runtime role can neither read nor write it.
export const legacyIdMap = pgTable("legacy_id_map", {
  entityType: text("entity_type").notNull(),
  legacyId: text("legacy_id").notNull(),
  canonicalId: text("canonical_id"),
  status: text("status").notNull().default("mapped"),
  source: text("source").notNull().default(""),
  reason: text("reason").notNull().default(""),
  createdAt: createdAt(),
}, t => [primaryKey({ columns: [t.entityType, t.legacyId] }),
  check("legacy_map_entity", sql`${t.entityType} in ('person', 'organization')`),
  check("legacy_map_status", sql`${t.status} in ('mapped', 'needs_review', 'skipped')`)]);
