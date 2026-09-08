import { auth } from "@/auth";
import { getDb } from "@/lib/db/client";
import { providerIdentity } from "./identity";
import { resolvePerson } from "./repository";

export async function requirePerson() {
  const session = await auth();
  if (!session?.user) throw new Error("Sign in to continue.");
  const identity = providerIdentity(session.user.id);
  const db = getDb();
  if (!db) throw new Error("The community service is not configured.");
  const person = await resolvePerson(db, identity, session.user.name || "Collab member");
  return { db, person };
}
