export function parseBackfillOptions(args: string[], databaseUrl?: string) {
  const [communityId, source, mode = "--report"] = args;
  if (!communityId?.trim() || !source?.trim() || args.length > 3 || !["--report", "--apply-staging"].includes(mode)) {
    throw new Error("Usage: npm run community:backfill -- <community-id> <source> [--report|--apply-staging]");
  }
  if (!databaseUrl) throw new Error("COLLAB_BACKFILL_DATABASE_URL is required (use the staging owner connection).");
  const target = new URL(databaseUrl);
  if (!["postgres:", "postgresql:"].includes(target.protocol)) throw new Error("Expected a Postgres connection URL.");
  if (mode === "--apply-staging" && !["/collab_test", "/collab_staging"].includes(target.pathname)) {
    throw new Error("Apply is limited to databases named collab_test or collab_staging. Rehearse on a staging copy.");
  }
  return { communityId: communityId.trim(), source: source.trim(), apply: mode === "--apply-staging", databaseUrl };
}
