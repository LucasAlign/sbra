export type UserRole = "member" | "staff" | "admin";

export type ViewKey =
  | "community"
  | "directory"
  | "referrals"
  | "events"
  | "learn"
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

// A scheduled SBRA gathering. Named SbraEvent to avoid shadowing the DOM Event.
export type SbraEvent = {
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

export type ReferralStatus = "given" | "contacted" | "closed_won" | "closed_lost";

export const referralStatusLabels: Record<ReferralStatus, string> = {
  given: "Given",
  contacted: "Contacted",
  closed_won: "Closed — won",
  closed_lost: "Closed — lost"
};

// Value passed between members. A "lead" hands over an external prospect; an
// "intro" connects the receiver with another member. Closed business ($ value)
// is credited to the giver — SBRA's closed-loop tracking.
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
  closedValue?: number; // $ credited to the giver when closed_won
  thankYou?: string; // note from receiver to giver
  createdAt: number;
  contactedAt?: number; // set when the receiver marks it contacted; resets staleness
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

export type SupportRequest = {
  id: string;
  authorId?: string;
  title: string;
  category: string;
  status: string;
  detail: string;
  createdAt?: number;
};

export type Module = {
  number: string;
  title: string;
  description: string;
};
