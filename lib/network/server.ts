import { auth } from "@/auth";
import { getDb } from "@/lib/db/client";
import { providerIdentity } from "./identity";
import { identityAccess } from "@/lib/modules";

// Resolves the signed-in actor through the Identity & Access module, then returns
// the db handle for actions not yet migrated behind their own module (M1+).
export async function requirePerson() {
  const session = await auth();
  if (!session?.user) throw new Error("Sign in to continue.");
  const identity = providerIdentity(session.user.id);
  const db = getDb();
  if (!db) throw new Error("The community service is not configured.");
  const actor = await identityAccess().resolveActor(identity, session.user.name || "Collab member");
  return { db, person: { id: actor.personId, name: actor.name }, actor };
}
