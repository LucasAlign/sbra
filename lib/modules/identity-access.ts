// Identity & Access domain module (M0 — first module implemented end-to-end).
//
// Owns: resolving the signed-in person from their provider identity, and the
// person's own profile. Both a demo (in-memory) and a Postgres (Drizzle) adapter
// implement one interface, so isBackendEnabled() selects the adapter — not a
// separate UI or a separate call path. This is the seam the rest of the plan
// (M1–M11) extends module by module.

import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as fullSchema from "../db/schema";
import * as s from "../db/network-schema";
import { boundedText } from "../network/identity";
import { resolvePerson } from "../network/repository";
import { ModuleActor, ModuleError, PrivateProfile } from "./types";

type Database = PostgresJsDatabase<typeof fullSchema>;

/** Stable provider identity (never a roster email) used to find/create a person. */
export type ProviderIdentity = { provider: string; subject: string };

export interface IdentityAccessModule {
  /**
   * Resolve the person behind a provider identity, creating them on first sight.
   * The returned actor is the trusted subject for every later authorization check.
   */
  resolveActor(identity: ProviderIdentity, name: string): Promise<ModuleActor>;
  /** The actor's own profile (private projection). */
  getMyProfile(actor: ModuleActor): Promise<PrivateProfile>;
  /** The actor edits their display name; returns the updated private profile. */
  updateProfileName(actor: ModuleActor, name: string): Promise<PrivateProfile>;
}

// --- Postgres adapter -------------------------------------------------------

export class PostgresIdentityAccess implements IdentityAccessModule {
  constructor(private readonly db: Database) {}

  async resolveActor(identity: ProviderIdentity, name: string): Promise<ModuleActor> {
    // Delegates to the single first-sight/advisory-lock implementation covered
    // by the network integration test, projecting it to the module's actor type.
    const person = await resolvePerson(this.db, identity, name);
    return { personId: person.id, name: person.name };
  }

  async getMyProfile(actor: ModuleActor): Promise<PrivateProfile> {
    const [row] = await this.db.select({ id: s.people.id, name: s.people.name })
      .from(s.people).where(eq(s.people.id, actor.personId));
    if (!row) throw new ModuleError("Your profile is not available. Please sign in again.");
    return row;
  }

  async updateProfileName(actor: ModuleActor, name: string): Promise<PrivateProfile> {
    const value = boundedText(name, 200);
    const [row] = await this.db.update(s.people).set({ name: value })
      .where(eq(s.people.id, actor.personId)).returning({ id: s.people.id, name: s.people.name });
    if (!row) throw new ModuleError("Your profile is not available. Please sign in again.");
    return row;
  }
}

// --- Demo adapter -----------------------------------------------------------

/**
 * In-memory people store for seed mode and unit tests. Mirrors the Postgres
 * adapter's behavior (first-sight creation keyed by provider identity, bounded
 * name edits) without a database. State is per-process and resettable.
 */
export class DemoIdentityAccess implements IdentityAccessModule {
  private readonly people = new Map<string, { id: string; name: string }>();
  private readonly byIdentity = new Map<string, string>();

  constructor(seed: { id: string; name: string; identity?: ProviderIdentity }[] = []) {
    for (const entry of seed) {
      this.people.set(entry.id, { id: entry.id, name: entry.name });
      if (entry.identity) this.byIdentity.set(identityKey(entry.identity), entry.id);
    }
  }

  async resolveActor(identity: ProviderIdentity, name: string): Promise<ModuleActor> {
    const key = identityKey(identity);
    const existingId = this.byIdentity.get(key);
    if (existingId) {
      const person = this.people.get(existingId)!;
      return { personId: person.id, name: person.name };
    }
    const created = { id: crypto.randomUUID(), name: name.slice(0, 200) || "Collab member" };
    this.people.set(created.id, created);
    this.byIdentity.set(key, created.id);
    return { personId: created.id, name: created.name };
  }

  async getMyProfile(actor: ModuleActor): Promise<PrivateProfile> {
    const person = this.people.get(actor.personId);
    if (!person) throw new ModuleError("Your profile is not available. Please sign in again.");
    return { id: person.id, name: person.name };
  }

  async updateProfileName(actor: ModuleActor, name: string): Promise<PrivateProfile> {
    const value = boundedText(name, 200);
    const person = this.people.get(actor.personId);
    if (!person) throw new ModuleError("Your profile is not available. Please sign in again.");
    person.name = value;
    return { id: person.id, name: person.name };
  }
}

function identityKey(identity: ProviderIdentity): string {
  return `${identity.provider}:${identity.subject}`;
}
