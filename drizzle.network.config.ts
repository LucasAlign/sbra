import type { Config } from "drizzle-kit";

// Additive foundation only: never creates or rewrites the legacy prototype tables.
export default {
  schema: "./lib/db/network-schema.ts",
  out: "./drizzle/network",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
} satisfies Config;
