import { sql } from "drizzle-orm";
import { pgTable, text, timestamp, primaryKey, unique, check, foreignKey, index } from "drizzle-orm/pg-core";

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
  ('invitation.created', 'invitation.revoked', 'invitation.accepted', 'membership.suspended', 'membership.restored', 'community.provisioned')`)]);
