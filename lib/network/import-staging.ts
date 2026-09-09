import { and, asc, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as fullSchema from "../db/schema";
import * as s from "../db/network-schema";
import { withActor } from "../db/context";
import { boundedText } from "./identity";
import { communityAdminAccess } from "./membership";

type Database = PostgresJsDatabase<typeof fullSchema>;

// Private import staging (M1). Ingested rows live only in these tables, scoped to
// the operator's community by RLS. Nothing here assigns ownership or appears in a
// member-facing projection — claiming (lib/network/claims.ts) is the only path
// from a staged record to a real affiliation.

async function requireCommunityAdmin(db: Database, actorId: string, communityId: string) {
  const [allowed] = await withActor(db, actorId, tx => tx.select({ ok: communityAdminAccess(actorId, communityId) })
    .from(s.communities).where(and(eq(s.communities.id, communityId), eq(s.communities.status, "active"))));
  if (!allowed?.ok) throw new Error("Import staging is not available to your account.");
}

export async function stageImportBatch(db: Database, actorId: string, communityId: string, source: string,
  records: { externalId?: string; payload?: string }[], note = "") {
  boundedText(communityId, 200); boundedText(source, 200);
  if (typeof note !== "string" || note.length > 2000) throw new Error("Invalid note.");
  if (!Array.isArray(records) || records.length > 5000) throw new Error("Invalid records.");
  await requireCommunityAdmin(db, actorId, communityId);
  return withActor(db, actorId, async tx => {
    const batchId = crypto.randomUUID();
    await tx.insert(s.importBatches).values({ id: batchId, communityId, source: source.trim(), note: note.trim(), createdBy: actorId });
    if (records.length) {
      await tx.insert(s.sourceRecords).values(records.map(r => ({
        id: crypto.randomUUID(), batchId,
        externalId: typeof r.externalId === "string" ? r.externalId.slice(0, 500) : "",
        payload: typeof r.payload === "string" ? r.payload.slice(0, 20000) : "" })));
    }
    return { batchId, count: records.length };
  });
}

export async function linkSourceRecord(db: Database, actorId: string, sourceRecordId: string, entityType: "organization" | "person", entityId: string) {
  boundedText(sourceRecordId, 200); boundedText(entityId, 200);
  if (entityType !== "organization" && entityType !== "person") throw new Error("Invalid entity type.");
  // RLS (collab_admins_source) confirms the actor administers the record's
  // community; the insert simply fails the policy otherwise.
  await withActor(db, actorId, async tx => {
    await tx.insert(s.externalEntityLinks)
      .values({ id: crypto.randomUUID(), sourceRecordId, entityType, entityId })
      .onConflictDoUpdate({ target: [s.externalEntityLinks.sourceRecordId, s.externalEntityLinks.entityType], set: { entityId } });
  });
}

export async function recordMerge(db: Database, actorId: string, communityId: string,
  entityType: "organization" | "person", survivingId: string, mergedId: string, reason = "") {
  boundedText(communityId, 200); boundedText(survivingId, 200); boundedText(mergedId, 200);
  if (entityType !== "organization" && entityType !== "person") throw new Error("Invalid entity type.");
  if (survivingId === mergedId) throw new Error("A record cannot be merged into itself.");
  if (typeof reason !== "string" || reason.length > 2000) throw new Error("Invalid reason.");
  await requireCommunityAdmin(db, actorId, communityId);
  await withActor(db, actorId, tx => tx.insert(s.mergeHistory).values({
    id: crypto.randomUUID(), entityType, survivingId, mergedId, communityId, reason: reason.trim(), mergedBy: actorId }));
}

export async function readImportBatches(db: Database, actorId: string, communityId: string) {
  boundedText(communityId, 200);
  await requireCommunityAdmin(db, actorId, communityId);
  return withActor(db, actorId, async tx => {
    const batches = await tx.select({ id: s.importBatches.id, source: s.importBatches.source,
      note: s.importBatches.note, createdAt: s.importBatches.createdAt }).from(s.importBatches)
      .where(eq(s.importBatches.communityId, communityId)).orderBy(asc(s.importBatches.createdAt)).limit(100);
    return { batches };
  });
}
