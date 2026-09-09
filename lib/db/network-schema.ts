import { sql } from "drizzle-orm";
import { pgTable, text, timestamp, boolean, integer, primaryKey, unique, check, foreignKey, index } from "drizzle-orm/pg-core";

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
