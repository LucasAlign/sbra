import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { communities, communityRegions, networks, organizations, regions } from "../lib/db/network-schema";
import { communityCatalog, communityRegionCatalog, networkCatalog, operatorCatalog, regionCatalog } from "../lib/network/catalog";

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const client = postgres(process.env.DATABASE_URL, { max: 1 });
  try {
    const db = drizzle(client);
    await db.transaction(async tx => {
      await tx.insert(networks).values(networkCatalog).onConflictDoNothing();
      await tx.insert(organizations).values(operatorCatalog).onConflictDoNothing();
      await tx.insert(regions).values(regionCatalog).onConflictDoNothing();
      // Draft until an operator is verified. This command grants no access and imports no people.
      await tx.insert(communities).values(communityCatalog.map(c => ({ ...c, status: "draft" }))).onConflictDoNothing();
      await tx.insert(communityRegions).values(communityRegionCatalog).onConflictDoNothing();
    });
    console.log("Network catalog provisioned. Existing records and permissions were preserved.");
  } finally {
    await client.end();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
