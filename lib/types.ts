export type UserRole = "member" | "staff" | "admin";

export type ViewKey = "community" | "directory" | "learn" | "support" | "profile" | "admin";

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
