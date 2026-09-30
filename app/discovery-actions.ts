"use server";

import { getDb } from "@/lib/db/client";
import { isBackendEnabled } from "@/lib/backend";
import { readNetworkCommunities } from "@/lib/network/discovery";

export async function discoverCommunities(input: { query?: string; regionId?: string; after?: string }) {
  const db = getDb();
  if (!isBackendEnabled() || !db) throw new Error("Discovery is unavailable.");
  return readNetworkCommunities(db, input);
}
