"use client";

import { SessionProvider } from "next-auth/react";
import type { ReactNode } from "react";
import { isBackendEnabled } from "@/lib/backend";

// Only mount Auth.js when the real backend is enabled. In seed mode there is no
// AUTH_SECRET, so mounting SessionProvider (which eagerly fetches /api/auth/session)
// would 500 and destabilize the first render. isBackendEnabled() is a build-time
// constant, so this branch is identical on server and client (no hydration risk).
export function Providers({ children }: { children: ReactNode }) {
  if (!isBackendEnabled()) return <>{children}</>;
  return <SessionProvider>{children}</SessionProvider>;
}
