"use client";

import { useEffect, useState } from "react";
import { signIn, signOut, useSession } from "next-auth/react";
import { loadWorkspace, loadDirectory, updatePersonName, acceptCommunityInvitation } from "@/app/network-actions";
import { memberNavigation, readWorkspaceLocation, workspaceHash, type WorkspaceView } from "@/lib/navigation";
import type { CommunityContext } from "@/lib/network/discovery";
import { CommunityMembershipAdmin } from "./community-membership-admin";
import { CommunitySwitcher } from "./community-switcher";
import { LoginIntroduction } from "./login-introduction";
import { NetworkExplorer } from "./network-explorer";
import { CommunityTools, ActionForm } from "./community-tools";
import { BusinessProfiles, BusinessClaim } from "./business-profiles";
import { BusinessCrmWorkspace } from "./business-crm-workspace";
import styles from "./network-workspace.module.css";

type Workspace = Awaited<ReturnType<typeof loadWorkspace>>;
type Directory = Awaited<ReturnType<typeof loadDirectory>>;

export function NetworkWorkspace({ localDemo = false, initialCommunity }: { localDemo?: boolean; initialCommunity?: CommunityContext }) {
  const { data: session, status } = useSession();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [communityId, setCommunityId] = useState(initialCommunity?.id ?? "");
  const [view, setView] = useState<WorkspaceView>("community");
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const activeMemberships = workspace?.memberships.filter(m => m.status === "active") ?? [];
  const membership = activeMemberships.find(m => m.id === communityId);
  const community = membership ?? (initialCommunity?.id === communityId ? initialCommunity : undefined);
  const exploring = view === "explore";

  useEffect(() => {
    let active = true;
    setWorkspace(null); setError("");
    if (status !== "authenticated") return;
    void loadWorkspace().then(data => {
      if (!active) return;
      const location = readWorkspaceLocation(window.location.hash);
      const id = location.communityId || initialCommunity?.id || data.memberships.find(m => m.status === "active")?.id || "";
      const available = data.memberships.find(m => m.id === id && m.status === "active");
      setCommunityId(id);
      setView(location.view === "admin" && !available?.canAdmin ? "community" : location.view);
      if (id && !available && id !== initialCommunity?.id) setError("This community is not available to your account. Choose one of your communities or explore the network.");
      setWorkspace(data);
    }).catch(() => { if (active) setError("Unable to load your account. Try again or contact your community administrator."); });
    return () => { active = false; };
  }, [status, session?.user?.id, revision, initialCommunity?.id]);

  useEffect(() => {
    if (!workspace) return;
    const restore = () => {
      const location = readWorkspaceLocation(window.location.hash);
      const id = location.communityId || initialCommunity?.id || workspace.memberships.find(m => m.status === "active")?.id || "";
      const selected = workspace.memberships.find(m => m.id === id && m.status === "active");
      setCommunityId(id); setView(location.view === "admin" && !selected?.canAdmin ? "community" : location.view);
      setError(id && !selected && id !== initialCommunity?.id ? "This community is not available to your account." : "");
    };
    window.addEventListener("popstate", restore); window.addEventListener("hashchange", restore);
    return () => { window.removeEventListener("popstate", restore); window.removeEventListener("hashchange", restore); };
  }, [workspace, initialCommunity?.id]);

  function navigate(next: WorkspaceView, id = communityId) {
    const member = activeMemberships.find(m => m.id === id);
    const destination = next === "admin" && !member?.canAdmin ? "community" : next;
    setCommunityId(id); setView(destination); setError("");
    setMenuOpen(false);
    const hash = workspaceHash(destination, id);
    if (window.location.hash !== hash) window.history.pushState(null, "", hash);
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  const branding = <div className={styles.brandLockup}>
    {!exploring && community?.logo && <img className={styles.communityLogo} src={community.logo} alt="" />}
    <div className={styles.brand}>{exploring ? "Collab" : community?.shortName || "Collab"}<span>{community && !exploring ? "Connected through Collab" : "Independent communities. Shared connections."}</span></div>
  </div>;

  if (status !== "authenticated") return <main className={styles.shell}>
    <header className={styles.header}>{branding}</header>
    <section className={styles.panel}>
      <h1>{initialCommunity?.name ?? "Your community. A wider business network."}</h1>
      {initialCommunity ? <p>{initialCommunity.description}</p> : <LoginIntroduction />}
      {status === "loading" ? <p role="status">Loading your account…</p> : <>
        <p>One sign-in for your communities. Each organization manages its own membership and member access.</p>
        <button onClick={() => void signIn("google")}>Continue with Google</button>
        {localDemo && <ActionForm label="Enter database demo" fields={[{ name: "role", label: "Demo role: admin or member", value: "admin" }, { name: "password", label: "Local demo password", type: "password" }]} submit={async data => { const result = await signIn("credentials", { role: data.get("role"), password: data.get("password"), redirect: false }); if (result?.error) throw new Error("Sign in failed"); }} />}
      </>}
    </section>
  </main>;

  return <div className={`${styles.shell} ${styles.workspaceShell}`}>
    <a className={styles.skipLink} href="#workspace-content" onClick={event => { event.preventDefault(); document.getElementById("workspace-content")?.focus(); }}>Skip to content</a>
    <aside className={styles.sidebar}>
      {branding}
      <CommunitySwitcher communities={activeMemberships} visitingCommunity={initialCommunity && !activeMemberships.some(m => m.id === initialCommunity.id) ? initialCommunity : undefined} value={exploring ? "network" : community?.id ?? ""} onChange={id => id === "network" ? navigate("explore") : navigate(exploring ? "community" : view, id)} />
      <nav className={styles.primaryNav} aria-label="Primary">{memberNavigation.map(item => <button key={item.key} aria-current={view === item.key ? "page" : undefined} onClick={() => navigate(item.key)}>{item.label}</button>)}</nav>
      <button className={styles.mobileMenuToggle} aria-expanded={menuOpen} aria-controls="workspace-menu" onClick={() => setMenuOpen(open => !open)}>Account, tools & management</button>
      <div id="workspace-menu" className={styles.workspaceMenu} data-open={menuOpen}>
        <nav className={styles.secondaryNav} aria-label="Workspace"><button aria-current={view === "tools" ? "page" : undefined} onClick={() => navigate("tools")}>Business tools</button><button aria-current={view === "profile" ? "page" : undefined} onClick={() => navigate("profile")}>My account & memberships</button>{membership?.canAdmin && <button aria-current={view === "admin" ? "page" : undefined} onClick={() => navigate("admin")}>Manage community</button>}</nav>
        <div className={styles.sidebarFooter}><p>{workspace?.person.name}</p><button onClick={() => { setWorkspace(null); void signOut(); }}>Sign out</button></div>
      </div>
    </aside>
    <main id="workspace-content" tabIndex={-1} className={styles.workspaceContent}>
      <header className={styles.contextHeader}><p className={styles.eyebrow}>{exploring ? "Network discovery" : view === "referrals" ? "Your connections · across communities" : community?.name ?? "Your Collab account"}</p>{community && !exploring && <p>{view === "referrals" ? `New introductions and referrals are sent through ${community.shortName}.` : community.description}</p>}</header>
      {error && <p role="alert" className={styles.error}>{error} <button onClick={() => setRevision(n => n + 1)}>Refresh access</button></p>}
      {!workspace && !error && <p role="status">Loading your communities…</p>}
      {workspace && <>
        {exploring ? <NetworkExplorer memberIds={activeMemberships.map(m => m.id)} onOpen={id => navigate("community", id)} /> : view === "profile" ? <AccountPanel workspace={workspace} onChanged={() => setRevision(n => n + 1)} /> : <>
          {!membership && <section className={styles.panel}><h1>{community ? `Welcome to ${community.shortName}` : "Choose your community"}</h1><p>{community ? "You can view this community’s public identity. An active membership is required for its member directory, events, and opportunities. Contact this organization to request membership." : "Choose a community from the switcher, explore participating organizations, or review your invitations."}</p><button onClick={() => navigate("profile")}>My memberships & invitations</button><button onClick={() => navigate("explore")}>Explore the network</button></section>}
          {view === "tools" && <BusinessCrmWorkspace key={`crm:${session?.user?.id}`} />}
          {view === "referrals" && <CommunityTools key={`relationships:${session?.user?.id}:${membership?.id ?? "personal"}`} communityId={membership?.id ?? ""} canAdmin={false} section="Relationships" communities={workspace.memberships} />}
          {membership && <>
            {view === "community" && <section className={styles.panel}><p className={styles.eyebrow}>Your community</p><h1>Welcome to {membership.shortName}</h1><p>Find a local business, share a request, or meet your next connection.</p><div className={styles.quickActions}><button onClick={() => navigate("directory")}>Find a business</button><button onClick={() => navigate("opportunities")}>Request help or make an offer</button><button onClick={() => navigate("events")}>Find an event</button></div></section>}
            {(["community", "opportunities", "events"] as WorkspaceView[]).includes(view) && <CommunityTools key={`${membership.id}:${view}`} communityId={membership.id} canAdmin={membership.canAdmin} section={view === "community" ? "Announcements" : view === "opportunities" ? "Requests & offers" : "Events"} communities={workspace.memberships} />}
            {view === "directory" && <DirectoryPanel key={membership.id} communityId={membership.id} communityName={membership.shortName} />}
            {view === "admin" && membership.canAdmin && <><section className={styles.panel}><p className={styles.eyebrow}>Managing {membership.name}</p><h1>Manage community</h1><p>Membership decisions and private records apply to this community only.</p></section><CommunityMembershipAdmin key={membership.id} communityId={membership.id} /><CommunityTools key={`claims:${membership.id}`} communityId={membership.id} canAdmin section="Business claims" /></>}
          </>}
        </>}
      </>}
    </main>
  </div>;
}

function DirectoryPanel({ communityId, communityName }: { communityId: string; communityName: string }) {
  const [directory, setDirectory] = useState<Directory>();
  const [after, setAfter] = useState<string>();
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true; setDirectory(undefined); setError(false);
    void loadDirectory(communityId, after).then(data => { if (active) setDirectory(data); }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [communityId, after, revision]);
  return <><section className={styles.panel}><p className={styles.eyebrow}>Members of {communityName}</p><h1>Business directory</h1><p>Community listings and local offers. Membership in another organization is separate.</p>
    {error ? <p role="alert">Directory unavailable. <button onClick={() => setRevision(n => n + 1)}>Try again</button></p> : !directory ? <p role="status">Loading businesses…</p> : <>
      {!directory.organizations.length && <p>No businesses are listed here yet.</p>}
      <div className={styles.grid}>{directory.organizations.map(org => <article key={org.id} className={styles.card}><p className={styles.eyebrow}>{communityName} · {org.kind}</p><h2>{org.name}</h2><p>{org.description || "Business profile coming soon."}</p>{org.localOffer && <p><strong>Member offer:</strong> {org.localOffer}</p>}{org.serviceAreas && <p>Service areas: {org.serviceAreas}</p>}<BusinessClaim organizationId={org.id} communityId={communityId} /></article>)}</div>
      {after && <button onClick={() => setAfter(undefined)}>First page</button>}{directory.nextCursor && <button onClick={() => setAfter(directory.nextCursor ?? undefined)}>Next page</button>}
    </>}
  </section><BusinessProfiles communityId={communityId} onChanged={() => setRevision(n => n + 1)} /></>;
}

function AccountPanel({ workspace, onChanged }: { workspace: Workspace; onChanged: () => void }) {
  return <section className={styles.panel}><h1>My account & memberships</h1>
    <ActionForm label="Save name" fields={[{ name: "name", label: "Your name", value: workspace.person.name, max: 200 }]} submit={data => updatePersonName(String(data.get("name") ?? "").trim())} done={onChanged} />
    <details><summary>Share your account ID for a membership invitation</summary><label>Your Collab account ID<input readOnly value={workspace.person.id} onFocus={event => event.target.select()} /></label></details>
    <h2>Your memberships</h2>{workspace.memberships.length ? workspace.memberships.map(m => <p key={m.id}>{m.name} · {m.status}</p>) : <p>No memberships yet. An organization administrator can invite you.</p>}
    <h2>Invitations</h2>{!workspace.invitations.length && <p>You have no pending invitations.</p>}{workspace.invitations.map(invitation => <article className={styles.card} key={invitation.id}><h3>{invitation.communityName}</h3><p>Expires {new Date(invitation.expiresAt).toLocaleDateString()}</p><ActionForm label="Accept membership" fields={[]} submit={() => acceptCommunityInvitation(invitation.id)} done={onChanged} /></article>)}
  </section>;
}
