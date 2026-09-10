export type UserRole = "member" | "staff" | "admin";

export type ViewKey =
  | "community"
  | "directory"
  | "referrals"
  | "events"
  | "learn"
  | "tools"
  | "support"
  | "profile"
  | "admin";

export type EventType =
  | "breakfast_club"
  | "mingle"
  | "ribbon_cutting"
  | "workshop"
  | "seminar"
  | "pitch"
  | "huddle";

export const eventTypeLabels: Record<EventType, string> = {
  breakfast_club: "Breakfast Referral Club",
  mingle: "Mingle",
  ribbon_cutting: "Ribbon-cutting",
  workshop: "Workshop",
  seminar: "Seminar",
  pitch: "The Pitch",
  huddle: "Huddle"
};

// A scheduled community gathering. Named CommunityEvent to avoid shadowing the
// DOM Event.
export type CommunityEvent = {
  id: string;
  title: string;
  type: EventType;
  description: string;
  startsAt: number;
  endsAt?: number;
  recurrence: "none" | "weekly" | "monthly";
  venueName: string;
  venueAddress: string;
  hostMemberId?: string; // rotating host (Mingles)
  cost: number; // 0 = free
  capacity?: number;
  createdById: string;
};

export type RsvpStatus = "going" | "maybe" | "declined";

export type Rsvp = {
  eventId: string;
  memberId: string;
  status: RsvpStatus;
  checkedIn: boolean;
  respondedAt: number;
};

export type ReferralKind = "lead" | "intro";

export type ReferralStatus = "sent" | "won" | "not_won";

export const referralStatusLabels: Record<ReferralStatus, string> = {
  sent: "Sent",
  won: "Won",
  not_won: "Not Won"
};

// Value passed between members. A "lead" hands over an external prospect; an
// "intro" connects the receiver with another member. Sending earns the giver
// 10 points; a Won outcome earns 40 additional points.
export type Referral = {
  id: string;
  kind: ReferralKind;
  giverId: string; // Member id
  receiverId: string; // Member id
  introducedMemberId?: string; // for kind === "intro"
  prospectName?: string; // for kind === "lead"
  prospectContact?: string; // for kind === "lead"
  need: string;
  status: ReferralStatus;
  createdAt: number;
  closedAt?: number;
};

export type MembershipTier = "solo" | "small" | "growth" | "enterprise";

export const tierLabels: Record<MembershipTier, string> = {
  solo: "Solopreneur",
  small: "Small team",
  growth: "Growth",
  enterprise: "Enterprise"
};

// A member business — the unit SBRA sells membership to, and the directory entry.
export type Business = {
  id: string;
  name: string;
  category: string;
  description: string;
  servicesOffered: string; // comma-separated for the seed/MVP
  referralsWanted: string; // the member's ideal referral / target customer
  website: string;
  address: string;
  city: string;
  tier: MembershipTier;
  logo?: string;
  memberOffer?: string;
};

// A person with a login, belonging to exactly one Business (many-to-one).
export type Member = {
  id: string;
  uid?: string;
  role?: UserRole;
  businessId: string;
  name: string;
  title: string; // role at the business, e.g. "Owner", "Operations Lead"
  email: string;
  phone: string;
  bio: string;
  isOwner: boolean;
  photo?: string;
  pending?: boolean; // awaiting admin approval; undefined/false = active
};

export type CommunityPost = {
  id: string;
  authorId?: string;
  author: string;
  businessName: string;
  timeAgo: string;
  category: string;
  tone: "coral" | "green" | "blue" | "violet";
  body: string;
  note?: string;
  attachments?: PostAttachment[];
  reactions: number;
  comments: number;
  createdAt?: number;
  hidden?: boolean; // hidden from the member feed by a moderator
  pinned?: boolean; // pinned to the top of the feed (admin broadcast)
};

export type ReactionType = "celebrate" | "support" | "insightful";

export type Reaction = {
  id: string;
  postId: string;
  memberId: string;
  type: ReactionType;
};

export type Comment = {
  id: string;
  postId: string;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: number;
};

export const postCategories = ["Win", "Announcement", "The Pitch", "Question", "Podcast", "General"] as const;

export type PostAttachment = {
  id: string;
  name: string;
  kind: "image" | "file";
  url?: string;
  label?: string;
  storagePath?: string;
  contentType?: string;
  size?: number;
};

export const supportStatuses = ["Open", "In progress", "Resolved"] as const;
export type SupportStatus = (typeof supportStatuses)[number];

export type SupportRequest = {
  id: string;
  authorId?: string;
  title: string;
  category: string;
  status: string;
  detail: string;
  createdAt?: number;
  adminReply?: string; // staff response shown to the member
  resolvedAt?: number;
};

export type Module = {
  number: string;
  title: string;
  description: string;
};
