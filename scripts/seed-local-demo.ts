import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import * as s from "../lib/db/network-schema";

async function main() {
  const raw = process.env.COLLAB_DEMO_DATABASE_URL;
  if (!raw) throw new Error("Set COLLAB_DEMO_DATABASE_URL to an owner connection for local collab_demo.");
  const url = new URL(raw);
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !["localhost", "127.0.0.1"].includes(url.hostname) || url.pathname !== "/collab_demo") throw new Error("Demo seeding requires a local database named collab_demo.");
  const client = postgres(raw, { max: 1 });
  try {
    const db = drizzle(client);
    await migrate(db, { migrationsFolder: "./drizzle/network" });
    await db.transaction(async tx => {
      await tx.insert(s.networks).values({ id: "local-demo-network", slug: "local-demo", name: "Collab Demo Network" }).onConflictDoNothing();
      await tx.insert(s.organizations).values([
        { id: "local-demo-operator", name: "Demo Chamber", kind: "chamber" },
        { id: "local-demo-business", name: "River Street Studio", kind: "business", description: "A fictional design studio for exploring Collab.", locations: "Reading, PA" },
        { id: "local-demo-cafe", name: "Market Square Cafe", kind: "business", description: "A fictional neighborhood cafe." },
      ]).onConflictDoNothing();
      await tx.insert(s.communities).values({ id: "local-demo-community", networkId: "local-demo-network", operatorId: "local-demo-operator", slug: "local-demo", name: "Demo Chamber Community", shortName: "Demo", kind: "organizational", status: "active" }).onConflictDoNothing();
      for (const role of ["admin", "member"]) {
        const personId = `local-demo-${role}`;
        await tx.insert(s.people).values({ id: personId, name: role === "admin" ? "Demo Admin" : "Demo Member" }).onConflictDoNothing();
        await tx.insert(s.personIdentities).values({ provider: "demo", subject: role, personId }).onConflictDoNothing();
        await tx.insert(s.personCommunityMemberships).values({ personId, communityId: "local-demo-community", status: "active" }).onConflictDoNothing();
      }
      await tx.insert(s.roleGrants).values({ id: "local-demo-admin-grant", personId: "local-demo-admin", communityId: "local-demo-community", role: "community_admin", grantedBy: "local-demo-admin" }).onConflictDoNothing();
      await tx.insert(s.organizationAffiliations).values({ personId: "local-demo-member", organizationId: "local-demo-business", status: "active" }).onConflictDoNothing();
      await tx.insert(s.roleGrants).values({ id: "local-demo-business-grant", personId: "local-demo-member", organizationId: "local-demo-business", role: "business_admin", grantedBy: "local-demo-admin" }).onConflictDoNothing();
      for (const organizationId of ["local-demo-business", "local-demo-cafe"]) await tx.insert(s.organizationCommunityMemberships).values({ organizationId, communityId: "local-demo-community", status: "active" }).onConflictDoNothing();
      await tx.insert(s.opportunities).values({ id: "local-demo-opportunity", communityId: "local-demo-community", authorId: "local-demo-admin", kind: "need", title: "Looking for a local event photographer", detail: "Help capture our next community gathering.", visibility: "community" }).onConflictDoNothing();
      await tx.insert(s.communityEvents).values({ id: "local-demo-event", organizerId: "local-demo-admin", title: "Meet your local business community", location: "Demo Chamber meeting room", startsAt: new Date(Date.now() + 7 * 86400000), timezone: "America/New_York", capacity: 25 }).onConflictDoNothing();
      await tx.insert(s.eventPublications).values({ eventId: "local-demo-event", communityId: "local-demo-community", publishedBy: "local-demo-admin" }).onConflictDoNothing();
      await tx.insert(s.announcements).values({ id: "local-demo-announcement", authorId: "local-demo-admin", title: "Welcome to the Collab demo", body: "Explore events, introductions, and community requests. Platform membership is free for members; the organization pays for the platform." }).onConflictDoNothing();
      await tx.insert(s.announcementPublications).values({ announcementId: "local-demo-announcement", communityId: "local-demo-community", publishedBy: "local-demo-admin" }).onConflictDoNothing();
    });
    console.log("Demo seeded. Re-running preserves existing demo edits. Admin: local-demo-admin; member: local-demo-member.");
  } finally { await client.end(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Demo seed failed."); process.exitCode = 1; });
