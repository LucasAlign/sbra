// Discovery & Publishing domain module (M0 slice 2).
//
// Owns the authorized community directory: which organizations a member may see,
// and the public projection of each (never private fields). Demo and Postgres
// adapters implement one interface behind the registry.

import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as fullSchema from "../db/schema";
import { readDirectory } from "../network/repository";
import type { DiscoveryPublishingModule } from "./contracts";
import type { DemoWorld } from "./demo-world";
import { ModuleActor, ModuleError } from "./types";

type Database = PostgresJsDatabase<typeof fullSchema>;
const PAGE = 25;

// --- Postgres adapter -------------------------------------------------------

export class PostgresDiscoveryPublishing implements DiscoveryPublishingModule {
  constructor(private readonly db: Database) {}

  // Delegates to the keyset-paginated, membership-scoped query covered by the
  // network integration test; the projection there is already public-only.
  readDirectory(actor: ModuleActor, communityId: string, after?: string) {
    return readDirectory(this.db, actor.personId, communityId, after);
  }
}

// --- Demo adapter -----------------------------------------------------------

export class DemoDiscoveryPublishing implements DiscoveryPublishingModule {
  constructor(private readonly world: DemoWorld) {}

  async readDirectory(actor: ModuleActor, communityId: string, after?: string) {
    // Same gate as the SQL: the community must be active and the actor an active
    // member of it, or the directory is not available to them.
    const community = this.world.communities.get(communityId);
    const membership = this.world.personMemberships.find(
      m => m.personId === actor.personId && m.communityId === communityId,
    );
    if (community?.status !== "active" || membership?.status !== "active") {
      throw new ModuleError("This community is not available to your account.");
    }
    const orgIds = this.world.orgMemberships
      .filter(m => m.communityId === communityId && m.status === "active")
      .map(m => m.organizationId)
      .filter(id => (after ? id > after : true))
      .sort();
    // Fetch one extra row to know whether another page exists.
    const page = orgIds.slice(0, PAGE + 1).map(id => {
      const org = this.world.organizations.get(id)!;
      // Public projection only — never spread the stored row.
      return { id: org.id, name: org.name, description: org.description, kind: org.kind };
    });
    return {
      organizations: page.slice(0, PAGE),
      nextCursor: page.length > PAGE ? page[PAGE - 1].id : null,
    };
  }
}
