import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: path.join(__dirname),
  // Next 15 blocks dev requests from origins other than the dev server's own.
  // Replit serves the preview through a *.replit.dev / *.repl.co proxy, so allow
  // those origins or the preview pane errors on cross-origin dev asset requests.
  allowedDevOrigins: ["*.replit.dev", "*.repl.co", "*.riker.replit.dev", "*.picard.replit.dev"]
};

export default nextConfig;
