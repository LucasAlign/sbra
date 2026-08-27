// Client-safe flag: is the real backend (Postgres + server actions) active?
// Set NEXT_PUBLIC_BACKEND_ENABLED=1 in the environment (e.g. on Replit, once
// DATABASE_URL is provisioned) to switch the app out of seed mode.
export function isBackendEnabled(): boolean {
  return process.env.NEXT_PUBLIC_BACKEND_ENABLED === "1";
}
