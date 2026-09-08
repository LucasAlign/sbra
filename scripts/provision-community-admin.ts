import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { and, eq } from "drizzle-orm";
import * as s from "../lib/db/network-schema";

async function main() {
  const [communityId, personId, verification] = process.argv.slice(2);
  if (!communityId || !personId || verification !== "--operator-verified" || process.argv.length !== 5) {
    throw new Error("Usage: npm run community:provision -- <community-id> <person-id> --operator-verified. Verify the operator and recipient identity before running.");
  }
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
  const client = postgres(process.env.DATABASE_URL, { max: 1 });
  try {
    const db = drizzle(client);
    await db.transaction(async tx => {
      const [community] = await tx.select().from(s.communities).where(eq(s.communities.id, communityId)).for("update");
      if (!community || community.status !== "draft") throw new Error("Only a draft community can be initially provisioned.");
      const [identity] = await tx.select().from(s.personIdentities).where(eq(s.personIdentities.personId, personId)).limit(1);
      if (!identity) throw new Error("The recipient must first sign in to Collab.");
      const grants = await tx.select().from(s.roleGrants).where(and(eq(s.roleGrants.communityId, communityId), eq(s.roleGrants.role, "community_admin")));
      if (grants.length) throw new Error("An administrator has already been appointed. Use a separate transfer workflow.");
      await tx.insert(s.personCommunityMemberships).values({ personId, communityId, status: "active" })
        .onConflictDoUpdate({ target: [s.personCommunityMemberships.personId, s.personCommunityMemberships.communityId], set: { status: "active" } });
      await tx.insert(s.roleGrants).values({ id: crypto.randomUUID(), personId, communityId, role: "community_admin", grantedBy: personId });
      await tx.update(s.communities).set({ status: "active" }).where(eq(s.communities.id, communityId));
      // Null actor identifies controlled operator provisioning, not a member action.
      await tx.insert(s.membershipAudit).values({ id: crypto.randomUUID(), communityId, targetId: personId, actorId: null, action: "community.provisioned" });
      console.log(`Provisioned ${community.name} for account ${personId}.`);
    });
  } finally { await client.end(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
