import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Lazy Postgres client. Returns null when DATABASE_URL is unset (e.g. local
// seed mode), so importing this never opens a connection until it's configured.
let db: PostgresJsDatabase<typeof schema> | null = null;

export function getDb(): PostgresJsDatabase<typeof schema> | null {
  if (!process.env.DATABASE_URL) return null;
  if (!db) {
    const client = postgres(process.env.DATABASE_URL, { prepare: false });
    db = drizzle(client, { schema });
  }
  return db;
}
