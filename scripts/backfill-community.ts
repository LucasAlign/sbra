import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import * as schema from "../lib/db/schema";
import { backfillCommunity, readBackfillReview, validateBackfill } from "../lib/network/backfill";
import { parseBackfillOptions } from "./backfill-options";

async function main() {
  const options = parseBackfillOptions(process.argv.slice(2), process.env.COLLAB_BACKFILL_DATABASE_URL);
  const client = postgres(options.databaseUrl, { max: 1 });
  try {
    const db = drizzle(client, { schema });
    const report = await db.transaction(async tx => {
      // Keep the report consistent; apply is atomic across the entire rehearsal.
      await tx.execute(options.apply
        ? "SET TRANSACTION ISOLATION LEVEL SERIALIZABLE"
        : "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY");
      const [community] = await tx.select({ id: schema.communities.id }).from(schema.communities)
        .where(eq(schema.communities.id, options.communityId));
      if (!community) throw new Error("Target community does not exist.");
      const summary = options.apply ? await backfillCommunity(tx, options) : null;
      const review = await readBackfillReview(tx, options.source);
      const validation = await validateBackfill(tx);
      if (options.apply && !validation.ok) throw new Error("Backfill validation failed; all rehearsal writes were rolled back.");
      return { mode: options.apply ? "staging-apply" : "report", communityId: options.communityId,
        source: options.source, summary, ...review, validation,
        validationScope: "database-wide", readyForCutover: false };
    });
    console.log(JSON.stringify(report, null, 2));
    if (!report.validation.ok || report.review.length) process.exitCode = 2;
  } finally { await client.end(); }
}

main().catch(() => {
  // Connection errors can contain credentials or legacy data. Keep stderr safe.
  console.error("Backfill command failed. Check arguments, staging owner access, migrations, and database integrity. Usage: npm run community:backfill -- <community-id> <source> [--report|--apply-staging]");
  process.exitCode = 1;
});
