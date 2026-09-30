"use client";

import { useEffect, useState } from "react";
import { discoverCommunities } from "@/app/discovery-actions";
import { communityCatalog, regionCatalog } from "@/lib/network/catalog";
import { nationwideCommunities, nationwideRegions } from "@/lib/nationwide-demo";
import styles from "./network-workspace.module.css";

type Discovery = Awaited<ReturnType<typeof discoverCommunities>>;

export function NetworkExplorer({ demo = false, memberIds, onOpen }: { demo?: boolean; memberIds: string[]; onOpen: (id: string) => void }) {
  const [query, setQuery] = useState("");
  const [regionId, setRegionId] = useState("");
  const [after, setAfter] = useState<string>();
  const [data, setData] = useState<Discovery>();
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  const [regions, setRegions] = useState<Discovery["regions"]>(demo ? [...regionCatalog, ...nationwideRegions] : []);
  useEffect(() => {
    let active = true;
    setData(undefined); setError(false);
    const timer = setTimeout(() => {
      if (demo) {
        const communities = [...communityCatalog, ...nationwideCommunities].filter(c => c.kind === "organizational" && `${c.name} ${c.description}`.toLowerCase().includes(query.trim().toLowerCase()) && (!regionId || ("region" in c ? c.region === regionId : regionId === "berks"))).map(c => ({ ...c, logo: c.logo ?? null }));
        setData({ communities, nextCursor: null, regions: [...regionCatalog, ...nationwideRegions] });
        return;
      }
      void discoverCommunities({ query, regionId, after }).then(result => { if (active) { setData(result); setRegions(result.regions); } }).catch(() => { if (active) setError(true); });
    }, 200);
    return () => { active = false; clearTimeout(timer); };
  }, [query, regionId, after, demo, revision]);
  return <section className={`${styles.panel} ${styles.explorer}`}>
    <p className={styles.eyebrow}>Collab · community discovery</p><h1>Find your next community</h1>
    <p>Independent organizations, connected through one network. Explore their public pages; each community manages its own membership.</p>
    {demo && <p className={styles.scopeNote}>Nationwide showcase · 10 fictional networks across 10 cities, with 80 local businesses and a shared demo business. Sample activity does not represent real membership or partnerships.</p>}
    <div className={styles.filters}>
      <label>Find an organization<input type="search" maxLength={100} value={query} placeholder="Chamber, association, or interest" onChange={event => { setQuery(event.target.value); setAfter(undefined); }} /></label>
      <label>Area<select value={regionId} onChange={event => { setRegionId(event.target.value); setAfter(undefined); }}><option value="">Nationwide · all participating areas</option>{regions.map(region => <option value={region.id} key={region.id}>{region.name}</option>)}</select></label>
    </div>
    {error ? <p role="alert">We couldn’t load communities. <button onClick={() => setRevision(n => n + 1)}>Try again</button></p> : !data ? <p role="status">Finding communities…</p> : <>
      {!data.communities.length && <p>No participating communities match this search. Try a broader area or another name.</p>}
      <div className={styles.grid}>{data.communities.map(community => <article key={community.id} className={styles.card}>
        {community.logo && <img className={styles.communityLogo} src={community.logo} alt="" />}
        <p className={styles.eyebrow}>{community.kind}</p><h2>{community.name}</h2><p>{community.description}</p>
        {memberIds.includes(community.id) ? <><p>{demo ? "Available in this demo" : "You’re a member"}</p><button onClick={() => onOpen(community.id)}>Open community</button></> : <><p>Membership managed by this organization</p><a href={`/c/${encodeURIComponent(community.slug)}`}>View community</a></>}
      </article>)}</div>
      {after && <button onClick={() => setAfter(undefined)}>First page</button>}{data.nextCursor && <button onClick={() => setAfter(data.nextCursor ?? undefined)}>Next page</button>}
    </>}
  </section>;
}
