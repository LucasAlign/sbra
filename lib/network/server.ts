import { auth } from "@/auth";
import { getDb } from "@/lib/db/client";
import { providerIdentity } from "./identity";
import { identityAccess } from "@/lib/modules";
import { localDemoEnabled } from "@/lib/local-demo";

// Resolves the signed-in actor through the Identity & Access module, then returns
// the db handle for actions not yet migrated behind their own module (M1+).
export async function requirePerson() {
  const session = await auth();
  if (!session?.user) throw new Error("Sign in to continue.");
  const sessionId = session.user.id || "";
  const identity = localDemoEnabled() && /^demo:(admin|member)$/.test(sessionId)
    ? { provider: "demo", subject: sessionId.slice(5) } : providerIdentity(session.user.id);
  const db = getDb();
  if (!db) throw new Error("The community service is not configured.");
  const actor = await identityAccess().resolveActor(identity, session.user.name || "Collab member");
  return { db, person: { id: actor.personId, name: actor.name }, actor };
}
