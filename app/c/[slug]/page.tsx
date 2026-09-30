import { notFound } from "next/navigation";
import { getDb } from "@/lib/db/client";
import { isBackendEnabled } from "@/lib/backend";
import { resolveCommunityBySlug } from "@/lib/network/discovery";
import { NetworkWorkspace } from "@/components/network-workspace";

// /c/{slug} — resolve the slug to a community server-side. An unknown slug 404s;
// it never falls back to another tenant.
export default async function CommunityPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const db = getDb();
  if (!isBackendEnabled() || !db) notFound();
  try {
    const community = await resolveCommunityBySlug(db, slug);
    return <NetworkWorkspace initialCommunity={community} />;
  } catch {
    notFound();
  }
}
