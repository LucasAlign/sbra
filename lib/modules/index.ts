// Domain-module registry (M0).
//
// One entry point selects the adapter family by isBackendEnabled(): the Postgres
// adapters when a live backend owns the data, the demo (in-memory) adapters
// otherwise. Callers ask for a module and get the right adapter — they never
// branch on the mode themselves.

import { isBackendEnabled } from "../backend";
import { getDb } from "../db/client";
import { DemoIdentityAccess, PostgresIdentityAccess, type IdentityAccessModule } from "./identity-access";
import { DemoDiscoveryPublishing, PostgresDiscoveryPublishing } from "./discovery-publishing";
import { DemoOrganizationsMembership, PostgresOrganizationsMembership } from "./organizations-membership";
import type { DiscoveryPublishingModule, OrganizationsMembershipModule } from "./contracts";
import { createDemoWorld, type DemoWorld } from "./demo-world";
import { DEMO_ACTOR_ID, DEMO_IDENTITY } from "./ids";
import { ModuleError, type ModuleMode } from "./types";

export function moduleMode(): ModuleMode {
  return isBackendEnabled() ? "postgres" : "demo";
}

// One shared demo world backs every demo adapter so seed mode is internally
// consistent (the actor who admins a business also sees it in the directory).
// Per-process; rebuilt on reset.
let demoWorld: DemoWorld | null = null;
function world(): DemoWorld {
  if (!demoWorld) demoWorld = createDemoWorld();
  return demoWorld;
}

let demoIdentityAccess: DemoIdentityAccess | null = null;
function getDemoIdentityAccess(): DemoIdentityAccess {
  if (!demoIdentityAccess) {
    demoIdentityAccess = new DemoIdentityAccess([
      { id: DEMO_ACTOR_ID, name: "Collab member", identity: DEMO_IDENTITY },
    ]);
  }
  return demoIdentityAccess;
}

/** Reset demo-adapter state. Test-only. */
export function resetDemoModules(): void {
  demoIdentityAccess = null;
  demoWorld = null;
}

function db() {
  const handle = getDb();
  if (!handle) throw new ModuleError("The community service is not configured.");
  return handle;
}

export function identityAccess(): IdentityAccessModule {
  return moduleMode() === "demo" ? getDemoIdentityAccess() : new PostgresIdentityAccess(db());
}

export function discoveryPublishing(): DiscoveryPublishingModule {
  return moduleMode() === "demo" ? new DemoDiscoveryPublishing(world()) : new PostgresDiscoveryPublishing(db());
}

export function organizationsMembership(): OrganizationsMembershipModule {
  return moduleMode() === "demo" ? new DemoOrganizationsMembership(world()) : new PostgresOrganizationsMembership(db());
}

export { ModuleError } from "./types";
export { DEMO_ACTOR_ID } from "./ids";
export type { ModuleActor, PrivateProfile, PublicProfile, ModuleMode } from "./types";
export type { IdentityAccessModule, ProviderIdentity } from "./identity-access";
export type { DiscoveryPublishingModule, OrganizationsMembershipModule,
  OrganizationProfile, ListingOverride, ClaimReview, DirectoryListing,
  Opportunity, OpportunityResponse, OpportunityInput, OpportunityKind } from "./contracts";
