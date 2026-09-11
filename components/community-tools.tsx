"use client";
import { useEffect, useState, type ReactNode } from "react";
import * as actions from "@/app/network-actions";
import styles from "./network-workspace.module.css";

type Field = { name: string; label: string; type?: string; optional?: boolean; value?: string; max?: number };
export function ActionForm({ fields, submit, label, done }: { fields: Field[]; submit: (data: FormData) => Promise<unknown>; label: string; done?: () => void }) {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  return <form onSubmit={async event => {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); setBusy(true); setMessage("");
    try { await submit(data); setMessage("Saved."); if (fields.every(field => field.value === undefined)) form.reset(); done?.(); }
    catch { setMessage("Unable to save. Check your entries and access, then try again."); }
    finally { setBusy(false); }
  }}><fieldset disabled={busy}>{fields.map(field => <label key={field.name}>{field.label}<input name={field.name} type={field.type || "text"} required={!field.optional} defaultValue={field.value} maxLength={field.max || 2000} /></label>)}<button>{busy ? "Saving…" : label}</button></fieldset><p role="status">{message}</p></form>;
}
const value = (data: FormData, key: string) => String(data.get(key) || "").trim();
function Command({ children, run, done }: { children: ReactNode; run: () => Promise<unknown>; done: () => void }) {
  return <ActionForm fields={[]} label={String(children)} submit={run} done={done} />;
}

export function CommunityTools({ communityId, canAdmin, onChanged }: { communityId: string; canAdmin: boolean; onChanged?: () => void }) {
  const [tab, setTab] = useState("Announcements"), [revision, setRevision] = useState(0);
  const refresh = () => { setRevision(n => n + 1); onChanged?.(); };
  return <section className={styles.panel}><p className={styles.eyebrow}>COMMUNITY TOOLS</p><h2>Connect and participate</h2>
    <nav aria-label="Community tools">{["Announcements", "Requests & offers", "Events", "Relationships", ...(canAdmin ? ["Business claims"] : [])].map(item => <button key={item} aria-pressed={tab === item} onClick={() => setTab(item)}>{item}</button>)}</nav>
    <ToolContents key={`${tab}:${revision}`} tab={tab} communityId={communityId} canAdmin={canAdmin} refresh={refresh} />
  </section>;
}
function ToolContents({ tab, communityId, canAdmin, refresh }: { tab: string; communityId: string; canAdmin: boolean; refresh: () => void }) {
  const [announcements, setAnnouncements] = useState<Awaited<ReturnType<typeof actions.loadAnnouncements>>>();
  const [opportunities, setOpportunities] = useState<Awaited<ReturnType<typeof actions.loadOpportunities>>>();
  const [events, setEvents] = useState<Awaited<ReturnType<typeof actions.loadEvents>>>();
  const [introductions, setIntroductions] = useState<Awaited<ReturnType<typeof actions.loadIntroductions>>>();
  const [connections, setConnections] = useState<Awaited<ReturnType<typeof actions.loadConnections>>>();
  const [referrals, setReferrals] = useState<Awaited<ReturnType<typeof actions.loadReferrals>>>();
  const [claims, setClaims] = useState<Awaited<ReturnType<typeof actions.loadClaimRequests>>>();
  const [error, setError] = useState(""), [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        if (tab === "Announcements") { const result = await actions.loadAnnouncements(communityId); if (active) setAnnouncements(result); }
        if (tab === "Requests & offers") { const result = await actions.loadOpportunities(communityId); if (active) setOpportunities(result); }
        if (tab === "Events") { const result = await actions.loadEvents(communityId); if (active) setEvents(result); }
        if (tab === "Business claims") { const result = await actions.loadClaimRequests(communityId); if (active) setClaims(result); }
        if (tab === "Relationships") {
          const [i, c, r] = await Promise.all([actions.loadIntroductions(), actions.loadConnections(), actions.loadReferrals()]);
          if (active) { setIntroductions(i); setConnections(c); setReferrals(r); }
        }
      } catch { if (active) setError("Unable to load this tool. Refresh to check your access."); }
      finally { if (active) setLoading(false); }
    }
    void load(); return () => { active = false; };
  }, [tab, communityId]);
  if (loading) return <p role="status">Loading…</p>;
  if (error) return <p role="alert">{error}<button onClick={refresh}>Retry</button></p>;
  return <>
    {announcements && <>
      {canAdmin && <ActionForm label="Publish announcement" fields={[{ name: "title", label: "Title", max: 200 }, { name: "body", label: "Announcement", max: 10000 }]} submit={d => actions.createAnnouncement({ communityId, title: value(d, "title"), body: value(d, "body") })} done={refresh} />}
      {!announcements.announcements.length && <p>No announcements yet.</p>}
      {announcements.announcements.map(item => <article className={styles.card} key={item.id}><h3>{item.title}</h3><p>{item.body}</p><p>By {item.authorName}</p>
        <Discussion kind="announcement" id={item.id} />
        {item.mine && <Command run={() => actions.archiveAnnouncement(item.id)} done={refresh}>Archive announcement</Command>}
      </article>)}
    </>}
    {opportunities && <>
      <h3>Create a private draft</h3><p>Publish your draft when you are ready to share it with this community.</p>
      {(["need", "offer"] as const).map(kind => <details key={kind}><summary>{kind === "need" ? "Request help" : "Make an offer"}</summary><ActionForm label="Save draft" fields={[{ name: "title", label: "Title", max: 200 }, { name: "detail", label: "Details", max: 10000 }]} submit={d => actions.postOpportunity({ communityId, kind, title: value(d, "title"), detail: value(d, "detail") })} done={refresh} /></details>)}
      {!opportunities.opportunities.length && <p>No requests or offers yet.</p>}
      {opportunities.opportunities.map(item => <article className={styles.card} key={item.id}><h3>{item.title}</h3><p>{item.kind} · {item.status} · {item.visibility}</p><p>{item.detail}</p><p>By {item.authorName}</p>
        {item.mine && item.status === "open" && <>{item.visibility === "private" && <Command run={() => actions.publishOpportunity(item.id)} done={refresh}>Publish to community</Command>}<Command run={() => actions.closeOpportunity(item.id)} done={refresh}>Close request or offer</Command></>}
        <Discussion kind="opportunity" id={item.id} canReply={!item.mine && item.status === "open"} />
      </article>)}
      {opportunities.nextCursor && <Command run={async () => { const next = await actions.loadOpportunities(communityId, opportunities.nextCursor!); setOpportunities({ opportunities: [...opportunities.opportunities, ...next.opportunities], nextCursor: next.nextCursor }); }} done={() => {}}>Load more</Command>}
    </>}
    {events && <>
      <details><summary>Organize an event</summary><ActionForm label="Publish event" fields={[{ name: "title", label: "Title", max: 200 }, { name: "startsAt", label: "Start (your local time)", type: "datetime-local" }, { name: "location", label: "Location", optional: true }, { name: "capacity", label: "Capacity (optional)", type: "number", optional: true }]} submit={d => actions.createEvent({ communityId, title: value(d, "title"), startsAt: new Date(value(d, "startsAt")), location: value(d, "location"), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, capacity: value(d, "capacity") ? Number(value(d, "capacity")) : null })} done={refresh} /></details>
      {!events.events.length && <p>No events yet.</p>}
      {events.events.map(item => <article className={styles.card} key={item.id}><h3>{item.title}</h3><p>{new Date(item.startsAt).toLocaleString()} · {item.location}</p><p>{item.status} · Your RSVP: {item.myStatus || "No response"}{item.full ? " · Full" : ""}</p>
        {item.status === "scheduled" && <>{!item.full && item.myStatus !== "going" && <Command run={() => actions.rsvpToEvent(item.id, "going")} done={refresh}>Attend</Command>}{item.myStatus === "going" && <Command run={() => actions.rsvpToEvent(item.id, "not_going")} done={refresh}>Cancel RSVP</Command>}{item.mine && <Command run={() => actions.cancelEvent(item.id)} done={refresh}>Cancel event</Command>}</>}
        {item.mine && <Attendance id={item.id} />}
      </article>)}
    </>}
    {claims && <>{!claims.claims.length && <p>No pending business claims.</p>}{claims.claims.map(item => <article className={styles.card} key={item.id}><h3>{item.organizationName}</h3><p>{item.personName}: {item.evidence}</p>{(["approved", "rejected"] as const).map(decision => <ActionForm key={decision} label={decision === "approved" ? "Approve claim" : "Reject claim"} fields={[{ name: "note", label: "Review note", optional: true }]} submit={d => actions.reviewBusinessClaim(item.id, decision, value(d, "note"))} done={refresh} />)}</article>)}</>}
    {introductions && <>
      <h3>Introductions</h3><ActionForm label="Request introduction" fields={[{ name: "person", label: "Member’s Collab account ID" }, { name: "message", label: "Reason for connecting" }, { name: "contact", label: "Contact to share after mutual acceptance" }]} submit={d => actions.requestIntroduction({ communityId, partyIds: [value(d, "person")], message: value(d, "message"), contact: value(d, "contact") })} done={refresh} />
      {!introductions.introductions.length && <p>No introductions yet.</p>}
      {introductions.introductions.filter(item => item.communityId === communityId).map(item => <article key={item.id} className={styles.card}><h4>{item.message || "Introduction"}</h4><p>{item.status} · {item.myConsent}</p>{item.participants.map(p => <p key={p.personId}>{p.name} · {p.consent}{p.contact && ` · ${p.contact}`}</p>)}
        {item.status === "pending" && item.myConsent === "pending" && <><ActionForm label="Accept and share contact" fields={[{ name: "contact", label: "Your contact" }]} submit={d => actions.respondToIntroduction(item.id, "accepted", value(d, "contact"))} done={refresh} /><Command run={() => actions.respondToIntroduction(item.id, "declined")} done={refresh}>Decline</Command></>}
        {item.mine && item.status === "pending" && <Command run={() => actions.withdrawIntroduction(item.id)} done={refresh}>Withdraw introduction</Command>}
      </article>)}
      <h3>Your connections</h3>{!connections?.connections.length && <p>Connections appear after both members accept an introduction.</p>}
      {connections?.connections.map(item => <article key={item.personId} className={styles.card}><h4>{item.name}</h4><PrivateNotes personId={item.personId} /><ActionForm label="Send referral" fields={[{ name: "need", label: "Business need" }, { name: "note", label: "Note", optional: true }]} submit={d => actions.createReferral({ communityId, toPersonId: item.personId, need: value(d, "need"), note: value(d, "note") })} done={refresh} /></article>)}
      <h3>Referrals</h3>
      {referrals && (() => { const items = referrals.referrals.filter(item => item.communityId === communityId); const sent = items.filter(item => item.direction === "given"); const won = sent.filter(item => item.status === "won"); return <p><strong>{sent.reduce((sum, item) => sum + item.points, 0)} points</strong> · {sent.length} sent · {won.length} won</p>; })()}
      {referrals?.referrals.filter(item => item.communityId === communityId).map(item => <article key={item.id} className={styles.card}><h4>{item.need}</h4><p>{item.fromName} → {item.toName} · {item.status === "not_won" ? "Not Won" : item.status[0].toUpperCase() + item.status.slice(1)} · {item.points} points to sender</p><p>{item.note}</p>{item.direction === "received" && item.status === "sent" && <><Command run={() => actions.updateReferralOutcome(item.id, "won")} done={refresh}>Won</Command><Command run={() => actions.updateReferralOutcome(item.id, "not_won")} done={refresh}>Not Won</Command></>}</article>)}
    </>}
  </>;
}
function Attendance({ id }: { id: string }) {
  const [text, setText] = useState("");
  return <><Command run={async () => { const result = await actions.loadEventAttendance(id); setText(result.attendees.map(a => `${a.name}: ${a.status}`).join("; ") || "No responses yet."); }} done={() => {}}>View private attendance</Command><p role="status">{text}</p></>;
}
function PrivateNotes({ personId }: { personId: string }) {
  const [notes, setNotes] = useState<Awaited<ReturnType<typeof actions.loadRelationshipNotes>>>();
  const refresh = async () => setNotes(await actions.loadRelationshipNotes(personId));
  return <details><summary>Your private notes</summary><Command run={refresh} done={() => {}}>Load notes</Command>{notes?.notes.map(note => <ActionForm key={note.id} label="Update note" fields={[{ name: "body", label: "Private note", value: note.body }]} submit={d => actions.updateRelationshipNote(note.id, value(d, "body"))} />)}<ActionForm label="Add private note" fields={[{ name: "body", label: "Private note" }]} submit={async d => { await actions.addRelationshipNote(personId, value(d, "body")); await refresh(); }} /></details>;
}
function Discussion({ kind, id, canReply = true }: { kind: "announcement" | "opportunity"; id: string; canReply?: boolean }) {
  const [comments, setComments] = useState<Awaited<ReturnType<typeof actions.loadAnnouncementComments>>>();
  const [responses, setResponses] = useState<Awaited<ReturnType<typeof actions.loadOpportunityResponses>>>();
  async function load() { if (kind === "announcement") setComments(await actions.loadAnnouncementComments(id)); else setResponses(await actions.loadOpportunityResponses(id)); }
  return <details><summary>{kind === "announcement" ? "Comments" : "Responses"}</summary><Command run={load} done={() => {}}>Load discussion</Command>
    {comments?.comments.map(item => <p key={item.id}>{item.authorName}: {item.body}</p>)}
    {responses?.responses.map(item => <div key={item.id}><p>{item.authorName}: {item.body} · {item.shared ? "Shared with community" : "Private to requester and responder"}</p>{item.mine && <Command run={async () => { await actions.shareOpportunityResponse(item.id, !item.shared); await load(); }} done={() => {}}>{item.shared ? "Make response private" : "Share response with community"}</Command>}</div>)}
    {canReply && <ActionForm label={kind === "announcement" ? "Post comment" : "Save private response"} fields={[{ name: "body", label: kind === "announcement" ? "Comment (visible to community)" : "Response (private unless you share it)", max: 10000 }]} submit={async d => { if (kind === "announcement") await actions.commentOnAnnouncement(id, value(d, "body")); else await actions.respondToOpportunity(id, value(d, "body")); await load(); }} />}
  </details>;
}
