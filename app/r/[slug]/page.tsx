import { notFound } from "next/navigation";
import { getDb } from "@/lib/db/client";
import { isBackendEnabled } from "@/lib/backend";
import { resolveRegionBySlug } from "@/lib/network/discovery";
import styles from "@/components/network-workspace.module.css";

// /r/{slug} — regional discovery. Lists the active communities in a region, each
// linking to its own /c/{slug}. Public projection only; an unknown region 404s.
export default async function RegionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const db = getDb();
  if (!isBackendEnabled() || !db) notFound();
  let discovery;
  try {
    discovery = await resolveRegionBySlug(db, slug);
  } catch {
    notFound();
  }
  return <main className={styles.shell}>
    <header className={styles.header}>
      <a href="/" className={styles.brand}>Collab<span>Local communities. Shared connections.</span></a>
    </header>
    <section className={styles.panel}>
      <p className={styles.eyebrow}>Communities in</p>
      <h1>{discovery.region.name}</h1>
      {!discovery.communities.length && <p>No communities are listed in this region yet.</p>}
      <div className={styles.grid}>{discovery.communities.map(community => <article key={community.id} className={styles.card} lang={community.locale}>
        <p className={styles.eyebrow}>{community.shortName}</p>
        <h3><a href={`/c/${community.slug}`}>{community.name}</a></h3>
        {community.description && <p>{community.description}</p>}
      </article>)}</div>
    </section>
  </main>;
}
