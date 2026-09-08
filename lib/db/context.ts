import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as fullSchema from "./schema";

type Database = PostgresJsDatabase<typeof fullSchema>;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/**
 * Run `work` inside a transaction that carries the current actor for row-level
 * security. The actor is set with set_config(..., true) — transaction-local, so
 * it is safe on a shared connection pool and can never leak to another request
 * that reuses the connection. RLS policies read it via
 * current_setting('collab.person_id', true).
 *
 * Every runtime data path whose table has RLS policies keyed to the actor must
 * run through here; the transaction both scopes the context and groups the reads
 * and writes that depend on it.
 */
export function withActor<T>(db: Database, personId: string, work: (tx: Transaction) => Promise<T>): Promise<T> {
  if (!personId) throw new Error("An actor is required for a scoped transaction.");
  return db.transaction(async tx => {
    await tx.execute(sql`select set_config('collab.person_id', ${personId}, true)`);
    return work(tx);
  });
}
