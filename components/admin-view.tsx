"use client";

import { Fragment, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import type {
  Business,
  Comment,
  CommunityPost,
  Member,
  MembershipTier,
  Reaction,
  Referral,
  ReferralStatus,
  Rsvp,
  CommunityEvent,
  SupportRequest,
  UserRole
} from "@/lib/types";
import { eventTypeLabels, referralStatusLabels, supportStatuses, tierLabels } from "@/lib/types";
import { REFERRAL_SENT_POINTS, REFERRAL_WON_BONUS_POINTS } from "@/lib/referral-points";
import {
  buildCsv,
  canonicalSupportStatus,
  correctReferralStatus,
  duplicateEvent,
  filterModerationPosts,
  isStaleReferral,
  recordModerationAction,
  updateBusinessProfile,
  validateEventTiming,
  type ModerationFilter
} from "@/lib/admin-console";

// Best-effort unique id for records created in the admin console.
function newId(prefix: string): string {
  const rand = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
  return `${prefix}-${rand}`;
}

export type AdminTab = "reports" | "members" | "referrals" | "events" | "moderation" | "support" | "broadcast";
const ADMIN_TABS: { key: AdminTab; label: string }[] = [
  { key: "reports", label: "Reports" },
  { key: "members", label: "Members & businesses" },
  { key: "referrals", label: "Referral oversight" },
  { key: "events", label: "Event operations" },
  { key: "moderation", label: "Moderation" },
  { key: "support", label: "Support queue" },
  { key: "broadcast", label: "Broadcast" }
];

// ---------------------------------------------------------------------------
// Admin reports. Everything below is computed from the live app state so the
// numbers move as members use the app. The one exception is the membership
// growth trend, which is a sample series until the backend records join dates.
// ---------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;
const BROADCAST_DRAFT_KEY = "sbra.admin.broadcast-draft";

type RangeKey = "30" | "90" | "365";
const RANGES: { key: RangeKey; label: string }[] = [
  { key: "30", label: "30 days" },
  { key: "90", label: "90 days" },
  { key: "365", label: "12 months" }
];

// The directory has ~77 distinct free-text categories across 85 businesses, so a
// raw "by category" chart is a wall of 1s. Roll categories up into sectors.
const SECTORS: [string, RegExp][] = [
  ["Real estate & property", /real estate|realtor|property|mortgage|title|apartment/i],
  ["Finance & insurance", /account|bookkeep|tax|financ|insur|loan|funding|wealth|credit|bank|payroll|invest/i],
  ["Marketing & media", /market|media|advertis|design|brand|print|photo|video|web|seo|sign|promot/i],
  ["Health & wellness", /health|medical|dental|chiro|therap|wellness|fitness|care|hearing|derma|pharm|nutrition|massage|counsel/i],
  ["Home & trades", /construct|contract|roof|plumb|electric|hvac|landscap|clean|remodel|paint|floor|pest|restor|garage|window|lawn/i],
  ["Food & hospitality", /restaurant|cater|food|hospitality|hotel|cafe|coffee|bakery|brew|wine|event|venue|banquet/i],
  ["Technology", /\bit\b|tech|software|computer|managed service|cyber|telecom|network/i],
  ["Legal & consulting", /legal|law|attorney|consult|coach|\bhr\b|staffing|training|notary/i],
  ["Retail & auto", /retail|shop|store|auto|\bcar\b|apparel|boutique|dealer|jewel/i],
  ["Nonprofit & community", /non-?profit|community|chamber|church|education|school|foundation|youth/i]
];

function sectorFor(category: string): string {
  for (const [name, pattern] of SECTORS) {
    if (pattern.test(category)) return name;
  }
  return "Other services";
}

function countBy<T>(items: T[], key: (item: T) => string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(key(item), (counts.get(key(item)) ?? 0) + 1);
  return counts;
}

function pct(part: number, whole: number): number {
  return whole === 0 ? 0 : Math.round((part / whole) * 100);
}

function shortDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function toDateTimeLocal(ts?: number): string {
  if (!ts) return "";
  const date = new Date(ts);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(ts - offset).toISOString().slice(0, 16);
}

// Builds a CSV file from rows and hands it to the browser as a download.
function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = buildCsv(rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Some browsers begin consuming object URLs after the click task completes.
  // Revoking synchronously can turn a valid export into a silent no-op.
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

// ---------------------------------------------------------------------------
// Shared report chrome
// ---------------------------------------------------------------------------

function ReportCard({
  eyebrow,
  title,
  subtitle,
  onExport,
  children,
  footer
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  onExport?: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <section className="glass-panel report-card report">
      <header className="report-head">
        <div>
          <p className="section-label">{eyebrow}</p>
          <h3>{title}</h3>
          {subtitle && <p className="report-subtitle">{subtitle}</p>}
        </div>
        {onExport && (
          <button type="button" className="report-export" onClick={onExport} title="Download this report as CSV">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 3v12" />
              <path d="m7 10 5 5 5-5" />
              <path d="M4 21h16" />
            </svg>
            CSV
          </button>
        )}
      </header>
      <div className="report-body">{children}</div>
      {footer && <footer className="report-foot">{footer}</footer>}
    </section>
  );
}

function Legend({ items }: { items: { label: string; color: string; value?: string }[] }) {
  return (
    <ul className="chart-legend">
      {items.map((item) => (
        <li key={item.label}>
          <i style={{ background: item.color }} />
          <span>{item.label}</span>
          {item.value && <strong>{item.value}</strong>}
        </li>
      ))}
    </ul>
  );
}

const PALETTE = ["#001167", "#4869a8", "#b81a1f", "#e0b800", "#8fa3d6", "#6b6f8a"];

// ---------------------------------------------------------------------------
// Charts (inline SVG, no dependencies)
// ---------------------------------------------------------------------------

function Donut({
  segments,
  centerLabel,
  centerValue
}: {
  segments: { label: string; value: number; color: string }[];
  centerLabel: string;
  centerValue: string;
}) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  return (
    <svg viewBox="0 0 120 120" className="donut" role="img" aria-label={`${centerLabel}: ${centerValue}`}>
      <circle cx="60" cy="60" r={radius} fill="none" stroke="rgba(0,17,103,0.08)" strokeWidth="14" />
      {segments.map((segment) => {
        const length = total === 0 ? 0 : (segment.value / total) * circumference;
        const element = (
          <circle
            key={segment.label}
            cx="60"
            cy="60"
            r={radius}
            fill="none"
            stroke={segment.color}
            strokeWidth="14"
            strokeDasharray={`${length} ${circumference - length}`}
            strokeDashoffset={-offset}
            transform="rotate(-90 60 60)"
          />
        );
        offset += length;
        return element;
      })}
      <text x="60" y="56" textAnchor="middle" className="donut-value">
        {centerValue}
      </text>
      <text x="60" y="72" textAnchor="middle" className="donut-label">
        {centerLabel}
      </text>
    </svg>
  );
}

function ColumnChart({
  points,
  color = PALETTE[0],
  valueLabel
}: {
  points: { label: string; value: number }[];
  color?: string;
  valueLabel: (value: number) => string;
}) {
  const width = 320;
  const height = 130;
  const padTop = 18;
  const padBottom = 24;
  const max = Math.max(1, ...points.map((point) => point.value));
  const slot = width / points.length;
  const barWidth = Math.min(28, slot * 0.6);
  const usable = height - padTop - padBottom;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="column-chart" role="img" aria-label="Column chart">
      {[0.5, 1].map((step) => (
        <line
          key={step}
          x1="0"
          x2={width}
          y1={padTop + usable * (1 - step)}
          y2={padTop + usable * (1 - step)}
          stroke="rgba(0,17,103,0.08)"
          strokeDasharray="3 4"
        />
      ))}
      {points.map((point, index) => {
        const barHeight = (point.value / max) * usable;
        const x = index * slot + (slot - barWidth) / 2;
        const y = padTop + usable - barHeight;
        return (
          <g key={point.label}>
            <rect
              x={x}
              y={y}
              width={barWidth}
              height={Math.max(barHeight, point.value > 0 ? 3 : 0)}
              rx="5"
              fill={color}
              opacity={index === points.length - 1 ? 1 : 0.72}
            />
            {point.value > 0 && (
              <text x={x + barWidth / 2} y={y - 5} textAnchor="middle" className="chart-value">
                {valueLabel(point.value)}
              </text>
            )}
            <text x={x + barWidth / 2} y={height - 7} textAnchor="middle" className="chart-axis">
              {point.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function AreaChart({ points, color = PALETTE[0] }: { points: { label: string; value: number }[]; color?: string }) {
  const width = 320;
  const height = 130;
  const padTop = 16;
  const padBottom = 24;
  const padX = 10;
  const max = Math.max(1, ...points.map((point) => point.value));
  const min = Math.min(...points.map((point) => point.value));
  const usable = height - padTop - padBottom;
  const step = (width - padX * 2) / Math.max(1, points.length - 1);
  const coords = points.map((point, index) => {
    const x = padX + index * step;
    const y = padTop + usable - ((point.value - min) / Math.max(1, max - min)) * usable;
    return [x, y] as const;
  });
  const line = coords.map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${coords[coords.length - 1][0].toFixed(1)},${padTop + usable} L${padX},${padTop + usable} Z`;
  const last = coords[coords.length - 1];
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="area-chart" role="img" aria-label="Trend chart">
      <defs>
        <linearGradient id="area-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#area-fill)" />
      <path d={line} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r="4.5" fill="white" stroke={color} strokeWidth="2.5" />
      <text x={Math.min(last[0], width - 24)} y={last[1] - 10} textAnchor="middle" className="chart-value">
        {points[points.length - 1].value}
      </text>
      {points.map((point, index) =>
        index % 2 === 0 || index === points.length - 1 ? (
          <text key={point.label} x={coords[index][0]} y={height - 7} textAnchor="middle" className="chart-axis">
            {point.label}
          </text>
        ) : null
      )}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// The view
// ---------------------------------------------------------------------------

export function AdminView({
  businesses,
  members,
  referrals,
  events,
  rsvps,
  requests,
  posts,
  comments,
  reactions,
  importNote,
  adminNote,
  onAdminAction,
  onImport,
  currentMember,
  onUpdateMembers,
  onUpdateBusinesses,
  onUpdatePosts,
  onUpdateComments,
  onUpdateReactions,
  onUpdateRequests,
  onUpdateEvents,
  onUpdateRsvps,
  onUpdateReferrals,
  persistEnabled,
  onResetData,
  initialTab
}: {
  businesses: Business[];
  members: Member[];
  referrals: Referral[];
  events: CommunityEvent[];
  rsvps: Rsvp[];
  requests: SupportRequest[];
  posts: CommunityPost[];
  comments: Comment[];
  reactions: Reaction[];
  importNote: string;
  adminNote: string;
  onAdminAction: (note: string) => void;
  onImport: (file: File | undefined) => void;
  currentMember?: Member;
  onUpdateMembers: Dispatch<SetStateAction<Member[]>>;
  onUpdateBusinesses: Dispatch<SetStateAction<Business[]>>;
  onUpdatePosts: Dispatch<SetStateAction<CommunityPost[]>>;
  onUpdateComments: Dispatch<SetStateAction<Comment[]>>;
  onUpdateReactions: Dispatch<SetStateAction<Reaction[]>>;
  onUpdateRequests: Dispatch<SetStateAction<SupportRequest[]>>;
  onUpdateEvents: Dispatch<SetStateAction<CommunityEvent[]>>;
  onUpdateRsvps: Dispatch<SetStateAction<Rsvp[]>>;
  onUpdateReferrals: Dispatch<SetStateAction<Referral[]>>;
  persistEnabled: boolean;
  onResetData: () => void;
  initialTab?: AdminTab;
}) {
  const [tab, setTab] = useState<AdminTab>(initialTab ?? "reports");
  // Members tab focus filter: default to the pending queue when logging in with
  // approvals waiting, so the queue is the first thing an admin sees.
  const [memberFilter, setMemberFilter] = useState<"all" | "pending">(initialTab === "members" ? "pending" : "all");
  const [range, setRange] = useState<RangeKey>("90");

  useEffect(() => {
    if (!initialTab) return;
    setTab(initialTab);
    if (initialTab === "members") setMemberFilter("pending");
  }, [initialTab]);

  const now = Date.now();
  const rangeStart = now - Number(range) * DAY_MS;

  const memberById = useMemo(() => new Map(members.map((member) => [member.id, member])), [members]);
  const businessById = useMemo(() => new Map(businesses.map((business) => [business.id, business])), [businesses]);

  // --- Businesses by sector -------------------------------------------------
  const sectors = useMemo(() => {
    const counts = countBy(businesses, (business) => sectorFor(business.category));
    return [...counts.entries()].map(([sector, count]) => ({ sector, count })).sort((a, b) => b.count - a.count);
  }, [businesses]);
  const sectorMax = Math.max(1, ...sectors.map((entry) => entry.count));
  const distinctCategories = new Set(businesses.map((business) => business.category)).size;

  // --- Membership tiers -----------------------------------------------------
  const tiers = useMemo(() => {
    const counts = countBy(businesses, (business) => business.tier);
    return (Object.keys(tierLabels) as (keyof typeof tierLabels)[]).map((tier, index) => ({
      label: tierLabels[tier],
      value: counts.get(tier) ?? 0,
      color: PALETTE[index]
    }));
  }, [businesses]);

  // --- Referrals in range ---------------------------------------------------
  const rangedReferrals = referrals.filter((referral) => referral.createdAt >= rangeStart);
  const pipeline = {
    sent: rangedReferrals.length,
    won: rangedReferrals.filter((referral) => referral.status === "won").length,
    notWon: rangedReferrals.filter((referral) => referral.status === "not_won").length
  };
  const referralPoints = pipeline.sent * REFERRAL_SENT_POINTS + pipeline.won * REFERRAL_WON_BONUS_POINTS;
  const openReferrals = referrals.filter((referral) => referral.status === "sent");
  const staleReferrals = openReferrals.filter((referral) => isStaleReferral(referral, now));

  const weeklyReferrals = useMemo(() => {
    const weeks = 8;
    return Array.from({ length: weeks }, (_, index) => {
      const end = now - (weeks - 1 - index) * 7 * DAY_MS;
      const start = end - 7 * DAY_MS;
      const value = referrals.filter((referral) => referral.createdAt > start && referral.createdAt <= end).length;
      return { label: index === weeks - 1 ? "This wk" : `W-${weeks - 1 - index}`, value };
    });
  }, [referrals, now]);

  const topGivers = useMemo(() => {
    const stats = new Map<string, { sent: number; won: number; points: number }>();
    for (const referral of rangedReferrals) {
      const entry = stats.get(referral.giverId) ?? { sent: 0, won: 0, points: 0 };
      entry.sent += 1;
      entry.points += REFERRAL_SENT_POINTS;
      if (referral.status === "won") {
        entry.won += 1;
        entry.points += REFERRAL_WON_BONUS_POINTS;
      }
      stats.set(referral.giverId, entry);
    }
    return [...stats.entries()]
      .map(([giverId, entry]) => ({ giverId, ...entry }))
      .sort((a, b) => b.points - a.points || b.sent - a.sent)
      .slice(0, 5);
    // rangedReferrals is derived from referrals + range, which are the real inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [referrals, range]);

  // --- Events & attendance --------------------------------------------------
  const attendance = useMemo(
    () =>
      [...events]
        .sort((a, b) => a.startsAt - b.startsAt)
        .map((event) => {
          const responses = rsvps.filter((rsvp) => rsvp.eventId === event.id);
          const going = responses.filter((rsvp) => rsvp.status === "going").length;
          const maybe = responses.filter((rsvp) => rsvp.status === "maybe").length;
          const checkedIn = responses.filter((rsvp) => rsvp.checkedIn).length;
          return { event, going, maybe, checkedIn, fill: event.capacity ? pct(going, event.capacity) : null };
        }),
    [events, rsvps]
  );
  const scheduledEventCount = events.filter((event) => event.status !== "canceled").length;
  const totalGoing = attendance.filter((row) => row.event.status !== "canceled").reduce((sum, row) => sum + row.going, 0);

  // --- Support queue --------------------------------------------------------
  const openRequests = requests.filter((request) => canonicalSupportStatus(request.status) !== "Resolved");
  const supportByCategory = [...countBy(requests, (request) => request.category).entries()].sort((a, b) => b[1] - a[1]);

  // --- Community engagement -------------------------------------------------
  const reactionMix = (["celebrate", "support", "insightful"] as const).map((type, index) => ({
    label: type[0].toUpperCase() + type.slice(1),
    value: reactions.filter((reaction) => reaction.type === type).length,
    color: PALETTE[index]
  }));
  const engagementPerPost = posts.length === 0 ? "0" : ((comments.length + reactions.length) / posts.length).toFixed(1);
  const activeMembers = new Set([
    ...comments.map((comment) => comment.authorId),
    ...reactions.map((reaction) => reaction.memberId),
    ...rsvps.map((rsvp) => rsvp.memberId),
    ...referrals.map((referral) => referral.giverId)
  ]).size;

  // --- Profile completeness -------------------------------------------------
  const completeness = [
    { label: "Logo uploaded", value: businesses.filter((business) => business.logo).length },
    { label: "Website listed", value: businesses.filter((business) => business.website).length },
    { label: "Member offer published", value: businesses.filter((business) => business.memberOffer).length },
    { label: "Referral target defined", value: businesses.filter((business) => business.referralsWanted.trim()).length },
    { label: "Owner login claimed", value: members.filter((member) => member.isOwner).length }
  ].map((row) => ({ ...row, pct: pct(row.value, businesses.length) }));

  // --- Membership growth (sample trend until the backend records joins) -----
  const growth = useMemo(() => {
    const months = 12;
    const shape = [0.52, 0.55, 0.58, 0.63, 0.66, 0.71, 0.74, 0.8, 0.85, 0.9, 0.95, 1];
    return shape.map((factor, index) => {
      const date = new Date(now);
      date.setDate(1);
      date.setMonth(date.getMonth() - (months - 1 - index));
      return { label: date.toLocaleDateString(undefined, { month: "short" }), value: Math.round(businesses.length * factor) };
    });
  }, [businesses.length, now]);
  const growthFirst = growth[0].value;
  const growthLast = growth[growth.length - 1].value;

  const rangeLabel = RANGES.find((entry) => entry.key === range)?.label ?? "";

  // -------------------------------------------------------------------------
  // Operational tools (live mutations of app state). Persistence lands with the
  // backend swap; today these update the in-memory seed like the rest of the app.
  // -------------------------------------------------------------------------

  // Members & businesses ----------------------------------------------------
  const [memberQuery, setMemberQuery] = useState("");
  const [showAddMember, setShowAddMember] = useState(false);
  const [showAddBusiness, setShowAddBusiness] = useState(false);
  const [newMember, setNewMember] = useState({ name: "", title: "", email: "", phone: "", businessId: "" });
  const [newBusiness, setNewBusiness] = useState({ name: "", category: "", city: "Berks County, PA" });
  const [businessDraft, setBusinessDraft] = useState<Business | null>(null);

  const pendingCount = members.filter((member) => member.pending).length;
  const memberRows = useMemo(() => {
    const q = memberQuery.trim().toLowerCase();
    return members
      .map((member) => ({ member, business: businessById.get(member.businessId) }))
      .filter(({ member }) => memberFilter === "all" || member.pending)
      .filter(({ member, business }) =>
        !q ||
        `${member.name} ${member.email} ${member.title} ${business?.name ?? ""}`.toLowerCase().includes(q)
      )
      .sort((a, b) => Number(Boolean(b.member.pending)) - Number(Boolean(a.member.pending)) || a.member.name.localeCompare(b.member.name));
  }, [members, memberQuery, memberFilter, businessById]);

  function setMemberRole(memberId: string, role: UserRole) {
    onUpdateMembers((prev) => prev.map((member) => (member.id === memberId ? { ...member, role } : member)));
    onAdminAction(`Role updated to ${role}.`);
  }
  function toggleOwner(memberId: string) {
    onUpdateMembers((prev) => prev.map((member) => (member.id === memberId ? { ...member, isOwner: !member.isOwner } : member)));
  }
  function approveMember(memberId: string) {
    onUpdateMembers((prev) => prev.map((member) => (member.id === memberId ? { ...member, pending: false } : member)));
    onAdminAction("Member approved and activated.");
  }
  function removeMember(memberId: string) {
    const member = members.find((entry) => entry.id === memberId);
    if (!member) return;
    if (!window.confirm(`Remove ${member.name}? This cannot be undone.`)) return;
    onUpdateMembers((prev) => prev.filter((entry) => entry.id !== memberId));
    onAdminAction(`${member.name} removed.`);
  }
  function setTier(businessId: string, tier: MembershipTier) {
    onUpdateBusinesses((prev) => prev.map((business) => (business.id === businessId ? { ...business, tier } : business)));
    onAdminAction(`Membership tier set to ${tierLabels[tier]}.`);
  }
  function handleReset() {
    if (!window.confirm("Reset all demo data to the original seed? This clears every saved admin and member edit on this device.")) return;
    onResetData();
  }
  function addPendingMember() {
    const name = newMember.name.trim();
    if (!name || !newMember.businessId) {
      onAdminAction("A name and a business are required to add a member.");
      return;
    }
    const member: Member = {
      id: newId("mem"),
      businessId: newMember.businessId,
      name,
      title: newMember.title.trim() || "Team member",
      email: newMember.email.trim(),
      phone: newMember.phone.trim(),
      bio: "",
      isOwner: false,
      role: "member",
      pending: true
    };
    onUpdateMembers((prev) => [member, ...prev]);
    setNewMember({ name: "", title: "", email: "", phone: "", businessId: "" });
    setShowAddMember(false);
    onAdminAction(`${name} added to the approval queue.`);
  }

  function addBusiness() {
    const name = newBusiness.name.trim();
    if (!name) {
      onAdminAction("A business name is required.");
      return;
    }
    if (businesses.some((business) => business.name.localeCompare(name, undefined, { sensitivity: "base" }) === 0)) {
      onAdminAction(`${name} is already in the directory.`);
      return;
    }
    const business: Business = {
      id: newId("biz"),
      name,
      category: newBusiness.category.trim() || "Uncategorized",
      city: newBusiness.city.trim() || "Berks County, PA",
      description: "",
      servicesOffered: "",
      referralsWanted: "",
      website: "",
      address: "",
      tier: "solo"
    };
    onUpdateBusinesses((prev) => [...prev, business]);
    setNewMember((prev) => ({ ...prev, businessId: business.id }));
    setNewBusiness({ name: "", category: "", city: "Berks County, PA" });
    setShowAddBusiness(false);
    setShowAddMember(true);
    onAdminAction(`${name} added. Add a person to place the business in the approval queue.`);
  }

  function saveBusinessProfile() {
    if (!businessDraft) return;
    if (!businessDraft.name.trim()) {
      onAdminAction("A business name is required.");
      return;
    }
    const duplicate = businesses.some(
      (business) => business.id !== businessDraft.id && business.name.localeCompare(businessDraft.name, undefined, { sensitivity: "base" }) === 0
    );
    if (duplicate) {
      onAdminAction(`${businessDraft.name.trim()} is already in the directory.`);
      return;
    }
    const updated = updateBusinessProfile(businessById.get(businessDraft.id) ?? businessDraft, businessDraft);
    onUpdateBusinesses((prev) => prev.map((business) => business.id === updated.id ? updated : business));
    setBusinessDraft(updated);
    onAdminAction(`${updated.name} directory profile updated in this demo.`);
  }

  // Event operations -------------------------------------------------------
  const [eventDraft, setEventDraft] = useState<CommunityEvent | null>(null);
  const [expandedAttendanceId, setExpandedAttendanceId] = useState<string | null>(null);

  function saveEvent() {
    if (!eventDraft) return;
    const error = validateEventTiming(eventDraft.startsAt, eventDraft.endsAt);
    if (!eventDraft.title.trim()) {
      onAdminAction("An event title is required.");
      return;
    }
    if (error) {
      onAdminAction(error);
      return;
    }
    onUpdateEvents((prev) => prev.map((event) => event.id === eventDraft.id ? { ...eventDraft, title: eventDraft.title.trim() } : event));
    setEventDraft(null);
    onAdminAction(`${eventDraft.title.trim()} updated in the seed demo.`);
  }

  function cancelEvent(event: CommunityEvent) {
    if (!window.confirm(`Cancel ${event.title}? Members will see it as canceled and RSVP controls will be disabled.`)) return;
    onUpdateEvents((prev) => prev.map((entry) => entry.id === event.id ? { ...entry, status: "canceled" } : entry));
    onAdminAction(`${event.title} canceled. Existing attendance records were retained.`);
  }

  function duplicateSelectedEvent(event: CommunityEvent) {
    const nextStart = event.startsAt + 7 * DAY_MS;
    if (!window.confirm(`Duplicate ${event.title} one week later?`)) return;
    const duplicate = duplicateEvent(event, newId("event"), nextStart);
    onUpdateEvents((prev) => [...prev, duplicate]);
    onAdminAction(`${duplicate.title} created one week later. Use Edit to adjust its details.`);
  }

  function toggleCheckIn(eventId: string, memberId: string) {
    onUpdateRsvps((prev) => prev.map((rsvp) =>
      rsvp.eventId === eventId && rsvp.memberId === memberId ? { ...rsvp, checkedIn: !rsvp.checkedIn } : rsvp
    ));
    onAdminAction("Attendance check-in updated in the seed demo.");
  }

  // Referral oversight -----------------------------------------------------
  const [referralCorrection, setReferralCorrection] = useState<{ id: string; status: ReferralStatus; reason: string } | null>(null);

  function applyReferralCorrection() {
    if (!referralCorrection?.reason.trim()) return;
    const referral = referrals.find((entry) => entry.id === referralCorrection.id);
    if (!referral || referral.status === referralCorrection.status) return;
    const label = referralStatusLabels[referralCorrection.status];
    if (!window.confirm(`Correct this referral from ${referralStatusLabels[referral.status]} to ${label}? This will add an audit note.`)) return;
    const at = Date.now();
    onUpdateReferrals((prev) => prev.map((entry) => entry.id === referral.id
      ? correctReferralStatus(entry, referralCorrection.status, currentMember?.name ?? "SBRA admin", at, referralCorrection.reason)
      : entry));
    setReferralCorrection(null);
    onAdminAction(`Referral status corrected to ${label}; a privacy-safe audit note was recorded.`);
  }

  // Moderation --------------------------------------------------------------
  const commentsByPost = useMemo(() => {
    const map = new Map<string, Comment[]>();
    for (const comment of comments) {
      const list = map.get(comment.postId) ?? [];
      list.push(comment);
      map.set(comment.postId, list);
    }
    return map;
  }, [comments]);
  const [moderationFilter, setModerationFilter] = useState<ModerationFilter>("all");
  const [moderationQuery, setModerationQuery] = useState("");
  const [moderationReasons, setModerationReasons] = useState<Record<string, string>>({});
  const [deletedModerationHistory, setDeletedModerationHistory] = useState<{
    at: number; actor: string; target: string; reason: string;
  }[]>([]);
  const moderatedPosts = useMemo(
    () => filterModerationPosts(posts, moderationFilter, moderationQuery),
    [posts, moderationFilter, moderationQuery]
  );

  function togglePostHidden(postId: string) {
    const post = posts.find((entry) => entry.id === postId);
    const reason = (moderationReasons[postId] ?? "").trim();
    if (!post || !reason) {
      onAdminAction("Add a moderation reason before changing visibility.");
      return;
    }
    const action = post.hidden ? "restored" : "hidden";
    if (!window.confirm(`${action === "hidden" ? "Hide" : "Restore"} ${post.author}'s post for: ${reason}?`)) return;
    onUpdatePosts((prev) => prev.map((entry) => entry.id === postId
      ? recordModerationAction(entry, action, reason, currentMember?.name ?? "SBRA admin", Date.now())
      : entry));
    setModerationReasons((prev) => ({ ...prev, [postId]: "" }));
    onAdminAction(`Post ${action}; reason added to its moderation history.`);
  }
  function deletePost(postId: string) {
    const post = posts.find((entry) => entry.id === postId);
    const reason = (moderationReasons[postId] ?? "").trim();
    if (!post || !reason) {
      onAdminAction("Add a moderation reason before deleting a post.");
      return;
    }
    if (!window.confirm(`Delete ${post.author}'s post and its comments and reactions for: ${reason}? This cannot be undone.`)) return;
    onUpdatePosts((prev) => prev.filter((post) => post.id !== postId));
    onUpdateComments((prev) => prev.filter((comment) => comment.postId !== postId));
    onUpdateReactions((prev) => prev.filter((reaction) => reaction.postId !== postId));
    setDeletedModerationHistory((prev) => [{ at: Date.now(), actor: currentMember?.name ?? "SBRA admin", target: `${post.author}: ${post.body.slice(0, 80)}`, reason }, ...prev]);
    onAdminAction("Post removed; a session-only deletion record was retained.");
  }
  function deleteComment(commentId: string) {
    const comment = comments.find((entry) => entry.id === commentId);
    if (!comment) return;
    const reason = window.prompt(`Reason for deleting ${comment.authorName}'s comment:`)?.trim();
    if (!reason || !window.confirm(`Delete ${comment.authorName}'s comment for: ${reason}? This cannot be undone.`)) return;
    onUpdateComments((prev) => prev.filter((comment) => comment.id !== commentId));
    onUpdatePosts((prev) =>
      prev.map((post) => {
        const owns = comments.find((comment) => comment.id === commentId)?.postId === post.id;
        return owns ? { ...post, comments: Math.max(0, post.comments - 1) } : post;
      })
    );
    setDeletedModerationHistory((prev) => [{ at: Date.now(), actor: currentMember?.name ?? "SBRA admin", target: `${comment.authorName} comment: ${comment.body.slice(0, 80)}`, reason }, ...prev]);
    onAdminAction("Comment removed; a session-only deletion record was retained.");
  }

  // Support queue -----------------------------------------------------------
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  function setRequestStatus(id: string, status: string) {
    onUpdateRequests((prev) =>
      prev.map((request) =>
        request.id === id
          ? { ...request, status, resolvedAt: /resolved|closed/i.test(status) ? Date.now() : undefined }
          : request
      )
    );
  }
  function sendReply(id: string) {
    const reply = (replyDrafts[id] ?? "").trim();
    if (!reply) return;
    onUpdateRequests((prev) => prev.map((request) => (request.id === id ? { ...request, adminReply: reply } : request)));
    setReplyDrafts((drafts) => ({ ...drafts, [id]: "" }));
    onAdminAction("Reply sent to the member.");
  }

  // Broadcast ---------------------------------------------------------------
  const [broadcastBody, setBroadcastBody] = useState("");
  const [broadcastPinned, setBroadcastPinned] = useState(false);

  useEffect(() => {
    if (!persistEnabled) return;
    try {
      const stored = window.localStorage.getItem(BROADCAST_DRAFT_KEY);
      if (stored) setBroadcastBody(stored);
    } catch {
      // Storage is best effort in the seed demo.
    }
  }, [persistEnabled]);

  function saveBroadcastDraft() {
    if (!broadcastBody.trim() || !persistEnabled) return;
    try {
      window.localStorage.setItem(BROADCAST_DRAFT_KEY, broadcastBody);
      onAdminAction("Announcement draft saved on this device.");
    } catch {
      onAdminAction("This browser could not save the announcement draft.");
    }
  }

  function clearBroadcastDraft() {
    setBroadcastBody("");
    try { window.localStorage.removeItem(BROADCAST_DRAFT_KEY); } catch { /* best effort */ }
    onAdminAction("Announcement draft cleared.");
  }

  function postBroadcast() {
    const body = broadcastBody.trim();
    if (!body) return;
    if (!window.confirm(`Publish this announcement to all members in the current SBRA community${broadcastPinned ? " and pin it to the top of the feed" : ""}?`)) return;
    const post: CommunityPost = {
      id: newId("post"),
      authorId: currentMember?.id,
      author: currentMember?.name ?? "SBRA Team",
      businessName: "Berks County Collab",
      timeAgo: "Just now",
      category: "Announcement",
      tone: "blue",
      body,
      reactions: 0,
      comments: 0,
      createdAt: Date.now(),
      pinned: broadcastPinned
    };
    onUpdatePosts((prev) => [post, ...prev]);
    setBroadcastBody("");
    try { window.localStorage.removeItem(BROADCAST_DRAFT_KEY); } catch { /* best effort */ }
    onAdminAction(broadcastPinned ? "Announcement posted and pinned to the feed." : "Announcement posted to the feed.");
  }

  function exportSummary() {
    downloadCsv("sbra-admin-summary.csv", [
      ["Metric", "Value", "Range"],
      ["Member businesses", businesses.length, "all time"],
      ["People", members.length, "all time"],
      ["Referrals sent", pipeline.sent, rangeLabel],
      ["Referrals won", pipeline.won, rangeLabel],
      ["Referral points", referralPoints, rangeLabel],
      ["Open support requests", openRequests.length, "now"],
      ["Event RSVPs (going)", totalGoing, "all events"],
      ["Active members", activeMembers, "all time"]
    ]);
    onAdminAction("Admin summary exported as CSV.");
  }

  return (
    <section className="admin-view">
      <div className="glass-panel admin-tabs" role="tablist" aria-label="Admin sections">
        {ADMIN_TABS.map((entry) => (
          <button
            key={entry.key}
            role="tab"
            aria-selected={tab === entry.key}
            className={tab === entry.key ? "admin-tab active" : "admin-tab"}
            onClick={() => setTab(entry.key)}
          >
            {entry.label}
            {entry.key === "members" && pendingCount > 0 && <span className="admin-tab-badge">{pendingCount}</span>}
            {entry.key === "support" && openRequests.length > 0 && <span className="admin-tab-badge">{openRequests.length}</span>}
          </button>
        ))}
      </div>

      {pendingCount > 0 && tab !== "members" && (
        <div className="glass-panel admin-approval-banner" role="status">
          <span className="admin-approval-icon" aria-hidden="true">👋</span>
          <div>
            <strong>{pendingCount} member{pendingCount === 1 ? "" : "s"} awaiting approval</strong>
            <small>New logins need review before they can access the community.</small>
          </div>
          <button
            type="button"
            className="primary-button"
            onClick={() => { setTab("members"); setMemberFilter("pending"); }}
          >
            Review queue
          </button>
        </div>
      )}

      {tab === "reports" && (
    <>
      <div className="glass-panel reports-toolbar">
        <div>
          <p className="section-label">Admin tools</p>
          <h2>Reports &amp; insights</h2>
          <p className="report-subtitle">Live numbers from the directory, referrals, events, support, and community feed.</p>
        </div>
        <div className="reports-controls">
          <div className="range-toggle" role="group" aria-label="Report time range">
            {RANGES.map((entry) => (
              <button
                key={entry.key}
                type="button"
                className={entry.key === range ? "active" : ""}
                aria-pressed={entry.key === range}
                onClick={() => setRange(entry.key)}
              >
                {entry.label}
              </button>
            ))}
          </div>
          <button type="button" className="secondary-button" onClick={() => window.print()}>
            Print
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={exportSummary}
          >
            Export summary
          </button>
        </div>
      </div>

      <div className="metric-grid">
        <article className="glass-panel metric">
          <span>Member businesses</span>
          <strong>{businesses.length}</strong>
          <p>
            {distinctCategories} categories · {sectors.length} sectors
          </p>
        </article>
        <article className="glass-panel metric">
          <span>People</span>
          <strong>{members.length}</strong>
          <p>{activeMembers} active in referrals, events, or feed</p>
        </article>
        <article className="glass-panel metric">
          <span>Referrals · {rangeLabel}</span>
          <strong>{pipeline.sent}</strong>
          <p>
            {pipeline.won} won · {referralPoints} points
          </p>
        </article>
        <article className="glass-panel metric">
          <span>Support queue</span>
          <strong>{openRequests.length}</strong>
          <p>
            {requests.length - openRequests.length} resolved · {staleReferrals.length} stale referral
            {staleReferrals.length === 1 ? "" : "s"}
          </p>
        </article>
      </div>

      <div className="report-grid">
        <ReportCard
          eyebrow="Directory"
          title="Businesses by sector"
          subtitle={`${distinctCategories} member-entered categories rolled up into ${sectors.length} sectors`}
          onExport={() =>
            downloadCsv("businesses-by-sector.csv", [
              ["Sector", "Businesses", "Share"],
              ...sectors.map((entry) => [entry.sector, entry.count, `${pct(entry.count, businesses.length)}%`])
            ])
          }
          footer={
            <span>
              Largest sector: <strong>{sectors[0]?.sector}</strong> at {pct(sectors[0]?.count ?? 0, businesses.length)}% of the
              directory.
            </span>
          }
        >
          <div className="sector-bars">
            {sectors.map((entry, index) => (
              <div className="sector-row" key={entry.sector}>
                <span className="sector-label" title={entry.sector}>
                  {entry.sector}
                </span>
                <div className="sector-track">
                  <i
                    style={{
                      width: `${Math.round((entry.count / sectorMax) * 100)}%`,
                      background: PALETTE[index % PALETTE.length]
                    }}
                  />
                </div>
                <strong>{entry.count}</strong>
                <small>{pct(entry.count, businesses.length)}%</small>
              </div>
            ))}
          </div>
        </ReportCard>

        <ReportCard
          eyebrow="Membership"
          title="Growth trend"
          subtitle="Member businesses on the roster, by month"
          onExport={() =>
            downloadCsv("membership-growth.csv", [
              ["Month", "Member businesses"],
              ...growth.map((point) => [point.label, point.value])
            ])
          }
          footer={
            <span className="report-note">
              Sample trend until the backend records join dates. The final point is the live count.
            </span>
          }
        >
          <AreaChart points={growth} />
          <div className="stat-row">
            <div>
              <small>Net new · 12 mo</small>
              <strong>+{growthLast - growthFirst}</strong>
            </div>
            <div>
              <small>Growth</small>
              <strong>{pct(growthLast - growthFirst, growthFirst)}%</strong>
            </div>
            <div>
              <small>Avg / month</small>
              <strong>{((growthLast - growthFirst) / 11).toFixed(1)}</strong>
            </div>
          </div>
        </ReportCard>

        <ReportCard
          eyebrow={`Referrals · ${rangeLabel}`}
          title="Referral outcomes"
          subtitle="Sent referrals with a simple Won or Not Won result"
          onExport={() =>
            downloadCsv("referral-pipeline.csv", [
              ["Stage", "Count"],
              ["Sent", pipeline.sent],
              ["Won", pipeline.won],
              ["Not Won", pipeline.notWon],
              ["Points", referralPoints]
            ])
          }
          footer={
            <span>
              Win rate <strong>{pct(pipeline.won, pipeline.sent)}%</strong> · Points earned <strong>{referralPoints}</strong>
            </span>
          }
        >
          <div className="funnel">
            {[
              { label: "Sent", value: pipeline.sent, color: PALETTE[0] },
              { label: "Won", value: pipeline.won, color: PALETTE[3] },
              { label: "Not Won", value: pipeline.notWon, color: PALETTE[2] }
            ].map((stage) => (
              <div className="funnel-stage" key={stage.label}>
                <span>{stage.label}</span>
                <div className="funnel-track">
                  <i
                    style={{
                      width: `${Math.max(pipeline.sent ? (stage.value / pipeline.sent) * 100 : 0, stage.value ? 6 : 0)}%`,
                      background: stage.color
                    }}
                  />
                </div>
                <strong>{stage.value}</strong>
                <small>{pct(stage.value, pipeline.sent)}%</small>
              </div>
            ))}
          </div>
        </ReportCard>

        <ReportCard
          eyebrow="Referrals"
          title="Weekly referral activity"
          subtitle="New referrals sent per week, last 8 weeks"
          onExport={() =>
            downloadCsv("weekly-referrals.csv", [
              ["Week", "Referrals"],
              ...weeklyReferrals.map((point) => [point.label, point.value])
            ])
          }
          footer={
            <span>
              {openReferrals.length} open · {staleReferrals.length} waiting 7+ days without an update
            </span>
          }
        >
          <ColumnChart points={weeklyReferrals} valueLabel={(value) => String(value)} />
        </ReportCard>

        <ReportCard
          eyebrow="Events"
          title="Attendance & capacity"
          subtitle={`${events.length} scheduled · ${totalGoing} going`}
          onExport={() =>
            downloadCsv("event-attendance.csv", [
              ["Event", "Date", "Type", "Going", "Maybe", "Checked in", "Capacity"],
              ...attendance.map((row) => [
                row.event.title,
                shortDate(row.event.startsAt),
                row.event.type,
                row.going,
                row.maybe,
                row.checkedIn,
                row.event.capacity ?? ""
              ])
            ])
          }
        >
          <div className="attendance-list">
            {attendance.map((row) => (
              <div className="attendance-row" key={row.event.id}>
                <div className="attendance-date">
                  <strong>{new Date(row.event.startsAt).getDate()}</strong>
                  <small>{new Date(row.event.startsAt).toLocaleDateString(undefined, { month: "short" })}</small>
                </div>
                <div className="attendance-body">
                  <strong>{row.event.title}</strong>
                  <small>
                    {row.event.type.replace(/_/g, " ")} · {row.event.venueName}
                  </small>
                  <div className="attendance-track">
                    <i style={{ width: `${row.fill ?? Math.min(100, row.going * 12)}%` }} />
                  </div>
                </div>
                <div className="attendance-stats">
                  <strong>{row.going}</strong>
                  <small>going{row.maybe ? ` · ${row.maybe} maybe` : ""}</small>
                  {row.event.capacity && (
                    <em>
                      {row.fill}% of {row.event.capacity}
                    </em>
                  )}
                </div>
              </div>
            ))}
          </div>
        </ReportCard>

        <ReportCard
          eyebrow="Support"
          title="Support queue"
          subtitle={`${openRequests.length} open · ${requests.length - openRequests.length} resolved`}
          onExport={() =>
            downloadCsv("support-requests.csv", [
              ["Title", "Category", "Status"],
              ...requests.map((request) => [request.title, request.category, request.status])
            ])
          }
          footer={
            <Legend
              items={supportByCategory.map(([category, count], index) => ({
                label: category,
                color: PALETTE[index % PALETTE.length],
                value: String(count)
              }))}
            />
          }
        >
          <ul className="queue-list">
            {requests.map((request) => {
              const resolved = /resolved|closed/i.test(request.status);
              return (
                <li key={request.id} className={resolved ? "queue-row resolved" : "queue-row"}>
                  <span className={resolved ? "queue-dot done" : "queue-dot"} aria-hidden="true" />
                  <div>
                    <strong>{request.title}</strong>
                    <small>{request.category}</small>
                  </div>
                  <span className="queue-status">{request.status}</span>
                </li>
              );
            })}
          </ul>
        </ReportCard>

        <ReportCard
          eyebrow="Community"
          title="Feed engagement"
          subtitle={`${posts.length} posts · ${comments.length} comments · ${reactions.length} reactions`}
          onExport={() =>
            downloadCsv("feed-engagement.csv", [
              ["Post", "Author", "Category", "Reactions", "Comments"],
              ...posts.map((post) => [
                post.body.slice(0, 80),
                post.author,
                post.category,
                reactions.filter((reaction) => reaction.postId === post.id).length,
                comments.filter((comment) => comment.postId === post.id).length
              ])
            ])
          }
        >
          <div className="donut-layout">
            <Donut segments={reactionMix} centerLabel="reactions" centerValue={String(reactions.length)} />
            <div>
              <Legend items={reactionMix.map((segment) => ({ ...segment, value: String(segment.value) }))} />
              <div className="stat-row compact">
                <div>
                  <small>Per post</small>
                  <strong>{engagementPerPost}</strong>
                </div>
                <div>
                  <small>Commenters</small>
                  <strong>{new Set(comments.map((comment) => comment.authorId)).size}</strong>
                </div>
              </div>
            </div>
          </div>
        </ReportCard>

        <ReportCard
          eyebrow="Membership"
          title="Plan mix"
          subtitle="Businesses by membership tier"
          onExport={() =>
            downloadCsv("plan-mix.csv", [["Tier", "Businesses"], ...tiers.map((tier) => [tier.label, tier.value])])
          }
        >
          <div className="donut-layout">
            <Donut segments={tiers} centerLabel="businesses" centerValue={String(businesses.length)} />
            <Legend
              items={tiers.map((tier) => ({ ...tier, value: `${tier.value} · ${pct(tier.value, businesses.length)}%` }))}
            />
          </div>
        </ReportCard>

        <ReportCard
          eyebrow="Directory quality"
          title="Profile completeness"
          subtitle="Share of businesses with each field filled in"
          onExport={() =>
            downloadCsv("profile-completeness.csv", [
              ["Field", "Businesses", "Share"],
              ...completeness.map((row) => [row.label, row.value, `${row.pct}%`])
            ])
          }
        >
          <div className="completeness">
            {completeness.map((row) => (
              <div className="completeness-row" key={row.label}>
                <span>{row.label}</span>
                <div className="completeness-track">
                  <i style={{ width: `${row.pct}%` }} className={row.pct < 50 ? "low" : ""} />
                </div>
                <strong>{row.pct}%</strong>
              </div>
            ))}
          </div>
        </ReportCard>

        <ReportCard
          eyebrow={`Referrals · ${rangeLabel}`}
          title="Top Connectors"
          subtitle="Members earning the most referral points"
          onExport={() =>
            downloadCsv("top-givers.csv", [
              ["Member", "Business", "Sent", "Won", "Points"],
              ...topGivers.map((row) => {
                const member = memberById.get(row.giverId);
                return [
                  member?.name ?? row.giverId,
                  businessById.get(member?.businessId ?? "")?.name ?? "",
                  row.sent,
                  row.won,
                  row.points
                ];
              })
            ])
          }
        >
          {topGivers.length === 0 ? (
            <p className="report-empty">No referrals in this range yet.</p>
          ) : (
            <table className="report-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Member</th>
                      <th>Sent</th>
                  <th>Won</th>
                      <th>Points</th>
                </tr>
              </thead>
              <tbody>
                {topGivers.map((row, index) => {
                  const member = memberById.get(row.giverId);
                  return (
                    <tr key={row.giverId}>
                      <td>
                        <span className={`rank-badge rank-${index + 1}`}>{index + 1}</span>
                      </td>
                      <td>
                        <strong>{member?.name ?? "Member"}</strong>
                        <small>{businessById.get(member?.businessId ?? "")?.name ?? ""}</small>
                      </td>
                      <td>{row.sent}</td>
                      <td>{row.won}</td>
                      <td>{row.points}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </ReportCard>
      </div>
    </>
      )}

      {tab === "members" && (
        <div className="admin-panel">
          <div className="glass-panel admin-panel-head">
            <div>
              <p className="section-label">Roster</p>
              <h3>Members &amp; businesses</h3>
              <p className="report-subtitle">
                {members.length} people · {businesses.length} businesses
                {pendingCount > 0 ? ` · ${pendingCount} awaiting approval` : ""}
              </p>
            </div>
            <div className="admin-panel-actions">
              <div className="admin-filter" role="group" aria-label="Filter members">
                <button
                  type="button"
                  className={memberFilter === "all" ? "active" : ""}
                  aria-pressed={memberFilter === "all"}
                  onClick={() => setMemberFilter("all")}
                >
                  All
                </button>
                <button
                  type="button"
                  className={memberFilter === "pending" ? "active" : ""}
                  aria-pressed={memberFilter === "pending"}
                  onClick={() => setMemberFilter("pending")}
                >
                  Pending{pendingCount > 0 ? ` (${pendingCount})` : ""}
                </button>
              </div>
              <input
                className="admin-search"
                type="search"
                placeholder="Search people or businesses…"
                value={memberQuery}
                onChange={(event) => setMemberQuery(event.target.value)}
              />
              <button type="button" className="primary-button" onClick={() => setShowAddMember((open) => !open)}>
                {showAddMember ? "Close" : "Add member"}
              </button>
              <button type="button" className="secondary-button" onClick={() => setShowAddBusiness((open) => !open)}>
                {showAddBusiness ? "Close business form" : "Add business"}
              </button>
              <label className="secondary-button file-inline">
                Import roster
                <input type="file" accept=".csv,.xlsx,.xls" onChange={(event) => onImport(event.target.files?.[0])} />
              </label>
              <button type="button" className="secondary-button" onClick={handleReset}>
                Reset demo data
              </button>
            </div>
          </div>
          <div className="glass-panel import-note admin-inline-note admin-persist-note">
            {persistEnabled
              ? "Changes are saved to this device (localStorage) and survive a refresh. “Reset demo data” restores the seed."
              : "A live backend is connected — changes are saved there, not to this device."}
          </div>
          {importNote && <div className="glass-panel import-note admin-inline-note">{importNote}</div>}

          <div className="glass-panel admin-add-form">
            <div className="admin-add-actions">
              <label>
                <span>Maintain a business profile</span>
                <select
                  value={businessDraft?.id ?? ""}
                  onChange={(event) => setBusinessDraft(businessById.get(event.target.value) ? { ...businessById.get(event.target.value)! } : null)}
                >
                  <option value="">Choose a business…</option>
                  {[...businesses].sort((a, b) => a.name.localeCompare(b.name)).map((business) => (
                    <option key={business.id} value={business.id}>{business.name}</option>
                  ))}
                </select>
              </label>
              <span className="report-note">Edits the shared directory organization profile in this seed demo, not private community membership fields.</span>
            </div>
            {businessDraft && (
              <>
                <div className="admin-add-grid">
                  {([
                    ["name", "Business name"], ["category", "Category"], ["website", "Website"],
                    ["address", "Address"], ["city", "City or service area"], ["servicesOffered", "Services offered"],
                    ["referralsWanted", "Ideal referrals"], ["description", "Description"]
                  ] as const).map(([field, label]) => (
                    <label key={field} className={field === "description" ? "wide" : undefined}>
                      <span>{label}</span>
                      {field === "description" ? (
                        <textarea value={businessDraft[field]} onChange={(event) => setBusinessDraft((draft) => draft ? { ...draft, [field]: event.target.value } : draft)} />
                      ) : (
                        <input value={businessDraft[field]} onChange={(event) => setBusinessDraft((draft) => draft ? { ...draft, [field]: event.target.value } : draft)} />
                      )}
                    </label>
                  ))}
                </div>
                <div className="admin-add-actions">
                  <button type="button" className="primary-button" onClick={saveBusinessProfile} disabled={!persistEnabled || !businessDraft.name.trim()}>Save profile</button>
                  {!persistEnabled && <span className="report-note">Disabled: the live backend needs an authorized organization-profile mutation and audit trail.</span>}
                </div>
              </>
            )}
          </div>

          {showAddBusiness && (
            <div className="glass-panel admin-add-form">
              <div className="admin-add-grid">
                <label>
                  <span>Business name*</span>
                  <input value={newBusiness.name} onChange={(event) => setNewBusiness((prev) => ({ ...prev, name: event.target.value }))} />
                </label>
                <label>
                  <span>Category</span>
                  <input value={newBusiness.category} onChange={(event) => setNewBusiness((prev) => ({ ...prev, category: event.target.value }))} />
                </label>
                <label>
                  <span>City or service area</span>
                  <input value={newBusiness.city} onChange={(event) => setNewBusiness((prev) => ({ ...prev, city: event.target.value }))} />
                </label>
              </div>
              <div className="admin-add-actions">
                <span className="report-note">Creates the organization first, then opens the person form to complete the membership.</span>
                <button type="button" className="primary-button" onClick={addBusiness} disabled={!newBusiness.name.trim()}>
                  Add business
                </button>
              </div>
            </div>
          )}

          {showAddMember && (
            <div className="glass-panel admin-add-form">
              <div className="admin-add-grid">
                <label>
                  <span>Name*</span>
                  <input value={newMember.name} onChange={(event) => setNewMember((prev) => ({ ...prev, name: event.target.value }))} />
                </label>
                <label>
                  <span>Business*</span>
                  <select value={newMember.businessId} onChange={(event) => setNewMember((prev) => ({ ...prev, businessId: event.target.value }))}>
                    <option value="">Select a business…</option>
                    {[...businesses].sort((a, b) => a.name.localeCompare(b.name)).map((business) => (
                      <option key={business.id} value={business.id}>{business.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Title</span>
                  <input value={newMember.title} onChange={(event) => setNewMember((prev) => ({ ...prev, title: event.target.value }))} />
                </label>
                <label>
                  <span>Email</span>
                  <input type="email" value={newMember.email} onChange={(event) => setNewMember((prev) => ({ ...prev, email: event.target.value }))} />
                </label>
                <label>
                  <span>Phone</span>
                  <input value={newMember.phone} onChange={(event) => setNewMember((prev) => ({ ...prev, phone: event.target.value }))} />
                </label>
              </div>
              <div className="admin-add-actions">
                <span className="report-note">New members join the approval queue as “pending”.</span>
                <button type="button" className="primary-button" onClick={addPendingMember}>Add to queue</button>
              </div>
            </div>
          )}

          <div className="glass-panel report-card">
            <div className="table-scroll">
              <table className="report-table admin-table">
                <thead>
                  <tr>
                    <th>Person</th>
                    <th>Business</th>
                    <th>Tier</th>
                    <th>Role</th>
                    <th>Owner</th>
                    <th>Status</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {memberRows.map(({ member, business }) => (
                    <tr key={member.id} className={member.pending ? "row-pending" : ""}>
                      <td>
                        <strong>{member.name}</strong>
                        <small>{member.title}{member.email ? ` · ${member.email}` : ""}</small>
                      </td>
                      <td>{business?.name ?? <em>Unassigned</em>}</td>
                      <td>
                        {business ? (
                          <select
                            className="admin-select"
                            aria-label={`Membership tier for ${business.name}`}
                            value={business.tier}
                            onChange={(event) => setTier(business.id, event.target.value as MembershipTier)}
                          >
                            {(Object.keys(tierLabels) as MembershipTier[]).map((tier) => (
                              <option key={tier} value={tier}>{tierLabels[tier]}</option>
                            ))}
                          </select>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>
                        <select
                          className="admin-select"
                          aria-label={`Community role for ${member.name}`}
                          value={member.role ?? "member"}
                          onChange={(event) => setMemberRole(member.id, event.target.value as UserRole)}
                        >
                          <option value="member">Member</option>
                          <option value="staff">Staff</option>
                          <option value="admin">Admin</option>
                        </select>
                      </td>
                      <td>
                        <input
                          type="checkbox"
                          checked={member.isOwner}
                          onChange={() => toggleOwner(member.id)}
                          aria-label={`Mark ${member.name} as owner`}
                        />
                      </td>
                      <td>
                        {member.pending ? <span className="admin-badge pending">Pending</span> : <span className="admin-badge active">Active</span>}
                      </td>
                      <td className="admin-row-actions">
                        {member.pending && (
                          <button type="button" className="mini-button approve" aria-label={`Approve ${member.name}`} onClick={() => approveMember(member.id)}>Approve</button>
                        )}
                        <button type="button" className="mini-button danger" aria-label={`Remove ${member.name}`} onClick={() => removeMember(member.id)}>Remove</button>
                      </td>
                    </tr>
                  ))}
                  {memberRows.length === 0 && (
                    <tr>
                      <td colSpan={7} className="report-empty">
                        {memberFilter === "pending"
                          ? "No members awaiting approval. You're all caught up."
                          : `No people match “${memberQuery}”.`}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="import-note admin-tool-note">{adminNote}</div>
          </div>
        </div>
      )}

      {tab === "referrals" && (
        <div className="admin-panel">
          <div className="glass-panel admin-panel-head">
            <div>
              <p className="section-label">Relationship operations</p>
              <h3>Referral oversight</h3>
              <p className="report-subtitle">
                {openReferrals.length} open · {staleReferrals.length} waiting 7+ days · {pipeline.won} won in {rangeLabel.toLowerCase()}
              </p>
            </div>
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                downloadCsv("referral-oversight.csv", [
                  ["Created", "From", "To", "Kind", "Status", "Needs follow-up", "Last admin correction"],
                  ...referrals.map((referral) => [
                    new Date(referral.createdAt).toISOString(),
                    memberById.get(referral.giverId)?.name ?? "Unknown person",
                    memberById.get(referral.receiverId)?.name ?? "Unknown person",
                    referral.kind === "intro" ? "Introduction" : "Lead",
                    referralStatusLabels[referral.status],
                    isStaleReferral(referral, now) ? "Yes" : "No",
                    referral.adminAudit?.at(-1)?.note ?? ""
                  ])
                ]);
                onAdminAction("Referral oversight exported as CSV.");
              }}
            >
              Export referrals
            </button>
          </div>
          <div className="glass-panel report-card">
            <div className="table-scroll">
              <table className="report-table admin-table">
                <thead>
                  <tr><th>Created</th><th>From</th><th>To</th><th>Kind</th><th>Status</th><th>Follow-up</th><th>Admin correction</th></tr>
                </thead>
                <tbody>
                  {[...referrals].sort((a, b) => b.createdAt - a.createdAt).map((referral) => {
                    const giver = memberById.get(referral.giverId);
                    const receiver = memberById.get(referral.receiverId);
                    const stale = isStaleReferral(referral, now);
                    return (
                      <tr key={referral.id} className={stale ? "row-pending" : ""}>
                        <td>{shortDate(referral.createdAt)}</td>
                        <td><strong>{giver?.name ?? "Unknown person"}</strong><small>{giver ? businessById.get(giver.businessId)?.name : ""}</small></td>
                        <td><strong>{receiver?.name ?? "Unknown person"}</strong><small>{receiver ? businessById.get(receiver.businessId)?.name : ""}</small></td>
                        <td>{referral.kind === "intro" ? "Introduction" : "Lead"}</td>
                        <td><span className={`admin-badge ${referral.status === "sent" ? "pending" : "active"}`}>{referralStatusLabels[referral.status]}</span></td>
                        <td>{stale ? <span className="admin-badge pending">Waiting 7+ days</span> : "—"}</td>
                        <td>
                          {referralCorrection?.id === referral.id ? (
                            <div className="support-reply-form">
                              <select
                                aria-label={`Correct status for referral from ${giver?.name ?? "unknown person"}`}
                                value={referralCorrection.status}
                                onChange={(event) => setReferralCorrection((draft) => draft ? { ...draft, status: event.target.value as ReferralStatus } : draft)}
                              >
                                {(Object.keys(referralStatusLabels) as ReferralStatus[]).map((status) => <option key={status} value={status}>{referralStatusLabels[status]}</option>)}
                              </select>
                              <input
                                aria-label="Correction reason"
                                placeholder="Required audit reason"
                                value={referralCorrection.reason}
                                onChange={(event) => setReferralCorrection((draft) => draft ? { ...draft, reason: event.target.value } : draft)}
                              />
                              <button type="button" className="mini-button" onClick={applyReferralCorrection} disabled={!persistEnabled || !referralCorrection.reason.trim() || referralCorrection.status === referral.status}>Confirm</button>
                              <button type="button" className="mini-button" onClick={() => setReferralCorrection(null)}>Cancel</button>
                            </div>
                          ) : (
                            <button type="button" className="mini-button" onClick={() => setReferralCorrection({ id: referral.id, status: referral.status, reason: "" })} disabled={!persistEnabled}>Correct status</button>
                          )}
                          {referral.adminAudit?.at(-1) && (
                            <small>{shortDate(referral.adminAudit.at(-1)!.at)} · {referral.adminAudit.at(-1)!.actor}: {referral.adminAudit.at(-1)!.note}</small>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {referrals.length === 0 && <tr><td colSpan={7} className="report-empty">No referrals yet.</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="import-note admin-tool-note">Prospect contact details stay with referral participants; this view exposes operational status only.</div>
            {!persistEnabled && <div className="import-note admin-tool-note">Status correction is disabled: the live backend needs tenant-scoped authorization and an immutable audit record.</div>}
            <div className="import-note admin-tool-note" aria-live="polite">{adminNote}</div>
          </div>
        </div>
      )}

      {tab === "events" && (
        <div className="admin-panel">
          <div className="glass-panel admin-panel-head">
            <div>
              <p className="section-label">Event operations</p>
              <h3>Attendance &amp; capacity</h3>
              <p className="report-subtitle">{scheduledEventCount} scheduled · {events.length - scheduledEventCount} canceled · {totalGoing} going</p>
            </div>
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                downloadCsv("event-operations.csv", [
                  ["Event", "Type", "Status", "Starts", "Ends", "Host", "Going", "Maybe", "Checked in", "Capacity"],
                  ...attendance.map(({ event, going, maybe, checkedIn }) => [
                    event.title,
                    eventTypeLabels[event.type],
                    event.status === "canceled" ? "Canceled" : "Scheduled",
                    new Date(event.startsAt).toISOString(),
                    event.endsAt ? new Date(event.endsAt).toISOString() : "",
                    event.hostMemberId ? memberById.get(event.hostMemberId)?.name ?? "Unknown person" : "Unassigned",
                    going,
                    maybe,
                    checkedIn,
                    event.capacity ?? "Unlimited"
                  ])
                ]);
                onAdminAction("Event operations exported as CSV.");
              }}
            >
              Export events
            </button>
          </div>
          {eventDraft && (
            <div className="glass-panel admin-add-form">
              <div className="admin-add-grid">
                <label><span>Event title*</span><input value={eventDraft.title} onChange={(event) => setEventDraft((draft) => draft ? { ...draft, title: event.target.value } : draft)} /></label>
                <label><span>Starts*</span><input type="datetime-local" value={toDateTimeLocal(eventDraft.startsAt)} onChange={(event) => setEventDraft((draft) => draft ? { ...draft, startsAt: new Date(event.target.value).getTime() } : draft)} /></label>
                <label><span>Ends</span><input type="datetime-local" value={toDateTimeLocal(eventDraft.endsAt)} onChange={(event) => setEventDraft((draft) => draft ? { ...draft, endsAt: event.target.value ? new Date(event.target.value).getTime() : undefined } : draft)} /></label>
                <label><span>Venue</span><input value={eventDraft.venueName} onChange={(event) => setEventDraft((draft) => draft ? { ...draft, venueName: event.target.value } : draft)} /></label>
                <label><span>Venue address</span><input value={eventDraft.venueAddress} onChange={(event) => setEventDraft((draft) => draft ? { ...draft, venueAddress: event.target.value } : draft)} /></label>
                <label><span>Capacity</span><input type="number" min="1" value={eventDraft.capacity ?? ""} onChange={(event) => setEventDraft((draft) => draft ? { ...draft, capacity: event.target.value ? Number(event.target.value) : undefined } : draft)} /></label>
              </div>
              <div className="admin-add-actions">
                <button type="button" className="primary-button" onClick={saveEvent} disabled={!persistEnabled || !eventDraft.title.trim()}>Save event</button>
                <button type="button" className="secondary-button" onClick={() => setEventDraft(null)}>Discard changes</button>
                {!persistEnabled && <span className="report-note">Disabled: the live backend needs an authorized event mutation and audit trail.</span>}
              </div>
            </div>
          )}
          <div className="glass-panel report-card">
            <div className="table-scroll">
              <table className="report-table admin-table">
                <thead><tr><th>Event</th><th>Status</th><th>Starts / ends</th><th>Host</th><th>Going</th><th>Maybe</th><th>Checked in</th><th>Capacity</th><th>Actions</th></tr></thead>
                <tbody>
                  {attendance.map(({ event, going, maybe, checkedIn }) => {
                    const eventRsvps = rsvps.filter((rsvp) => rsvp.eventId === event.id);
                    const canceled = event.status === "canceled";
                    return (
                      <Fragment key={event.id}>
                        <tr className={canceled ? "row-pending" : ""}>
                          <td><strong>{event.title}</strong><small>{eventTypeLabels[event.type]} · {event.venueName}</small></td>
                          <td><span className={`admin-badge ${canceled ? "hidden" : "active"}`}>{canceled ? "Canceled" : "Scheduled"}</span></td>
                          <td>{new Date(event.startsAt).toLocaleString()}<small>{event.endsAt ? `to ${new Date(event.endsAt).toLocaleString()}` : "No end time"}</small></td>
                          <td>{event.hostMemberId ? memberById.get(event.hostMemberId)?.name ?? "Unknown person" : "Unassigned"}</td>
                          <td>{going}</td><td>{maybe}</td><td>{checkedIn}</td><td>{event.capacity ?? "Unlimited"}</td>
                          <td className="admin-row-actions">
                            <button type="button" className="mini-button" onClick={() => setExpandedAttendanceId((id) => id === event.id ? null : event.id)}>{expandedAttendanceId === event.id ? "Hide attendance" : "Attendance"}</button>
                            <button type="button" className="mini-button" onClick={() => setEventDraft({ ...event })} disabled={!persistEnabled}>Edit</button>
                            <button type="button" className="mini-button" onClick={() => duplicateSelectedEvent(event)} disabled={!persistEnabled}>Duplicate</button>
                            {!canceled && <button type="button" className="mini-button danger" onClick={() => cancelEvent(event)} disabled={!persistEnabled}>Cancel event</button>}
                          </td>
                        </tr>
                        {expandedAttendanceId === event.id && (
                          <tr><td colSpan={9}>
                            <div className="mod-comments">
                              {eventRsvps.map((rsvp) => {
                                const attendee = memberById.get(rsvp.memberId);
                                return <div key={rsvp.memberId} className="admin-add-actions">
                                  <span><strong>{attendee?.name ?? "Unknown person"}</strong> · {rsvp.status.replace("_", " ")}</span>
                                  <label><input type="checkbox" checked={rsvp.checkedIn} disabled={!persistEnabled || canceled || rsvp.status !== "going"} onChange={() => toggleCheckIn(event.id, rsvp.memberId)} /> Checked in</label>
                                </div>;
                              })}
                              {eventRsvps.length === 0 && <span className="report-note">No responses yet.</span>}
                            </div>
                          </td></tr>
                        )}
                      </Fragment>
                    );
                  })}
                  {attendance.length === 0 && <tr><td colSpan={9} className="report-empty">No events.</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="import-note admin-tool-note">Seed-demo edits, duplication, cancellation, attendee detail, and check-in persist on this device. Attendee messaging is unavailable because delivery needs recipient targeting, an outbox, and audit records.</div>
            <div className="import-note admin-tool-note" aria-live="polite">{adminNote}</div>
          </div>
        </div>
      )}

      {tab === "moderation" && (
        <div className="admin-panel">
          <div className="glass-panel admin-panel-head">
            <div>
              <p className="section-label">Community moderation</p>
              <h3>Posts &amp; comments</h3>
              <p className="report-subtitle">
                {posts.length} posts · {posts.filter((post) => post.hidden).length} hidden · {comments.length} comments
              </p>
            </div>
            <div className="admin-panel-actions">
              <div className="admin-filter" role="group" aria-label="Filter moderated posts">
                {(["all", "visible", "hidden"] as ModerationFilter[]).map((filter) => (
                  <button
                    key={filter}
                    type="button"
                    className={moderationFilter === filter ? "active" : ""}
                    aria-pressed={moderationFilter === filter}
                    onClick={() => setModerationFilter(filter)}
                  >
                    {filter[0].toUpperCase() + filter.slice(1)}
                  </button>
                ))}
              </div>
              <input
                className="admin-search"
                type="search"
                aria-label="Search posts for moderation"
                placeholder="Search author, business, or text…"
                value={moderationQuery}
                onChange={(event) => setModerationQuery(event.target.value)}
              />
            </div>
          </div>
          <div className="admin-moderation-list">
            {moderatedPosts.length === 0 && <div className="glass-panel report-card report-empty">No posts match this view.</div>}
            {moderatedPosts.map((post) => {
              const postComments = commentsByPost.get(post.id) ?? [];
              return (
                <section className={post.hidden ? "glass-panel report-card mod-post hidden" : "glass-panel report-card mod-post"} key={post.id}>
                  <header className="mod-post-head">
                    <div>
                      <strong>{post.author}</strong>
                      <small>{post.businessName} · {post.category} · {post.timeAgo}</small>
                    </div>
                    <div className="mod-post-flags">
                      {post.pinned && <span className="admin-badge pinned">Pinned</span>}
                      {post.hidden && <span className="admin-badge hidden">Hidden</span>}
                    </div>
                  </header>
                  <p className="mod-post-body">{post.body}</p>
                  <div className="support-reply-form">
                    <input
                      aria-label={`Moderation reason for post by ${post.author}`}
                      placeholder="Required reason for hide, restore, or delete"
                      value={moderationReasons[post.id] ?? ""}
                      onChange={(event) => setModerationReasons((prev) => ({ ...prev, [post.id]: event.target.value }))}
                    />
                    <button type="button" className="mini-button" disabled title="Member reporting requires a report record, reporter privacy rules, and backend intake.">Reported by member (unavailable)</button>
                  </div>
                  <div className="mod-post-meta">
                    <span>{post.reactions} reactions · {postComments.length} comments</span>
                    <div className="mod-post-actions">
                      <button type="button" className="mini-button" aria-label={`${post.hidden ? "Unhide" : "Hide"} post by ${post.author}`} onClick={() => togglePostHidden(post.id)}>
                        {post.hidden ? "Unhide" : "Hide"}
                      </button>
                      <button type="button" className="mini-button danger" aria-label={`Delete post by ${post.author}`} onClick={() => deletePost(post.id)}>Delete</button>
                    </div>
                  </div>
                  {post.moderationHistory && post.moderationHistory.length > 0 && (
                    <details>
                      <summary>Moderation history ({post.moderationHistory.length})</summary>
                      <ul className="mod-comments">
                        {[...post.moderationHistory].reverse().map((entry, index) => (
                          <li key={`${entry.at}-${index}`}><span>{new Date(entry.at).toLocaleString()} · {entry.actor} · {entry.action}: {entry.reason}</span></li>
                        ))}
                      </ul>
                    </details>
                  )}
                  {postComments.length > 0 && (
                    <ul className="mod-comments">
                      {postComments.map((comment) => (
                        <li key={comment.id}>
                          <div>
                            <strong>{comment.authorName}</strong>
                            <span>{comment.body}</span>
                          </div>
                          <button type="button" className="mini-button danger" aria-label={`Delete comment by ${comment.authorName}`} onClick={() => deleteComment(comment.id)}>Delete</button>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              );
            })}
          </div>
          <div className="glass-panel import-note admin-inline-note">
            Member report intake is disabled in the seed demo: there is no report record, reporter-privacy policy, or backend queue. Visibility actions require a reason and are stored with the post.
          </div>
          {deletedModerationHistory.length > 0 && (
            <div className="glass-panel report-card">
              <h4>Deletion history (this session only)</h4>
              <ul className="mod-comments">
                {deletedModerationHistory.map((entry, index) => <li key={`${entry.at}-${index}`}><span>{new Date(entry.at).toLocaleString()} · {entry.actor} · {entry.target} · {entry.reason}</span></li>)}
              </ul>
              <p className="report-note">A durable deletion ledger requires backend audit storage; this demo history is cleared when the admin page reloads.</p>
            </div>
          )}
          <div className="import-note admin-tool-note">{adminNote}</div>
        </div>
      )}

      {tab === "support" && (
        <div className="admin-panel">
          <div className="glass-panel admin-panel-head">
            <div>
              <p className="section-label">Support</p>
              <h3>Support queue</h3>
              <p className="report-subtitle">
                {openRequests.length} open · {requests.length - openRequests.length} resolved
              </p>
            </div>
          </div>
          <div className="admin-moderation-list">
            {requests.length === 0 && <div className="glass-panel report-card report-empty">No support requests.</div>}
            {requests.map((request) => {
              const status = canonicalSupportStatus(request.status);
              const resolved = status === "Resolved";
              return (
                <section className={resolved ? "glass-panel report-card mod-post resolved" : "glass-panel report-card mod-post"} key={request.id}>
                  <header className="mod-post-head">
                    <div>
                      <strong>{request.title}</strong>
                      <small>{request.category}</small>
                    </div>
                    <select
                      className="admin-select"
                      aria-label={`Status for ${request.title}`}
                      value={status}
                      onChange={(event) => setRequestStatus(request.id, event.target.value)}
                    >
                      {supportStatuses.map((status) => (
                        <option key={status} value={status}>{status}</option>
                      ))}
                    </select>
                  </header>
                  <p className="mod-post-body">{request.detail}</p>
                  {request.adminReply && (
                    <div className="support-reply"><strong>Your reply:</strong> {request.adminReply}</div>
                  )}
                  <div className="support-reply-form">
                    <input
                      type="text"
                      placeholder="Reply to the member…"
                      aria-label={`Reply to ${request.title}`}
                      value={replyDrafts[request.id] ?? ""}
                      onChange={(event) => setReplyDrafts((drafts) => ({ ...drafts, [request.id]: event.target.value }))}
                      onKeyDown={(event) => { if (event.key === "Enter") sendReply(request.id); }}
                    />
                    <button type="button" className="mini-button" aria-label={`Send reply for ${request.title}`} onClick={() => sendReply(request.id)} disabled={!(replyDrafts[request.id] ?? "").trim()}>Send</button>
                  </div>
                </section>
              );
            })}
          </div>
          <div className="import-note admin-tool-note">{adminNote}</div>
        </div>
      )}

      {tab === "broadcast" && (
        <div className="admin-panel">
          <div className="glass-panel admin-panel-head">
            <div>
              <p className="section-label">Broadcast</p>
              <h3>Post an announcement</h3>
              <p className="report-subtitle">Publishes to the community feed as {currentMember?.name ?? "SBRA Team"}.</p>
            </div>
          </div>
          <div className="glass-panel report-card admin-broadcast">
            <p className="report-note">Audience: all members in the current SBRA community feed. Review the message before publishing.</p>
            <textarea
              className="admin-broadcast-input"
              placeholder="Share an announcement with all members — a program update, a deadline, an event reminder…"
              maxLength={2000}
              value={broadcastBody}
              onChange={(event) => setBroadcastBody(event.target.value)}
            />
            {broadcastBody.trim() && (
              <div className="glass-panel import-note admin-inline-note" aria-label="Announcement preview">
                <strong>Preview</strong>
                <p>{broadcastBody.trim()}</p>
                {broadcastPinned && <span className="admin-badge pinned">Pinned</span>}
              </div>
            )}
            <label>
              <span>Schedule for later</span>
              <input type="datetime-local" disabled aria-describedby="broadcast-schedule-blocker" />
            </label>
            <p className="report-note" id="broadcast-schedule-blocker">Scheduling is unavailable: reliable delivery requires a server-side scheduler, durable outbox, recipient snapshot, and audit record. Saving a draft does not schedule it.</p>
            <div className="admin-broadcast-actions">
              <span className="report-note" aria-live="polite">{broadcastBody.length}/2000 characters</span>
              <label className="broadcast-pin">
                <input type="checkbox" checked={broadcastPinned} onChange={(event) => setBroadcastPinned(event.target.checked)} />
                Pin to top of feed
              </label>
              <button type="button" className="secondary-button" onClick={saveBroadcastDraft} disabled={!persistEnabled || !broadcastBody.trim()}>Save draft</button>
              <button type="button" className="secondary-button" onClick={clearBroadcastDraft} disabled={!broadcastBody}>Clear draft</button>
              <button type="button" className="secondary-button" disabled title="Requires a server-side scheduler and delivery outbox">Schedule (unavailable)</button>
              <button type="button" className="primary-button" onClick={postBroadcast} disabled={!broadcastBody.trim()}>
                Publish now
              </button>
            </div>
            <div className="import-note admin-tool-note">{adminNote}</div>
          </div>
        </div>
      )}
    </section>
  );
}
