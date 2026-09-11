"use client";

import { useEffect, useState } from "react";
import { loadHomeWorkspace } from "@/app/network-actions";
import styles from "./network-workspace.module.css";

type Home = Awaited<ReturnType<typeof loadHomeWorkspace>>;

export function NetworkHome() {
  const [home, setHome] = useState<Home | null>(null);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setHome(null); setError(false);
    void loadHomeWorkspace().then(value => { if (active) setHome(value); })
      .catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [revision]);
  return <section className={styles.panel} aria-labelledby="home-heading">
    <p className={styles.eyebrow}>ACROSS YOUR COMMUNITIES</p>
    <h2 id="home-heading">Your next connections</h2>
    <button onClick={() => setRevision(value => value + 1)}>Refresh workspace</button>
    {error ? <p role="alert">Unable to load your workspace. Try refreshing.</p> : !home ? <p role="status">Loading your workspace…</p> : <>
      <p>{home.introductionsAwaiting.length ? `${home.introductionsAwaiting.length} introductions await your response.` : "You’re up to date on introductions."}</p>
      <div className={styles.grid}>
        <article className={styles.card}><h3>Introductions awaiting you</h3>
          {home.introductionsAwaiting.length ? home.introductionsAwaiting.map(item => <p key={item.id}>{item.message || "A member would like to introduce you."}</p>) : <p>No pending introductions.</p>}
        </article>
        <article className={styles.card}><h3>Open requests and offers</h3>
          {home.openOpportunities.length ? home.openOpportunities.map(item => <p key={item.id}><strong>{item.title}</strong> · {item.kind === "need" ? "Request" : "Offer"}{item.mine ? " · Yours" : ""}</p>) : <p>No open requests or offers yet.</p>}
        </article>
        <article className={styles.card}><h3>Upcoming events</h3>
          {home.upcomingEvents.length ? home.upcomingEvents.map(item => <p key={item.id}><strong>{item.title}</strong><br /><time dateTime={new Date(item.startsAt).toISOString()}>{new Date(item.startsAt).toLocaleString()}</time></p>) : <p>No upcoming events.</p>}
        </article>
        <article className={styles.card}><h3>Community announcements</h3>
          {home.announcements.length ? home.announcements.map(item => <p key={item.id}><strong>{item.title}</strong><br />{item.authorName}</p>) : <p>No announcements yet.</p>}
        </article>
      </div>
    </>}
  </section>;
}
