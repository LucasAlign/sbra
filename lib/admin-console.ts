import type {
  Business,
  CommunityEvent,
  CommunityPost,
  Referral,
  ReferralStatus,
  SupportStatus
} from "./types";

export type ModerationFilter = "all" | "visible" | "hidden";

export function canonicalSupportStatus(status: string): SupportStatus {
  if (/resolved|closed/i.test(status)) return "Resolved";
  if (/assigned|waiting|progress/i.test(status)) return "In progress";
  return "Open";
}

export function isStaleReferral(referral: Referral, now: number, days = 7): boolean {
  return referral.status === "sent" && now - referral.createdAt >= days * 86_400_000;
}

export function filterModerationPosts(
  posts: CommunityPost[],
  filter: ModerationFilter,
  query: string
): CommunityPost[] {
  const normalizedQuery = query.trim().toLowerCase();
  return posts.filter((post) => {
    const matchesVisibility =
      filter === "all" || (filter === "hidden" ? Boolean(post.hidden) : !post.hidden);
    const haystack = `${post.author} ${post.businessName} ${post.category} ${post.body}`.toLowerCase();
    return matchesVisibility && (!normalizedQuery || haystack.includes(normalizedQuery));
  });
}

export function buildCsv(rows: (string | number)[][]): string {
  const escape = (cell: string | number) => {
    const text = String(cell);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return rows.map((row) => row.map(escape).join(",")).join("\n");
}

export function validateEventTiming(startsAt: number, endsAt?: number): string | null {
  if (!Number.isFinite(startsAt)) return "A valid start time is required.";
  if (endsAt !== undefined && (!Number.isFinite(endsAt) || endsAt <= startsAt)) {
    return "End time must be after the start time.";
  }
  return null;
}

export function duplicateEvent(event: CommunityEvent, id: string, startsAt: number): CommunityEvent {
  const duration = event.endsAt === undefined ? undefined : event.endsAt - event.startsAt;
  return {
    ...event,
    id,
    title: `${event.title} (copy)`,
    startsAt,
    endsAt: duration === undefined ? undefined : startsAt + duration,
    status: "scheduled"
  };
}

export function correctReferralStatus(
  referral: Referral,
  toStatus: ReferralStatus,
  actor: string,
  at: number,
  note: string
): Referral {
  const trimmedNote = note.trim();
  if (!trimmedNote) throw new Error("A correction reason is required.");
  return {
    ...referral,
    status: toStatus,
    closedAt: toStatus === "sent" ? undefined : at,
    adminAudit: [
      ...(referral.adminAudit ?? []),
      { at, actor, fromStatus: referral.status, toStatus, note: trimmedNote }
    ]
  };
}

type BusinessProfilePatch = Pick<
  Business,
  "name" | "category" | "description" | "servicesOffered" | "referralsWanted" | "website" | "address" | "city"
>;

export function updateBusinessProfile(business: Business, patch: BusinessProfilePatch): Business {
  return {
    ...business,
    name: patch.name.trim(),
    category: patch.category.trim(),
    description: patch.description.trim(),
    servicesOffered: patch.servicesOffered.trim(),
    referralsWanted: patch.referralsWanted.trim(),
    website: patch.website.trim(),
    address: patch.address.trim(),
    city: patch.city.trim()
  };
}

export function recordModerationAction(
  post: CommunityPost,
  action: "hidden" | "restored",
  reason: string,
  actor: string,
  at: number
): CommunityPost {
  const trimmedReason = reason.trim();
  if (!trimmedReason) throw new Error("A moderation reason is required.");
  return {
    ...post,
    hidden: action === "hidden",
    moderationReason: action === "hidden" ? trimmedReason : undefined,
    moderationHistory: [
      ...(post.moderationHistory ?? []),
      { at, actor, action, reason: trimmedReason }
    ]
  };
}
