// Domain-module response contracts (M0).
//
// Every module returns purpose-built response types, never a raw persistence
// row cast to a UI shape. Two families exist so audience is encoded in the type
// system, not left to reviewer discipline:
//
//   Public*   — safe to project to any authorized viewer of a community.
//   Private*  — restricted to the subject (the owner) or an authorized admin.
//
// Today several public/private pairs carry the same fields; they are kept
// distinct on purpose so that when a field with an audience (email, settings,
// internal notes) lands, it is added to exactly one side and the compiler finds
// every call site that must change.

/** The signed-in person, resolved server-side from their provider identity. */
export type ModuleActor = { personId: string; name: string };

/** A person as any authorized community member may see them. */
export type PublicProfile = { id: string; name: string };

/** A person as they see themselves (superset of the public projection). */
export type PrivateProfile = { id: string; name: string };

/** Errors a module raises for callers to surface to the actor. */
export class ModuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModuleError";
  }
}

/** Which adapter family backs the modules for this process. */
export type ModuleMode = "demo" | "postgres";
