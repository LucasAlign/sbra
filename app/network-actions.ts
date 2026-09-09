"use server";

import { and, asc, eq, gt, isNull, sql } from "drizzle-orm";
import * as s from "@/lib/db/network-schema";
import { requirePerson } from "@/lib/network/server";
import { withActor } from "@/lib/db/context";
import { identityAccess, discoveryPublishing, organizationsMembership, type OrganizationProfile, type ListingOverride } from "@/lib/modules";
import { communityAdminAccess, invitePerson, acceptInvitation, revokeInvitation, changeMembership, readMembershipAdmin, transferAdministrator, readAudit } from "@/lib/network/membership";
import { readImportBatches, recordMerge, stageImportBatch, linkSourceRecord } from "@/lib/network/import-staging";

export async function loadWorkspace() {
  const { db, person } = await requirePerson();
  return withActor(db, person.id, async tx => {
    const memberships = await tx.select({ id: s.communities.id, name: s.communities.name,
      shortName: s.communities.shortName, status: s.personCommunityMemberships.status,
      canAdmin: communityAdminAccess(person.id, s.communities.id) })
      .from(s.personCommunityMemberships).innerJoin(s.communities, eq(s.communities.id, s.personCommunityMemberships.communityId))
      .where(and(eq(s.personCommunityMemberships.personId, person.id), eq(s.communities.status, "active")))
      .orderBy(asc(s.communities.name)).limit(100);
    const invitations = await tx.select({ id: s.communityInvitations.id, communityName: s.communities.name,
      expiresAt: s.communityInvitations.expiresAt }).from(s.communityInvitations)
      .innerJoin(s.communities, eq(s.communities.id, s.communityInvitations.communityId)).where(and(
        eq(s.communityInvitations.recipientId, person.id), eq(s.communities.status, "active"),
        isNull(s.communityInvitations.acceptedAt), isNull(s.communityInvitations.revokedAt),
        gt(s.communityInvitations.expiresAt, sql`now()`))).orderBy(asc(s.communityInvitations.createdAt)).limit(100);
    return { person, memberships, invitations };
  });
}

export async function loadDirectory(communityId: string, after?: string) {
  const { actor } = await requirePerson();
  return discoveryPublishing().readDirectory(actor, communityId, after);
}

export async function updatePersonName(name: string) {
  const { actor } = await requirePerson();
  await identityAccess().updateProfileName(actor, name);
}

export async function updateOrganizationDescription(organizationId: string, description: string) {
  const { actor } = await requirePerson();
  return organizationsMembership().editOrganizationDescription(actor, organizationId, description);
}

export async function updateOrganizationProfile(organizationId: string, fields: OrganizationProfile) {
  const { actor } = await requirePerson();
  return organizationsMembership().editOrganizationProfile(actor, organizationId, fields);
}

export async function updateCommunityListing(organizationId: string, communityId: string, fields: ListingOverride) {
  const { actor } = await requirePerson();
  return organizationsMembership().setListingOverride(actor, organizationId, communityId, fields);
}

export async function requestBusinessClaim(organizationId: string, communityId: string, evidence: string) {
  const { actor } = await requirePerson();
  return organizationsMembership().requestClaim(actor, organizationId, communityId, evidence);
}

export async function withdrawBusinessClaim(claimId: string) {
  const { actor } = await requirePerson();
  return organizationsMembership().withdrawClaim(actor, claimId);
}

export async function reviewBusinessClaim(claimId: string, decision: "approved" | "rejected", note?: string) {
  const { actor } = await requirePerson();
  return organizationsMembership().reviewClaim(actor, claimId, decision, note);
}

export async function loadClaimRequests(communityId: string) {
  const { actor } = await requirePerson();
  return organizationsMembership().readClaimRequests(actor, communityId);
}

export async function stageCommunityImport(communityId: string, source: string, records: { externalId?: string; payload?: string }[], note?: string) {
  const { db, person } = await requirePerson();
  return stageImportBatch(db, person.id, communityId, source, records, note);
}

export async function linkImportedRecord(sourceRecordId: string, entityType: "organization" | "person", entityId: string) {
  const { db, person } = await requirePerson();
  return linkSourceRecord(db, person.id, sourceRecordId, entityType, entityId);
}

export async function recordEntityMerge(communityId: string, entityType: "organization" | "person", survivingId: string, mergedId: string, reason?: string) {
  const { db, person } = await requirePerson();
  return recordMerge(db, person.id, communityId, entityType, survivingId, mergedId, reason);
}

export async function loadImportBatches(communityId: string) {
  const { db, person } = await requirePerson();
  return readImportBatches(db, person.id, communityId);
}

export async function createCommunityInvitation(communityId: string, recipientId: string) {
  const { db, person } = await requirePerson();
  return invitePerson(db, person.id, communityId, recipientId);
}

export async function acceptCommunityInvitation(invitationId: string) {
  const { db, person } = await requirePerson();
  return acceptInvitation(db, person.id, invitationId);
}

export async function revokeCommunityInvitation(communityId: string, invitationId: string) {
  const { db, person } = await requirePerson();
  return revokeInvitation(db, person.id, communityId, invitationId);
}

export async function setCommunityMembership(communityId: string, targetPersonId: string, status: "active" | "suspended") {
  const { db, person } = await requirePerson();
  return changeMembership(db, person.id, communityId, targetPersonId, status);
}

export async function loadMembershipAdmin(communityId: string, after?: string) {
  const { db, person } = await requirePerson();
  return readMembershipAdmin(db, person.id, communityId, after);
}

export async function transferCommunityAdministrator(communityId: string, successorId: string) {
  const { db, person } = await requirePerson();
  return transferAdministrator(db, person.id, communityId, successorId);
}

export async function loadCommunityAudit(communityId: string) {
  const { db, person } = await requirePerson();
  return readAudit(db, person.id, communityId);
}
