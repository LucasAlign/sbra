// Domain-module registry (M0).
//
// One entry point selects the adapter family by isBackendEnabled(): the Postgres
// adapters when a live backend owns the data, the demo (in-memory) adapters
// otherwise. Callers ask for a module and get the right adapter — they never
// branch on the mode themselves.

import { isBackendEnabled } from "../backend";
import { getDb } from "../db/client";
import { DemoIdentityAccess, PostgresIdentityAccess, type IdentityAccessModule } from "./identity-access";
import { ModuleError, type ModuleMode } from "./types";

export function moduleMode(): ModuleMode {
  return isBackendEnabled() ? "postgres" : "demo";
}

// A single demo person represents the signed-in actor in seed mode so the
// profile-name edit round-trips without a database. Seeded here; per-process.
export const DEMO_ACTOR_ID = "demo-person";
const DEMO_IDENTITY = { provider: "demo", subject: "demo" };

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
}

export function identityAccess(): IdentityAccessModule {
  if (moduleMode() === "demo") return getDemoIdentityAccess();
  const db = getDb();
  if (!db) throw new ModuleError("The community service is not configured.");
  return new PostgresIdentityAccess(db);
}

export { ModuleError } from "./types";
export type { ModuleActor, PrivateProfile, PublicProfile, ModuleMode } from "./types";
export type { IdentityAccessModule, ProviderIdentity } from "./identity-access";
