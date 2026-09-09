import { notFound } from "next/navigation";
import { getDb } from "@/lib/db/client";
import { isBackendEnabled } from "@/lib/backend";
import { resolveCommunityBySlug } from "@/lib/network/discovery";
import { CommunityDirectory } from "@/components/community-directory";

// /c/{slug} — resolve the slug to a community server-side. An unknown slug 404s;
// it never falls back to another tenant.
export default async function CommunityPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const db = getDb();
  if (!isBackendEnabled() || !db) notFound();
  try {
    const community = await resolveCommunityBySlug(db, slug);
    return <CommunityDirectory community={community} />;
  } catch {
    notFound();
  }
}
