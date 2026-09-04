import type {
  Business,
  Comment,
  CommunityPost,
  Member,
  Module,
  Reaction,
  Referral,
  Rsvp,
  SbraEvent,
  SupportRequest
} from "@/lib/types";
import { sbraBusinessSeed, sbraMemberSeed } from "@/lib/sbra-directory.generated";

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

// Next Friday 7:30 AM, and helpers for seed event times.
function nextWeekday(targetDow: number, hour: number, minute = 0) {
  const now = new Date();
  const result = new Date(now);
  const delta = (targetDow - now.getDay() + 7) % 7 || 7;
  result.setDate(now.getDate() + delta);
  result.setHours(hour, minute, 0, 0);
  return result.getTime();
}

// SBRA member businesses (the directory) — Greater Reading / Berks County, PA.
const legacyBusinessSeed: Business[] = [
  {
    id: "keystone-web",
    name: "Power Marketing International",
    category: "Marketing, Advertising & Web Design",
    description: "Websites and digital marketing focused on helping businesses get found, engage visitors, and convert leads.",
    servicesOffered: "Website design, Online advertising, SEO, Social media support",
    referralsWanted: "Businesses that want to improve their website, visibility, and lead generation",
    website: "powermarketinginternational.com",
    address: "",
    city: "Berks County, PA",
    tier: "small"
  },
  {
    id: "berks-apparel",
    name: "Studio 413 Photo",
    category: "Photography",
    description: "Professional photography services from an SBRA member serving the Berks County community.",
    servicesOffered: "Commercial photography, Portraits, Event photography",
    referralsWanted: "Businesses and families looking for professional photography",
    website: "studio413.net",
    address: "",
    city: "Berks County, PA",
    tier: "solo"
  },
  {
    id: "sweet-laurel",
    name: "B2 Bistro",
    category: "Restaurant",
    description: "A Berks County restaurant and gathering place represented in the SBRA member directory.",
    servicesOffered: "Restaurant dining, Private gatherings, Hospitality",
    referralsWanted: "Guests and organizations planning local meals and gatherings",
    website: "b2bistro.com",
    address: "",
    city: "Berks County, PA",
    tier: "small"
  },
  {
    id: "greenedge-lawn",
    name: "Security Service Company",
    category: "Security Systems",
    description: "Security-system services from a long-established regional provider and SBRA member.",
    servicesOffered: "Security systems, Installation, Monitoring support",
    referralsWanted: "Homes and businesses reviewing their security needs",
    website: "sscsince73.com",
    address: "",
    city: "Berks County, PA",
    tier: "growth"
  },
  {
    id: "polished-nails",
    name: "Kinya Ramen",
    category: "Restaurant",
    description: "Authentic Japanese cuisine served in Wyomissing.",
    servicesOffered: "Japanese cuisine, Restaurant dining",
    referralsWanted: "Local diners and groups looking for a restaurant in Wyomissing",
    website: "kinya.us",
    address: "",
    city: "Wyomissing, PA",
    tier: "solo"
  },
  {
    id: "vantage-insurance",
    name: "Diamond Credit Union",
    category: "Banking Solutions",
    description: "A not-for-profit, member-owned credit union offering personal and business financial solutions.",
    servicesOffered: "Personal banking, Business assistance, Checking accounts, Financial solutions",
    referralsWanted: "People and businesses looking for a member-owned financial partner",
    website: "diamondcu.org",
    address: "",
    city: "Berks County, PA",
    tier: "enterprise"
  },
  {
    id: "cornerstone-books",
    name: "A Mazzo Accounting",
    category: "Accounting",
    description: "Accounting services for businesses and individuals in the Berks County community.",
    servicesOffered: "Accounting services",
    referralsWanted: "Businesses and individuals looking for accounting support",
    website: "amazzoaccounting.com",
    address: "",
    city: "Berks County, PA",
    tier: "small"
  },
  {
    id: "reading-dermatology",
    name: "Reading Dermatology Associates",
    category: "Medical & Cosmetic Dermatology",
    description: "Skin care for the entire family, from infants to seniors, along with cosmetic skin-care services.",
    servicesOffered: "Medical dermatology, Cosmetic dermatology, Family skin care",
    referralsWanted: "Families and individuals seeking medical or cosmetic dermatology",
    website: "readingderm.com",
    address: "",
    city: "Berks County, PA",
    tier: "growth"
  },
  {
    id: "precision-hearing",
    name: "Precision Hearing Aid Center",
    category: "Hearing Aids",
    description: "Hearing evaluations, hearing-aid fittings, and ongoing service.",
    servicesOffered: "Hearing evaluations, Hearing-aid fitting, Hearing-aid service",
    referralsWanted: "People seeking a hearing evaluation or hearing-aid support",
    website: "precisionhac.com",
    address: "",
    city: "Berks County, PA",
    tier: "small"
  }
];

// Members (people). Each belongs to one Business (many-to-one).
const legacyMemberSeed: Member[] = [
  {
    id: "maya-chen",
    businessId: "keystone-web",
    name: "Alan Robezzoli",
    title: "SBRA Member",
    email: "alanr@powermarketinginternational.com",
    phone: "484-297-6395",
    bio: "Helps businesses strengthen their websites, online visibility, and digital lead generation.",
    isOwner: true
  },
  {
    id: "devin-brooks",
    businessId: "sweet-laurel",
    name: "Yvans Pochron",
    title: "SBRA Member",
    email: "yvans@b2bistro.com",
    phone: "610-718-6105",
    bio: "Represents B2 Bistro in the SBRA Berks County member community.",
    isOwner: true
  },
  {
    id: "ari-rivera",
    businessId: "berks-apparel",
    name: "Don Carrick",
    title: "SBRA Member",
    email: "don@studio413.net",
    phone: "610-698-2604",
    bio: "Provides professional photography services through Studio 413 Photo.",
    isOwner: true
  },
  {
    id: "jada-lee",
    businessId: "cornerstone-books",
    name: "Tony Mazzo",
    title: "SBRA Member",
    email: "amazzoaccounting@comcast.net",
    phone: "610-775-9216",
    bio: "Provides accounting services through A Mazzo Accounting.",
    isOwner: true
  },
  {
    id: "noah-patel",
    businessId: "greenedge-lawn",
    name: "Jim Long",
    title: "SBRA Member",
    email: "jim.long@sscsince73.com",
    phone: "800-232-2500",
    bio: "Represents Security Service Company and its security-system services.",
    isOwner: true
  },
  {
    id: "marisol-ortiz",
    businessId: "reading-dermatology",
    name: "Yomaira Polanco",
    title: "SBRA Member",
    email: "ypolanco@readingderm.com",
    phone: "610-750-7891",
    bio: "Represents Reading Dermatology Associates and its medical and cosmetic skin-care services.",
    isOwner: true
  },
  {
    id: "sofia-martinez",
    businessId: "polished-nails",
    name: "Jevan Chen",
    title: "SBRA Member",
    email: "wyomissing@kinya.us",
    phone: "610-743-5829",
    bio: "Represents Kinya Ramen and its authentic Japanese cuisine in Wyomissing.",
    isOwner: true
  },
  {
    id: "grace-whitfield",
    businessId: "vantage-insurance",
    name: "Yamile Zabala",
    title: "SBRA Member",
    email: "zabalapy@diamondcu.com",
    phone: "484-524-3147",
    bio: "Connects members with personal and business banking solutions through Diamond Credit Union.",
    isOwner: true
  },
  {
    id: "tom-alvarez",
    businessId: "precision-hearing",
    name: "Adam Wentling",
    title: "SBRA Member",
    email: "adam@precisionhac.com",
    phone: "610-779-3205",
    bio: "Provides hearing evaluations, hearing-aid fittings, and service through Precision Hearing Aid Center.",
    isOwner: true
  }
];

// The live public SBRA Berks County directory, synced by scripts/sync-sbra-directory.mjs.
// Legacy constants above preserve the original demo fixture shape for reference while
// stable IDs in the generated data keep referrals, posts, and RSVPs connected.
export const businessSeed: Business[] = sbraBusinessSeed;
export const memberSeed: Member[] = sbraMemberSeed;

export const learningModules: Module[] = [
  {
    number: "01",
    title: "Referral Fundamentals",
    description: "How to give a great referral and close the loop."
  },
  {
    number: "02",
    title: "Your 30-Second Intro",
    description: "Sharpen the pitch you deliver at Breakfast Club."
  },
  {
    number: "03",
    title: "Pricing & Cash Flow",
    description: "Set profitable prices and read your numbers."
  }
];

export const communityPosts: CommunityPost[] = [
  {
    id: "ari-popup",
    author: "Don Carrick",
    businessName: "Studio 413 Photo",
    timeAgo: "18 min ago",
    category: "Member Spotlight",
    tone: "coral",
    body:
      "Meet Studio 413 Photo, a professional photography business represented in the SBRA Berks County member directory. 📷",
    note: "Illustrative demo post — not a statement from this member.",
    attachments: [
      { id: "ari-order", name: "Ari reviewing the finished apparel order", kind: "image", url: "/feed/apparel-order.png" }
    ],
    reactions: 22,
    comments: 5
  },
  {
    id: "tom-huddle",
    author: "Adam Wentling",
    businessName: "Precision Hearing Aid Center",
    timeAgo: "42 min ago",
    category: "Member Spotlight",
    tone: "violet",
    body:
      "Precision Hearing Aid Center provides hearing evaluations, professional hearing-aid fittings, and ongoing service for the Berks County community.",
    note: "Illustrative demo post — not a statement from this member.",
    attachments: [{ id: "tom-breakfast", name: "Members connecting at Breakfast Referral Club", kind: "image", url: "/feed/referral-breakfast.png" }],
    reactions: 14,
    comments: 8
  },
  {
    id: "noah-hiring",
    author: "Jim Long",
    businessName: "Security Service Company",
    timeAgo: "2 hr ago",
    category: "Member Spotlight",
    tone: "green",
    body:
      "Security Service Company brings decades of regional experience to security-system needs for homes and businesses.",
    note: "Illustrative demo post — not a statement from this member.",
    attachments: [{ id: "noah-project", name: "GreenEdge crew installing a commercial landscape", kind: "image", url: "/feed/landscape-project.png" }],
    reactions: 19,
    comments: 6
  },
  {
    id: "sofia-mingle",
    author: "Jevan Chen",
    businessName: "Kinya Ramen",
    timeAgo: "Yesterday",
    category: "Member Spotlight",
    tone: "blue",
    body:
      "Kinya Ramen brings authentic Japanese cuisine to Wyomissing and is part of the SBRA Berks County member community. 🍜",
    note: "Illustrative demo post — not a statement from this member.",
    attachments: [{ id: "sofia-mingle", name: "Members talking at the Polished studio mingle", kind: "image", url: "/feed/studio-mingle.png" }],
    reactions: 31,
    comments: 9
  },
  {
    id: "grace-resource",
    author: "Yamile Zabala",
    businessName: "Diamond Credit Union",
    timeAgo: "Yesterday",
    category: "Member Spotlight",
    tone: "violet",
    body:
      "Diamond Credit Union is a not-for-profit, member-owned institution offering personal banking and business financial solutions.",
    note: "Illustrative demo post — not a statement from this member.",
    reactions: 27,
    comments: 4
  }
];

// Referrals between members. Giver/receiver ids reference memberSeed above.
export const referralSeed: Referral[] = [
  {
    id: "ref-jada-ari",
    kind: "lead",
    giverId: "jada-lee",
    receiverId: "ari-rivera",
    prospectName: "Sample event organizer",
    prospectContact: "demo@example.com",
    need: "Illustrative photography opportunity included for the product demo.",
    status: "closed_won",
    closedValue: 1450,
    thankYou: "Illustrative closed-loop note for the product demo.",
    createdAt: Date.now() - 9 * DAY,
    closedAt: Date.now() - 2 * DAY
  },
  {
    id: "ref-noah-tom",
    kind: "lead",
    giverId: "noah-patel",
    receiverId: "tom-alvarez",
    prospectName: "Sample local customer",
    prospectContact: "demo@example.com",
    need: "Illustrative hearing-services inquiry included for the product demo.",
    status: "contacted",
    createdAt: Date.now() - 4 * DAY
  },
  {
    id: "ref-grace-maya",
    kind: "intro",
    giverId: "grace-whitfield",
    receiverId: "maya-chen",
    introducedMemberId: "sofia-martinez",
    need: "Illustrative warm introduction included to demonstrate the referral workflow.",
    status: "given",
    createdAt: Date.now() - 1 * DAY
  },
  {
    id: "ref-tom-grace",
    kind: "lead",
    giverId: "tom-alvarez",
    receiverId: "grace-whitfield",
    prospectName: "Sample local business",
    prospectContact: "demo@example.com",
    need: "Illustrative opportunity included to demonstrate referral tracking.",
    status: "closed_won",
    closedValue: 780,
    thankYou: "Illustrative closed-loop note for the product demo.",
    createdAt: Date.now() - 15 * DAY,
    closedAt: Date.now() - 6 * DAY
  }
];

// SBRA events. Times are generated relative to "now" so the seed always looks upcoming.
export const eventSeed: SbraEvent[] = [
  {
    id: "evt-breakfast",
    title: "Breakfast Referral Club",
    type: "breakfast_club",
    description:
      "A sample of SBRA's signature Friday morning referral exchange. Members pay only for their meal.",
    startsAt: nextWeekday(5, 7, 30),
    endsAt: nextWeekday(5, 9, 0),
    recurrence: "weekly",
    venueName: "B2 Bistro & Bar",
    venueAddress: "701 Penn Ave, West Reading, PA",
    hostMemberId: "tom-alvarez",
    cost: 0,
    capacity: 30,
    createdById: "tom-alvarez"
  },
  {
    id: "evt-mingle",
    title: "Sample Member Mingle",
    type: "mingle",
    description:
      "Illustrative member-hosted evening Mingle for previewing registration and event discovery.",
    startsAt: nextWeekday(2, 17, 30) + 21 * DAY,
    endsAt: nextWeekday(2, 19, 30) + 21 * DAY,
    recurrence: "monthly",
    venueName: "Member host venue",
    venueAddress: "Berks County, PA",
    hostMemberId: "sofia-martinez",
    cost: 0,
    capacity: 40,
    createdById: "sofia-martinez"
  },
  {
    id: "evt-ribbon",
    title: "Sample Member Ribbon-Cutting",
    type: "ribbon_cutting",
    description:
      "Illustrative ribbon-cutting event used to preview the community calendar experience.",
    startsAt: nextWeekday(4, 16, 0) + 7 * DAY,
    endsAt: nextWeekday(4, 17, 30) + 7 * DAY,
    recurrence: "none",
    venueName: "Member business",
    venueAddress: "Berks County, PA",
    hostMemberId: "ari-rivera",
    cost: 0,
    capacity: 60,
    createdById: "ari-rivera"
  },
  {
    id: "evt-workshop",
    title: "Workshop: Master the Referral Exchange",
    type: "workshop",
    description:
      "Free bimonthly workshop on giving great referrals and closing the loop. Hands-on: build your 30-second intro and your ideal-referral profile.",
    startsAt: nextWeekday(3, 12, 0) + 10 * DAY,
    endsAt: nextWeekday(3, 13, 30) + 10 * DAY,
    recurrence: "none",
    venueName: "SBRA Resource Center",
    venueAddress: "2609 Keiser Blvd, Wyomissing, PA",
    cost: 0,
    capacity: 25,
    createdById: "grace-whitfield"
  }
];

// Seed RSVPs so the events show activity.
export const rsvpSeed: Rsvp[] = [
  { eventId: "evt-breakfast", memberId: "tom-alvarez", status: "going", checkedIn: false, respondedAt: Date.now() - 2 * DAY },
  { eventId: "evt-breakfast", memberId: "noah-patel", status: "going", checkedIn: false, respondedAt: Date.now() - 1 * DAY },
  { eventId: "evt-breakfast", memberId: "ari-rivera", status: "going", checkedIn: false, respondedAt: Date.now() - 1 * DAY },
  { eventId: "evt-breakfast", memberId: "jada-lee", status: "maybe", checkedIn: false, respondedAt: Date.now() - 1 * DAY },
  { eventId: "evt-mingle", memberId: "sofia-martinez", status: "going", checkedIn: false, respondedAt: Date.now() - 3 * DAY },
  { eventId: "evt-mingle", memberId: "grace-whitfield", status: "going", checkedIn: false, respondedAt: Date.now() - 2 * HOUR },
  { eventId: "evt-ribbon", memberId: "ari-rivera", status: "going", checkedIn: false, respondedAt: Date.now() - 4 * DAY }
];

// Seed comments so post threads aren't empty when opened.
export const commentSeed: Comment[] = [
  {
    id: "cmt-1",
    postId: "ari-popup",
    authorId: "jada-lee",
    authorName: "Tony Mazzo",
    body: "Welcome to the community spotlight!",
    createdAt: Date.now() - 1 * HOUR
  },
  {
    id: "cmt-2",
    postId: "ari-popup",
    authorId: "sofia-martinez",
    authorName: "Jevan Chen",
    body: "Great to see another local member featured.",
    createdAt: Date.now() - 30 * 60 * 1000
  },
  {
    id: "cmt-3",
    postId: "tom-huddle",
    authorId: "noah-patel",
    authorName: "Jim Long",
    body: "Thanks for sharing this member resource.",
    createdAt: Date.now() - 20 * 60 * 1000
  }
];

// A couple of seed reactions from other members (current user's are added live).
export const reactionSeed: Reaction[] = [
  { id: "rx-1", postId: "ari-popup", memberId: "jada-lee", type: "celebrate" },
  { id: "rx-2", postId: "ari-popup", memberId: "grace-whitfield", type: "celebrate" },
  { id: "rx-3", postId: "sofia-mingle", memberId: "ari-rivera", type: "support" }
];

export const supportCategories = [
  "Referral introduction",
  "Bookkeeping or legal",
  "Marketing help",
  "Hiring or HR",
  "Vendor recommendation",
  "Membership question"
];

export const supportRequests: SupportRequest[] = [
  {
    id: "referral-intro",
    title: "Intro to a commercial landscaper",
    category: "Referral introduction",
    status: "Assigned to SBRA staff",
    detail: "Property manager member needs grounds care for three sites — who should I connect them to?"
  },
  {
    id: "bookkeeping-help",
    title: "Bookkeeping before tax season",
    category: "Bookkeeping or legal",
    status: "Waiting on member match",
    detail: "New member is behind on their books and wants a referral to a trusted bookkeeper."
  },
  {
    id: "website-feedback",
    title: "Website refresh quote",
    category: "Marketing help",
    status: "Resolved yesterday",
    detail: "Connected a member with Power Marketing International for a homepage refresh."
  }
];

export const viewTitles = {
  community: "Community Home",
  directory: "Member Directory",
  referrals: "Referrals",
  events: "Events & Mingles",
  learn: "Learning Hub",
  support: "Support Center",
  profile: "My Profile",
  admin: "Admin Portal"
} as const;

export function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}
