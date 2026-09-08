// Organizations & Membership domain module (M0 slice 2).
//
// Owns canonical organization profiles and the affiliations/grants that gate who
// may edit them. M0 migrates the organization-description edit; M1/M2 extend this
// module with claim requests, listing overrides, and roster administration.

import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as fullSchema from "../db/schema";
import { editOrganizationDescription } from "../network/repository";
import type { OrganizationsMembershipModule } from "./contracts";
import type { DemoWorld } from "./demo-world";
import { ModuleActor, ModuleError } from "./types";

type Database = PostgresJsDatabase<typeof fullSchema>;

// --- Postgres adapter -------------------------------------------------------

export class PostgresOrganizationsMembership implements OrganizationsMembershipModule {
  constructor(private readonly db: Database) {}

  // Delegates to the single UPDATE whose WHERE clause enforces an active
  // affiliation + unexpired Business Admin grant in the same statement.
  editOrganizationDescription(actor: ModuleActor, organizationId: string, description: string) {
    return editOrganizationDescription(this.db, actor.personId, organizationId, description);
  }
}

// --- Demo adapter -----------------------------------------------------------

export class DemoOrganizationsMembership implements OrganizationsMembershipModule {
  constructor(private readonly world: DemoWorld) {}

  async editOrganizationDescription(actor: ModuleActor, organizationId: string, description: string) {
    if (typeof description !== "string" || description.length > 5000) {
      throw new ModuleError("Invalid description.");
    }
    const org = this.world.organizations.get(organizationId);
    // Authority mirrors the SQL: an active affiliation AND an unrevoked,
    // unexpired business_admin grant for this organization.
    const affiliated = this.world.affiliations.some(
      a => a.personId === actor.personId && a.organizationId === organizationId && a.status === "active",
    );
    const now = Date.now();
    const granted = this.world.grants.some(
      g => g.personId === actor.personId && g.organizationId === organizationId &&
        g.role === "business_admin" && !g.revokedAt &&
        (!g.expiresAt || g.expiresAt.getTime() > now),
    );
    if (!org || !affiliated || !granted) throw new ModuleError("You cannot edit this organization.");
    org.description = description.trim();
  }
}
