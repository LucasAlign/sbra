// Persistence seam for the core app collections that get mutated in-app —
// admin console edits (roster, tiers, roles, moderation, support, broadcast)
// plus member actions (posts, comments, reactions, support requests).
//
// Like `lib/tool-storage.ts`, this is the single place these collections talk to
// for local persistence. Today (seed-first, decision #6) they live in the
// browser's `localStorage`, private to each viewer's device. When the real
// backend is enabled (NEXT_PUBLIC_BACKEND_ENABLED=1) Postgres is the source of
// truth and the caller disables this layer, so the two never fight.
//
// Reads are synchronous so the app can hydrate its `useState` initializers from
// them on first render (no seed→stored flash). Every read and write is guarded:
// storage can be unavailable (SSR, private mode) or throw, and stored JSON can
// be corrupt — in every failure case we fall back to the seed the caller passes.

// Community-wide collections are shared across organizations (one feed, one
// support queue), so they use flat keys.
export const APP_KEYS = {
  posts: "sbra.app.posts",
  comments: "sbra.app.comments",
  reactions: "sbra.app.reactions",
  requests: "sbra.app.requests"
} as const;

// The roster (people + businesses) differs per organization — the SBRA network
// and the Berks Latino Chamber have separate directories — so it is keyed by the
// active organization id.
export function membersKey(orgId: string): string {
  return `sbra.app.members.${orgId}`;
}
export function businessesKey(orgId: string): string {
  return `sbra.app.businesses.${orgId}`;
}

// Read a stored array, or `fallback` when nothing valid is stored. Anything that
// isn't a JSON array (missing, corrupt, wrong shape) yields the fallback.
export function loadCollection<T>(key: string, fallback: T[]): T[] {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : fallback;
  } catch {
    return fallback;
  }
}

// Persist an array. Guarded so a full/blocked store never breaks the app (it
// just stops persisting for the session).
export function saveCollection<T>(key: string, value: T[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage full or blocked — the app still works in-session
  }
}

// Every key this module can own for a given organization. Used by the reset
// affordance to wipe locally persisted edits and fall back to seed data.
export function clearAppData(orgIds: string[]): void {
  if (typeof window === "undefined") return;
  const keys = [
    ...Object.values(APP_KEYS),
    ...orgIds.flatMap((orgId) => [membersKey(orgId), businessesKey(orgId)])
  ];
  for (const key of keys) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // ignore — best effort
    }
  }
}
