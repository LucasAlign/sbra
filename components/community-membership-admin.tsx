"use client";

import { useEffect, useRef, useState } from "react";
import { createCommunityInvitation, loadMembershipAdmin, revokeCommunityInvitation, setCommunityMembership } from "@/app/network-actions";
import styles from "./network-workspace.module.css";

export function CommunityMembershipAdmin({ communityId }: { communityId: string }) {
  const [data, setData] = useState<Awaited<ReturnType<typeof loadMembershipAdmin>> | null>(null);
  const [recipient, setRecipient] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [after, setAfter] = useState<string | undefined>();
  const [revision, setRevision] = useState(0);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    let active = true; setData(null);
    void loadMembershipAdmin(communityId, after).then(result => { if (active) setData(result); })
      .catch(() => { if (active) setMessage("Unable to load member administration. Check your community access."); });
    return () => { active = false; };
  }, [communityId, after, revision]);

  async function run(operation: () => Promise<unknown>, success: string) {
    setBusy(true); setMessage("");
    try {
      await operation();
      if (mounted.current) { setMessage(success); setRevision(value => value + 1); }
    } catch {
      if (mounted.current) setMessage("Unable to complete this change. Check the account ID and current membership. Administrator memberships require an administrator transfer.");
    } finally { if (mounted.current) setBusy(false); }
  }

  return <section className={styles.panel}><p className={styles.eyebrow}>COMMUNITY ADMINISTRATION</p><h2>Members & invitations</h2>
    <form onSubmit={event => { event.preventDefault(); void run(() => createCommunityInvitation(communityId, recipient.trim()), "Invitation is available in the recipient’s Collab account for seven days."); }}>
      <label>Recipient’s Collab account ID<input required value={recipient} maxLength={200} onChange={event => setRecipient(event.target.value)} /></label>
      <p>Ask the recipient to sign in and share their account ID. Invitations grant community membership only.</p>
      <button disabled={busy}>Create invitation</button>
    </form>
    <p role="status">{message}</p>
    {!data && <p>Loading roster…</p>}
    {data && <>
      <h3>Member roster</h3>
      {!data.members.length && <p>No members on this page.</p>}
      <div className={styles.grid}>{data.members.map(member => <article className={styles.card} key={member.id}>
        <h4>{member.name}</h4><p>{member.status}</p>
        {member.administrator && <p>Administrator membership · managed through administrator transfer</p>}
        {!member.administrator && (member.status === "active" || member.status === "suspended") && <button disabled={busy} onClick={() => void run(
          () => setCommunityMembership(communityId, member.id, member.status === "active" ? "suspended" : "active"),
          member.status === "active" ? "Membership suspended." : "Membership restored.")}>{member.status === "active" ? "Suspend membership" : "Restore membership"}</button>}
      </article>)}</div>
      {after && <button disabled={busy} onClick={() => setAfter(undefined)}>First roster page</button>}
      {data.nextCursor && <button disabled={busy} onClick={() => setAfter(data.nextCursor ?? undefined)}>Next roster page</button>}
      <h3>Pending invitations</h3>
      {!data.invitations.length && <p>No pending invitations.</p>}
      {data.invitations.length === 100 && <p>Showing the oldest 100 pending invitations.</p>}
      {data.invitations.map(invitation => <article className={styles.card} key={invitation.id}>
        <h4>{invitation.name}</h4><p>Expires {new Date(invitation.expiresAt).toLocaleDateString()}</p>
        <button disabled={busy} onClick={() => void run(() => revokeCommunityInvitation(communityId, invitation.id), "Invitation revoked.")}>Revoke invitation</button>
      </article>)}
    </>}
  </section>;
}
