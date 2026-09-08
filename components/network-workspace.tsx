"use client";

import { useEffect, useState } from "react";
import { signIn, signOut, useSession } from "next-auth/react";
import { loadWorkspace, loadDirectory, updatePersonName, acceptCommunityInvitation } from "@/app/network-actions";
import { CommunityMembershipAdmin } from "./community-membership-admin";
import { LoginIntroduction } from "./login-introduction";
import styles from "./network-workspace.module.css";

type Workspace = Awaited<ReturnType<typeof loadWorkspace>>;
type Directory = Awaited<ReturnType<typeof loadDirectory>>;

export function NetworkWorkspace() {
  const { data: session, status } = useSession();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [communityId, setCommunityId] = useState("");
  const [directory, setDirectory] = useState<Directory | null>(null);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState<string | undefined>();
  const [notice, setNotice] = useState("");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let active = true;
    setWorkspace(null); setDirectory(null); setError(""); setCommunityId(""); setPage(undefined);
    if (status !== "authenticated") return;
    void loadWorkspace().then(data => {
      if (!active) return;
      setWorkspace(data); setName(data.person.name);
      setCommunityId(data.memberships.find(m => m.status === "active")?.id ?? "");
    }).catch(() => { if (active) setError("Unable to load your account. Try signing in again or contact your community administrator."); });
    return () => { active = false; };
  }, [status, session?.user?.id, revision]);

  useEffect(() => {
    let active = true;
    setDirectory(null); setError("");
    if (!communityId || status !== "authenticated") return;
    void loadDirectory(communityId, page).then(data => { if (active) setDirectory(data); })
      .catch(() => { if (active) setError("This directory is unavailable. Your membership may have changed; refresh to check your access."); });
    return () => { active = false; };
  }, [communityId, page, status, session?.user?.id]);

  const community = workspace?.memberships.find(m => m.id === communityId);
  return <main className={styles.shell}>
    <header className={styles.header}><a href="/" className={styles.brand}>Collab<span>Local communities. Shared connections.</span></a>
      {status === "authenticated" && <button onClick={() => { setWorkspace(null); setDirectory(null); void signOut(); }}>Sign out</button>}
    </header>
    {status === "loading" ? <p role="status">Loading your account…</p> : status !== "authenticated" ?
      <section className={styles.panel}>
        <img className={styles.loginLogo} src="/collab-logo.png" alt="Collab — Your community. A wider connection." width={1254} height={1254} />
        <p className={styles.eyebrow}>CHAMBERS • MEMBERS • LOCAL CONNECTIONS</p><h1>Your chamber. A wider business network.</h1>
        <LoginIntroduction />
        <p>Sign in to access your community memberships and member directories.</p>
        <button onClick={() => void signIn("google")}>Continue with Google</button></section> : <>
        {error && <p role="alert" className={styles.error}>{error}</p>}
        {!workspace && !error && <p role="status">Loading your memberships…</p>}
        {workspace && <>
          <section className={styles.panel}><p className={styles.eyebrow}>YOUR COMMUNITY WORKSPACE</p><h1>Welcome, {workspace.person.name}</h1>
            <form onSubmit={async event => {
              event.preventDefault(); setSaving(true); setNotice("");
              try { await updatePersonName(name); setWorkspace({ ...workspace, person: { ...workspace.person, name: name.trim() } }); setNotice("Name saved."); }
              catch { setNotice("Unable to save your name. Please try again."); }
              finally { setSaving(false); }
            }}><label>Your name<input value={name} maxLength={200} required onChange={event => setName(event.target.value)} /></label>
              <button disabled={saving}>{saving ? "Saving…" : "Save name"}</button><span role="status">{notice}</span></form>
          </section>
          <section className={styles.panel}>
            <h2>Your communities</h2>
            <label>Your Collab account ID<input readOnly value={workspace.person.id} onFocus={event => event.target.select()} /></label>
            <p>Share this ID with a community administrator to receive an invitation. It is not a password.</p>
            {workspace.memberships.some(m => m.status === "active") ? <label>Choose a community<select value={communityId} onChange={event => {
              setDirectory(null); setPage(undefined); setCommunityId(event.target.value);
            }}>{workspace.memberships.filter(m => m.status === "active").map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label> :
              <p>Your account is ready. A community administrator needs to activate your membership before you can access its directory.</p>}
            {workspace.memberships.filter(m => m.status !== "active").map(m => <p key={m.id}>{m.name} · {m.status}</p>)}
          </section>
          {workspace.invitations.length > 0 && <section className={styles.panel}><h2>Your invitations</h2>
            {workspace.invitations.map(invitation => <article className={styles.card} key={invitation.id}>
              <h3>{invitation.communityName}</h3><p>Expires {new Date(invitation.expiresAt).toLocaleDateString()}</p>
              <button disabled={saving} onClick={async () => {
                setSaving(true); setError("");
                try { await acceptCommunityInvitation(invitation.id); setRevision(value => value + 1); }
                catch { setError("This invitation can no longer be accepted. Contact the community administrator for a new invitation."); }
                finally { setSaving(false); }
              }}>Accept membership</button>
            </article>)}
          </section>}
          {community?.canAdmin && <CommunityMembershipAdmin key={`${session?.user?.id}:${community.id}`} communityId={community.id} />}
          {community && <section className={styles.panel}><p className={styles.eyebrow}>{community.name}</p><h2>Business directory</h2>
            {!directory && !error && <p role="status">Loading businesses…</p>}
            {directory && !directory.organizations.length && <p>No businesses are listed here yet.</p>}
            <div className={styles.grid}>{directory?.organizations.map(org => <article key={org.id} className={styles.card}><p className={styles.eyebrow}>{org.kind}</p><h3>{org.name}</h3><p>{org.description || "Business profile coming soon."}</p></article>)}</div>
            {page && <button onClick={() => setPage(undefined)}>First page</button>}
            {directory?.nextCursor && <button onClick={() => setPage(directory.nextCursor ?? undefined)}>Next page</button>}
          </section>}
        </>}
      </>}
  </main>;
}
