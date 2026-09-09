// Organizations & Membership domain module.
//
// Owns canonical organization profiles, the affiliations/grants that gate who may
// edit them, community listing overrides, and the verified-claim workflow
// (operator vouch). Demo and Postgres adapters implement one interface; the
// Postgres adapter delegates to the transactional, RLS-backed logic in
// lib/network/{repository,claims}.ts.

import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as fullSchema from "../db/schema";
import { editOrganizationDescription, editOrganizationProfile, setListingOverride } from "../network/repository";
import { readClaimRequests, requestClaim, reviewClaim, withdrawClaim } from "../network/claims";
import type { ListingOverride, OrganizationProfile, OrganizationsMembershipModule } from "./contracts";
import type { DemoWorld } from "./demo-world";
import { ModuleActor, ModuleError } from "./types";

type Database = PostgresJsDatabase<typeof fullSchema>;
const ORGANIZATION_KINDS = ["business", "chamber", "association", "municipality", "other"];

// --- Postgres adapter -------------------------------------------------------

export class PostgresOrganizationsMembership implements OrganizationsMembershipModule {
  constructor(private readonly db: Database) {}

  editOrganizationDescription(actor: ModuleActor, organizationId: string, description: string) {
    return editOrganizationDescription(this.db, actor.personId, organizationId, description);
  }
  editOrganizationProfile(actor: ModuleActor, organizationId: string, fields: OrganizationProfile) {
    return editOrganizationProfile(this.db, actor.personId, organizationId, fields);
  }
  setListingOverride(actor: ModuleActor, organizationId: string, communityId: string, fields: ListingOverride) {
    return setListingOverride(this.db, actor.personId, organizationId, communityId, fields);
  }
  requestClaim(actor: ModuleActor, organizationId: string, communityId: string, evidence: string) {
    return requestClaim(this.db, actor.personId, organizationId, communityId, evidence);
  }
  withdrawClaim(actor: ModuleActor, claimId: string) {
    return withdrawClaim(this.db, actor.personId, claimId);
  }
  reviewClaim(actor: ModuleActor, claimId: string, decision: "approved" | "rejected", note?: string) {
    return reviewClaim(this.db, actor.personId, claimId, decision, note);
  }
  readClaimRequests(actor: ModuleActor, communityId: string) {
    return readClaimRequests(this.db, actor.personId, communityId);
  }
}

// --- Demo adapter -----------------------------------------------------------

export class DemoOrganizationsMembership implements OrganizationsMembershipModule {
  constructor(private readonly world: DemoWorld) {}

  private canAdminOrg(personId: string, organizationId: string): boolean {
    const now = Date.now();
    const affiliated = this.world.affiliations.some(
      a => a.personId === personId && a.organizationId === organizationId && a.status === "active");
    const granted = this.world.grants.some(
      g => g.personId === personId && g.organizationId === organizationId &&
        g.role === "business_admin" && !g.revokedAt && (!g.expiresAt || g.expiresAt.getTime() > now));
    return affiliated && granted;
  }

  private isCommunityAdmin(personId: string, communityId: string): boolean {
    const now = Date.now();
    const member = this.world.personMemberships.some(
      m => m.personId === personId && m.communityId === communityId && m.status === "active");
    const granted = this.world.grants.some(
      g => g.personId === personId && g.communityId === communityId &&
        g.role === "community_admin" && !g.revokedAt && (!g.expiresAt || g.expiresAt.getTime() > now));
    return member && granted;
  }

  async editOrganizationDescription(actor: ModuleActor, organizationId: string, description: string) {
    return this.editOrganizationProfile(actor, organizationId, { description });
  }

  async editOrganizationProfile(actor: ModuleActor, organizationId: string, fields: OrganizationProfile) {
    const org = this.world.organizations.get(organizationId);
    if (!org || !this.canAdminOrg(actor.personId, organizationId)) throw new ModuleError("You cannot edit this organization.");
    if (fields.name !== undefined) {
      if (!fields.name.trim() || fields.name.length > 200) throw new ModuleError("Invalid name.");
      org.name = fields.name.trim();
    }
    if (fields.kind !== undefined) {
      if (!ORGANIZATION_KINDS.includes(fields.kind)) throw new ModuleError("Invalid organization kind.");
      org.kind = fields.kind;
    }
    const optional: [keyof OrganizationProfile, "description" | "website" | "locations" | "serviceAreas", number][] = [
      ["description", "description", 5000], ["website", "website", 500],
      ["locations", "locations", 2000], ["serviceAreas", "serviceAreas", 2000]];
    for (const [key, target, max] of optional) {
      const value = fields[key];
      if (value === undefined) continue;
      if (typeof value !== "string" || value.length > max) throw new ModuleError(`Invalid ${key}.`);
      org[target] = value.trim();
    }
  }

  async setListingOverride(actor: ModuleActor, organizationId: string, communityId: string, fields: ListingOverride) {
    const headline = fields.headline ?? "";
    const localOffer = fields.localOffer ?? "";
    const visibility = fields.visibility ?? "listed";
    if (headline.length > 200) throw new ModuleError("Invalid headline.");
    if (localOffer.length > 2000) throw new ModuleError("Invalid offer.");
    if (visibility !== "listed" && visibility !== "hidden") throw new ModuleError("Invalid visibility.");
    const listed = this.world.orgMemberships.some(
      m => m.organizationId === organizationId && m.communityId === communityId && m.status === "active");
    if (!listed || !this.canAdminOrg(actor.personId, organizationId)) {
      throw new ModuleError("You cannot set a listing for this organization here.");
    }
    const existing = this.world.listingOverrides.find(o => o.organizationId === organizationId && o.communityId === communityId);
    if (existing) Object.assign(existing, { headline: headline.trim(), localOffer: localOffer.trim(), visibility });
    else this.world.listingOverrides.push({ organizationId, communityId, headline: headline.trim(), localOffer: localOffer.trim(), visibility });
  }

  async requestClaim(actor: ModuleActor, organizationId: string, communityId: string, evidence: string) {
    if (typeof evidence !== "string" || evidence.length > 2000) throw new ModuleError("Add a short note describing your connection to this business.");
    const member = this.world.personMemberships.some(
      m => m.personId === actor.personId && m.communityId === communityId && m.status === "active");
    const listed = this.world.orgMemberships.some(
      m => m.organizationId === organizationId && m.communityId === communityId && m.status === "active");
    if (!member || !listed) throw new ModuleError("This business is not listed in this community.");
    const pending = this.world.claims.find(
      c => c.personId === actor.personId && c.organizationId === organizationId && c.communityId === communityId && c.status === "pending");
    if (pending) return { id: pending.id };
    const claim = { id: crypto.randomUUID(), personId: actor.personId, organizationId, communityId,
      evidence: evidence.trim(), status: "pending" as const, createdAt: new Date() };
    this.world.claims.push(claim);
    return { id: claim.id };
  }

  async withdrawClaim(actor: ModuleActor, claimId: string) {
    const claim = this.world.claims.find(c => c.id === claimId && c.personId === actor.personId && c.status === "pending");
    if (!claim) throw new ModuleError("Claim unavailable.");
    claim.status = "withdrawn";
  }

  async reviewClaim(actor: ModuleActor, claimId: string, decision: "approved" | "rejected", _note?: string) {
    const claim = this.world.claims.find(c => c.id === claimId && c.status === "pending");
    if (!claim || !this.isCommunityAdmin(actor.personId, claim.communityId)) throw new ModuleError("This claim is not available to your account.");
    if (decision === "approved") {
      if (claim.personId === actor.personId) throw new ModuleError("Another administrator must approve your own claim.");
      const affiliation = this.world.affiliations.find(a => a.personId === claim.personId && a.organizationId === claim.organizationId);
      if (affiliation) affiliation.status = "active";
      else this.world.affiliations.push({ personId: claim.personId, organizationId: claim.organizationId, status: "active" });
      if (!this.world.grants.some(g => g.personId === claim.personId && g.organizationId === claim.organizationId && g.role === "business_admin" && !g.revokedAt)) {
        this.world.grants.push({ personId: claim.personId, organizationId: claim.organizationId, role: "business_admin" });
      }
    }
    claim.status = decision;
  }

  async readClaimRequests(actor: ModuleActor, communityId: string) {
    if (!this.isCommunityAdmin(actor.personId, communityId)) throw new ModuleError("Claim review is not available to your account.");
    const claims = this.world.claims
      .filter(c => c.communityId === communityId && c.status === "pending")
      .map(c => ({ id: c.id, personId: c.personId, personName: this.world.people.get(c.personId)?.name ?? "",
        organizationId: c.organizationId, organizationName: this.world.organizations.get(c.organizationId)?.name ?? "",
        evidence: c.evidence, createdAt: c.createdAt }));
    return { claims };
  }
}
