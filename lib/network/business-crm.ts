import { and, eq, isNull, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { normalizeCrmWorkspace, validateCrmWorkspace, type CrmWorkspace } from "@/lib/crm";
import * as s from "@/lib/db/network-schema";
import { withActor } from "@/lib/db/context";
import type * as fullSchema from "@/lib/db/schema";

type Database = PostgresJsDatabase<typeof fullSchema>;

async function managedBusiness(tx: Parameters<Parameters<Database["transaction"]>[0]>[0], personId: string) {
  const rows = await tx.selectDistinct({ id: s.organizations.id, name: s.organizations.name })
    .from(s.organizations)
    .innerJoin(s.organizationAffiliations, eq(s.organizationAffiliations.organizationId, s.organizations.id))
    .innerJoin(s.roleGrants, eq(s.roleGrants.organizationId, s.organizations.id))
    .where(and(
      eq(s.organizationAffiliations.personId, personId),
      eq(s.organizationAffiliations.status, "active"),
      eq(s.roleGrants.personId, personId),
      eq(s.roleGrants.role, "business_admin"),
      isNull(s.roleGrants.revokedAt),
      sql`(${s.roleGrants.expiresAt} is null or ${s.roleGrants.expiresAt} > now())`,
      eq(s.organizations.kind, "business")
    )).limit(2);
  if (rows.length === 0) throw new Error("Your login is not connected to a member business.");
  if (rows.length > 1) throw new Error("This login manages more than one business. Contact support to choose its CRM business.");
  return rows[0];
}

export async function readBusinessCrm(db: Database, personId: string) {
  return withActor(db, personId, async tx => {
    const business = await managedBusiness(tx, personId);
    const [record] = await tx.select().from(s.businessCrmWorkspaces)
      .where(eq(s.businessCrmWorkspaces.organizationId, business.id)).limit(1);
    let parsed: Partial<CrmWorkspace> | undefined;
    try { parsed = record ? JSON.parse(record.data) as Partial<CrmWorkspace> : undefined; } catch { parsed = undefined; }
    return { business, revision: record?.revision ?? 0, workspace: normalizeCrmWorkspace(parsed, business.id) };
  });
}

export async function writeBusinessCrm(db: Database, personId: string, workspace: CrmWorkspace, expectedRevision: number) {
  return withActor(db, personId, async tx => {
    const business = await managedBusiness(tx, personId);
    if (workspace.businessId !== business.id) throw new Error("CRM business does not match this login.");
    const data = validateCrmWorkspace(workspace);
    if (expectedRevision === 0) {
      const inserted = await tx.insert(s.businessCrmWorkspaces).values({ organizationId: business.id, data })
        .onConflictDoNothing().returning({ revision: s.businessCrmWorkspaces.revision });
      if (inserted[0]) return inserted[0];
    } else {
      const updated = await tx.update(s.businessCrmWorkspaces).set({ data, revision: expectedRevision + 1, updatedAt: new Date() })
        .where(and(eq(s.businessCrmWorkspaces.organizationId, business.id), eq(s.businessCrmWorkspaces.revision, expectedRevision)))
        .returning({ revision: s.businessCrmWorkspaces.revision });
      if (updated[0]) return updated[0];
    }
    throw new Error("CRM_CONFLICT");
  });
}
