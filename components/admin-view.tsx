"use client";

import { useMemo, useState } from "react";
import type {
  Business,
  Comment,
  CommunityPost,
  Member,
  Reaction,
  Referral,
  Rsvp,
  SbraEvent,
  SupportRequest
} from "@/lib/types";
import { tierLabels } from "@/lib/types";

// ---------------------------------------------------------------------------
// Admin reports. Everything below is computed from the live app state so the
// numbers move as members use the app. The one exception is the membership
// growth trend, which is a sample series until the backend records join dates.
// ---------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;

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

function money(value: number): string {
  return `$${value.toLocaleString()}`;
}

function shortDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// Builds a CSV file from rows and hands it to the browser as a download.
function downloadCsv(filename: string, rows: (string | number)[][]) {
  const escape = (cell: string | number) => {
    const text = String(cell);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const csv = rows.map((row) => row.map(escape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
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
  onImport
}: {
  businesses: Business[];
  members: Member[];
  referrals: Referral[];
  events: SbraEvent[];
  rsvps: Rsvp[];
  requests: SupportRequest[];
  posts: CommunityPost[];
  comments: Comment[];
  reactions: Reaction[];
  importNote: string;
  adminNote: string;
  onAdminAction: (note: string) => void;
  onImport: (file: File | undefined) => void;
}) {
  const [range, setRange] = useState<RangeKey>("90");
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
    given: rangedReferrals.length,
    contacted: rangedReferrals.filter((referral) => referral.status !== "given").length,
    closedWon: rangedReferrals.filter((referral) => referral.status === "closed_won").length,
    closedLost: rangedReferrals.filter((referral) => referral.status === "closed_lost").length
  };
  const closedValue = rangedReferrals
    .filter((referral) => referral.status === "closed_won")
    .reduce((sum, referral) => sum + (referral.closedValue ?? 0), 0);
  const openReferrals = referrals.filter((referral) => referral.status === "given" || referral.status === "contacted");
  const staleReferrals = openReferrals.filter(
    (referral) => now - (referral.contactedAt ?? referral.createdAt) >= 7 * DAY_MS
  );

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
    const stats = new Map<string, { given: number; won: number; value: number }>();
    for (const referral of rangedReferrals) {
      const entry = stats.get(referral.giverId) ?? { given: 0, won: 0, value: 0 };
      entry.given += 1;
      if (referral.status === "closed_won") {
        entry.won += 1;
        entry.value += referral.closedValue ?? 0;
      }
      stats.set(referral.giverId, entry);
    }
    return [...stats.entries()]
      .map(([giverId, entry]) => ({ giverId, ...entry }))
      .sort((a, b) => b.given - a.given || b.value - a.value)
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
  const totalGoing = attendance.reduce((sum, row) => sum + row.going, 0);

  // --- Support queue --------------------------------------------------------
  const openRequests = requests.filter((request) => !/resolved|closed/i.test(request.status));
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

  return (
    <section className="admin-view">
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
            onClick={() =>
              downloadCsv("sbra-admin-summary.csv", [
                ["Metric", "Value", "Range"],
                ["Member businesses", businesses.length, "all time"],
                ["People", members.length, "all time"],
                ["Referrals given", pipeline.given, rangeLabel],
                ["Referrals closed won", pipeline.closedWon, rangeLabel],
                ["Closed referral value", closedValue, rangeLabel],
                ["Open support requests", openRequests.length, "now"],
                ["Event RSVPs (going)", totalGoing, "all events"],
                ["Active members", activeMembers, "all time"]
              ])
            }
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
          <strong>{pipeline.given}</strong>
          <p>
            {pipeline.closedWon} closed won · {money(closedValue)}
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
          title="Referral pipeline"
          subtitle="How referrals move from given to closed"
          onExport={() =>
            downloadCsv("referral-pipeline.csv", [
              ["Stage", "Count"],
              ["Given", pipeline.given],
              ["Contacted", pipeline.contacted],
              ["Closed won", pipeline.closedWon],
              ["Closed lost", pipeline.closedLost],
              ["Closed value", closedValue]
            ])
          }
          footer={
            <span>
              Win rate <strong>{pct(pipeline.closedWon, pipeline.given)}%</strong> · Avg closed deal{" "}
              <strong>{money(pipeline.closedWon ? Math.round(closedValue / pipeline.closedWon) : 0)}</strong>
            </span>
          }
        >
          <div className="funnel">
            {[
              { label: "Given", value: pipeline.given, color: PALETTE[0] },
              { label: "Contacted", value: pipeline.contacted, color: PALETTE[1] },
              { label: "Closed won", value: pipeline.closedWon, color: PALETTE[3] },
              { label: "Closed lost", value: pipeline.closedLost, color: PALETTE[2] }
            ].map((stage) => (
              <div className="funnel-stage" key={stage.label}>
                <span>{stage.label}</span>
                <div className="funnel-track">
                  <i
                    style={{
                      width: `${Math.max(pipeline.given ? (stage.value / pipeline.given) * 100 : 0, stage.value ? 6 : 0)}%`,
                      background: stage.color
                    }}
                  />
                </div>
                <strong>{stage.value}</strong>
                <small>{pct(stage.value, pipeline.given)}%</small>
              </div>
            ))}
          </div>
        </ReportCard>

        <ReportCard
          eyebrow="Referrals"
          title="Weekly referral activity"
          subtitle="New referrals given per week, last 8 weeks"
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
          title="Top referral givers"
          subtitle="Members generating the most business for others"
          onExport={() =>
            downloadCsv("top-givers.csv", [
              ["Member", "Business", "Given", "Closed won", "Closed value"],
              ...topGivers.map((row) => {
                const member = memberById.get(row.giverId);
                return [
                  member?.name ?? row.giverId,
                  businessById.get(member?.businessId ?? "")?.name ?? "",
                  row.given,
                  row.won,
                  row.value
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
                  <th>Given</th>
                  <th>Won</th>
                  <th>Value</th>
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
                      <td>{row.given}</td>
                      <td>{row.won}</td>
                      <td>{money(row.value)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </ReportCard>
      </div>

      <div className="admin-grid">
        <section className="glass-panel report-card admin-import-card">
          <p className="section-label">Access controlled</p>
          <h3>Admin Data Import</h3>
          <p className="admin-copy">
            Only Admin and staff users can import rosters, approve accounts, assign membership tiers, moderate posts, and
            export reports. Members never see this navigation.
          </p>
          <div className="role-grid">
            <div>
              <strong>Admin / Staff</strong>
              <span>Import, tiers, reports, moderation</span>
            </div>
            <div>
              <strong>Member</strong>
              <span>Directory, referrals, events, support</span>
            </div>
          </div>
          <label className="import-button">
            <span className="button-icon">U</span>
            Import CSV/Excel
            <input type="file" accept=".csv,.xlsx,.xls" onChange={(event) => onImport(event.target.files?.[0])} />
          </label>
          <div className="import-note">{importNote}</div>
        </section>

        <section className="glass-panel report-card">
          <p className="section-label">Admin tools</p>
          {[
            ["Approve new member accounts", "A", "Account queue opened: pending members need verification."],
            ["Assign membership tiers", "T", "Tier manager opened: set solo / small / growth / enterprise per business."],
            ["Review imported roster data", "R", "Roster review opened: validate columns before saving."],
            ["Export referral impact report", "E", "Impact report queued with referrals, closed value, and engagement."],
            ["Review flagged content", "F", "Moderation queue opened: no high-priority flags in this seed demo."]
          ].map(([label, icon, note]) => (
            <button
              className="admin-action"
              key={label as string}
              disabled
              title="Coming soon"
              onClick={() => onAdminAction(note as string)}
            >
              <span className="nav-icon">{icon as string}</span>
              {label as string}
              <span className="coming-soon-badge">Coming soon</span>
            </button>
          ))}
          <div className="import-note admin-tool-note">{adminNote}</div>
        </section>
      </div>
    </section>
  );
}
