import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: path.join(__dirname),
  // Next 15 blocks dev requests from origins other than the dev server's own.
  // Replit serves the preview through a <hash>.<cluster>.replit.dev proxy, and
  // Next's wildcard matches a single label — so we must allow the cluster-level
  // subdomain (e.g. *.janeway.replit.dev), not just *.replit.dev, or the preview
  // gets its /_next/* JS/CSS chunks blocked.
  allowedDevOrigins: [
    "*.replit.dev",
    "*.janeway.replit.dev",
    "*.picard.replit.dev",
    "*.riker.replit.dev",
    "*.kirk.replit.dev",
    "*.worf.replit.dev",
    "*.spock.replit.dev",
    "*.sisko.replit.dev",
    "*.repl.co",
    "*.replit.app"
  ]
};

export default nextConfig;
