import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: path.join(__dirname),
  // Next 15 blocks dev requests from origins other than the dev server's own.
  // Replit serves the preview through a <hash>.<cluster>.replit.dev proxy. A
  // single-label `*` wildcard only matches one segment, so `*.replit.dev` fails
  // to match the multi-level `<hash>.<cluster>.replit.dev` host and enumerating
  // cluster names (janeway, picard, riker, …) is fragile — Replit keeps adding
  // new clusters, and any repl on an unlisted one gets its /_next/* JS/CSS
  // chunks blocked with a 403 (the preview loads but renders broken). Next's
  // matcher also supports a recursive `**` wildcard (same semantics as
  // images.remotePatterns) that matches any subdomain depth, so use that to
  // cover every current and future Replit cluster in one entry.
  allowedDevOrigins: [
    "**.replit.dev",
    "**.repl.co",
    "**.replit.app"
  ]
};

export default nextConfig;
