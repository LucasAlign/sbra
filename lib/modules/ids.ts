// Stable demo identifiers, kept in a leaf module so adapters and the demo world
// can share them without importing the registry (which imports the adapters).

/** The single demo person who represents the signed-in actor in seed mode. */
export const DEMO_ACTOR_ID = "demo-person";
/** The provider identity that resolves to the demo actor. */
export const DEMO_IDENTITY = { provider: "demo", subject: "demo" } as const;
