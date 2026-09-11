/** Demo credentials are available only in development against a local demo database. */
export function localDemoEnabled(env: Record<string, string | undefined> = process.env): boolean {
  if (env.NODE_ENV !== "development" || env.COLLAB_LOCAL_DEMO !== "1" || !env.COLLAB_DEMO_PASSWORD || env.COLLAB_DEMO_PASSWORD.length < 16) return false;
  try {
    const url = new URL(env.DATABASE_URL || "");
    return ["postgres:", "postgresql:"].includes(url.protocol) && ["localhost", "127.0.0.1"].includes(url.hostname) && url.pathname === "/collab_demo";
  } catch { return false; }
}
