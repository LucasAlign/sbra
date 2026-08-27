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
export const businessSeed: Business[] = [
  {
    id: "keystone-web",
    name: "Keystone Web Studio",
    category: "Marketing & Web",
    description: "Websites, branding, and social content for local small businesses.",
    servicesOffered: "Web design, Branding, SEO, Social media management",
    referralsWanted: "Owners launching or rebranding a business who need a professional website",
    website: "keystonewebstudio.com",
    address: "512 Penn Ave",
    city: "Wyomissing, PA",
    tier: "small"
  },
  {
    id: "berks-apparel",
    name: "Berks Apparel Co.",
    category: "Retail & Apparel",
    description: "Custom apparel and pop-up retail for teams, events, and local brands.",
    servicesOffered: "Custom printing, Embroidery, Event pop-ups, Team merch",
    referralsWanted: "Businesses, schools, or clubs needing branded apparel or event merch",
    website: "berksapparel.co",
    address: "48 N 5th St",
    city: "Reading, PA",
    tier: "solo"
  },
  {
    id: "sweet-laurel",
    name: "Sweet Laurel Catering",
    category: "Food & Catering",
    description: "Dessert-forward catering for corporate events, mingles, and celebrations.",
    servicesOffered: "Event catering, Dessert bars, Coffee service, Corporate lunches",
    referralsWanted: "Offices and event planners booking catering for meetings or parties",
    website: "sweetlaurelcatering.com",
    address: "22 Main St",
    city: "Exeter, PA",
    tier: "small"
  },
  {
    id: "greenedge-lawn",
    name: "GreenEdge Lawn & Landscape",
    category: "Home & Property Services",
    description: "Full-service lawn care and landscaping for homes and commercial properties.",
    servicesOffered: "Lawn maintenance, Landscaping, Snow removal, Commercial grounds",
    referralsWanted: "Property managers and homeowners needing recurring grounds care",
    website: "greenedgeberks.com",
    address: "1900 Shillington Rd",
    city: "Sinking Spring, PA",
    tier: "growth"
  },
  {
    id: "polished-nails",
    name: "Polished Mobile Nail Studio",
    category: "Beauty & Wellness",
    description: "On-location nail and spa services for events, offices, and private parties.",
    servicesOffered: "Mobile manicures, Event packages, Bridal parties, Office wellness days",
    referralsWanted: "Event planners and HR teams booking wellness or bridal experiences",
    website: "polishedmobilenails.com",
    address: "77 Kutztown Rd",
    city: "Laureldale, PA",
    tier: "solo"
  },
  {
    id: "vantage-insurance",
    name: "Vantage Insurance Group",
    category: "Financial & Insurance",
    description: "Commercial and personal insurance tailored to small business owners.",
    servicesOffered: "Business insurance, Workers comp, Personal lines, Benefits",
    referralsWanted: "New business owners who need commercial coverage or a policy review",
    website: "vantageinsgroup.com",
    address: "2601 Keiser Blvd",
    city: "Wyomissing, PA",
    tier: "enterprise"
  },
  {
    id: "cornerstone-books",
    name: "Cornerstone Bookkeeping",
    category: "Accounting & Finance",
    description: "Bookkeeping, payroll, and cash-flow coaching for growing small businesses.",
    servicesOffered: "Bookkeeping, Payroll, Tax prep coordination, Cash-flow reviews",
    referralsWanted: "Owners behind on their books or preparing for tax season",
    website: "cornerstonebooksberks.com",
    address: "150 N 6th St",
    city: "Reading, PA",
    tier: "small"
  }
];

// Members (people). Each belongs to one Business (many-to-one).
export const memberSeed: Member[] = [
  {
    id: "maya-chen",
    businessId: "keystone-web",
    name: "Maya Chen",
    title: "Owner & Creative Director",
    email: "maya@keystonewebstudio.com",
    phone: "484-555-0198",
    bio: "Helps first-time owners get a clean, credible web presence. Loves swapping referrals with printers and photographers.",
    isOwner: true
  },
  {
    id: "devin-brooks",
    businessId: "keystone-web",
    name: "Devin Brooks",
    title: "Web Developer",
    email: "devin@keystonewebstudio.com",
    phone: "484-555-0111",
    bio: "Front-end developer and the studio's main point of contact for support and hosting questions.",
    isOwner: false
  },
  {
    id: "ari-rivera",
    businessId: "berks-apparel",
    name: "Ari Rivera",
    title: "Owner",
    email: "ari@berksapparel.co",
    phone: "484-555-0142",
    bio: "Runs pop-ups across Berks County. Always looking to connect with event organizers and team leads.",
    isOwner: true
  },
  {
    id: "jada-lee",
    businessId: "sweet-laurel",
    name: "Jada Lee",
    title: "Owner & Head Baker",
    email: "jada@sweetlaurelcatering.com",
    phone: "484-555-0176",
    bio: "Caters SBRA mingles and corporate events. Happy to trade referrals with venues and planners.",
    isOwner: true
  },
  {
    id: "noah-patel",
    businessId: "greenedge-lawn",
    name: "Noah Patel",
    title: "Owner",
    email: "noah@greenedgeberks.com",
    phone: "484-555-0113",
    bio: "Grew from solo routes to a small crew. Mentors newer members on hiring and estimating.",
    isOwner: true
  },
  {
    id: "marisol-ortiz",
    businessId: "greenedge-lawn",
    name: "Marisol Ortiz",
    title: "Operations Lead",
    email: "marisol@greenedgeberks.com",
    phone: "484-555-0159",
    bio: "Coordinates crews and commercial accounts. Your contact for scheduling and quotes.",
    isOwner: false
  },
  {
    id: "sofia-martinez",
    businessId: "polished-nails",
    name: "Sofia Martinez",
    title: "Owner",
    email: "sofia@polishedmobilenails.com",
    phone: "484-555-0187",
    bio: "Turns event bookings into repeat clients. Great referral partner for planners and HR teams.",
    isOwner: true
  },
  {
    id: "grace-whitfield",
    businessId: "vantage-insurance",
    name: "Grace Whitfield",
    title: "Principal Agent",
    email: "grace@vantageinsgroup.com",
    phone: "484-555-0125",
    bio: "Twenty years insuring Berks small businesses. Offers free policy reviews to fellow members.",
    isOwner: true
  },
  {
    id: "tom-alvarez",
    businessId: "cornerstone-books",
    name: "Tom Alvarez",
    title: "Owner & Lead Bookkeeper",
    email: "tom@cornerstonebooksberks.com",
    phone: "484-555-0168",
    bio: "Keeps members' books clean and tax-ready. Frequent Breakfast Referral Club speaker on cash flow.",
    isOwner: true
  }
];

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
    author: "Ari Rivera",
    businessName: "Berks Apparel Co.",
    timeAgo: "18 min ago",
    category: "Referral Win",
    tone: "coral",
    body:
      "Closed the loop on the referral from Jada — catered event led to a 60-shirt merch order. Thank-you logged! This is exactly why I show up Friday mornings.",
    attachments: [
      { id: "ari-booth", name: "Pop-up booth", kind: "image", label: "Booth setup" },
      { id: "ari-products", name: "Merch rack", kind: "image", label: "Product rack" }
    ],
    reactions: 22,
    comments: 5
  },
  {
    id: "tom-huddle",
    author: "Tom Alvarez",
    businessName: "Cornerstone Bookkeeping",
    timeAgo: "42 min ago",
    category: "The Pitch",
    tone: "violet",
    body:
      "I'm the feature speaker at this Friday's Breakfast Referral Club — walking through the three numbers every owner should check weekly. Bring your questions.",
    note: "Reserve your seat under Events. Members eat for the cost of the meal.",
    attachments: [{ id: "tom-onepager", name: "cash-flow-one-pager.pdf", kind: "file" }],
    reactions: 14,
    comments: 8
  },
  {
    id: "noah-hiring",
    author: "Noah Patel",
    businessName: "GreenEdge Lawn & Landscape",
    timeAgo: "2 hr ago",
    category: "Member Ask",
    tone: "green",
    body:
      "Adding two crew members for summer commercial accounts. If you know reliable folks in Berks, send them my way — happy to return the referral.",
    attachments: [{ id: "noah-checklist", name: "crew-training-checklist.docx", kind: "file" }],
    reactions: 19,
    comments: 6
  },
  {
    id: "sofia-mingle",
    author: "Sofia Martinez",
    businessName: "Polished Mobile Nail Studio",
    timeAgo: "Yesterday",
    category: "Mingle",
    tone: "blue",
    body:
      "Hosting next month's Mingle at my studio! Come see the space, grab a mini-manicure, and let's trade some referrals. Applying to host was easy — recommend it.",
    attachments: [{ id: "sofia-space", name: "Studio space", kind: "image", label: "Studio" }],
    reactions: 31,
    comments: 9
  },
  {
    id: "grace-resource",
    author: "Grace Whitfield",
    businessName: "Vantage Insurance Group",
    timeAgo: "Yesterday",
    category: "Announcement",
    tone: "violet",
    body:
      "Reminder to members: I offer free policy reviews. If you've grown this year, your coverage may be behind. Book a 20-minute slot and let's make sure you're protected.",
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
    prospectName: "Berks Young Professionals",
    prospectContact: "events@berksyp.org",
    need: "Needs 60 branded shirts for their summer networking series.",
    status: "closed_won",
    closedValue: 1450,
    thankYou: "Thank you Jada! This closed at $1,450 — my biggest order yet.",
    createdAt: Date.now() - 9 * DAY,
    closedAt: Date.now() - 2 * DAY
  },
  {
    id: "ref-noah-tom",
    kind: "lead",
    giverId: "noah-patel",
    receiverId: "tom-alvarez",
    prospectName: "Marlowe HVAC",
    prospectContact: "owner@marlowehvac.com",
    need: "Growing HVAC company that's behind on bookkeeping before tax season.",
    status: "contacted",
    createdAt: Date.now() - 4 * DAY
  },
  {
    id: "ref-grace-maya",
    kind: "intro",
    giverId: "grace-whitfield",
    receiverId: "maya-chen",
    introducedMemberId: "sofia-martinez",
    need: "Sofia is rebranding and mentioned she needs a new website — you two should connect.",
    status: "given",
    createdAt: Date.now() - 1 * DAY
  },
  {
    id: "ref-tom-grace",
    kind: "lead",
    giverId: "tom-alvarez",
    receiverId: "grace-whitfield",
    prospectName: "Keystone Web Studio",
    prospectContact: "maya@keystonewebstudio.com",
    need: "Small team that just grew and may be underinsured — worth a policy review.",
    status: "closed_won",
    closedValue: 780,
    thankYou: "Appreciate it Tom — wrote a new business policy for them.",
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
      "Our signature Friday morning referral exchange. Feature speaker: Tom Alvarez on the three numbers every owner should check weekly. Members pay only for their meal.",
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
    title: "September Mingle at Polished Studio",
    type: "mingle",
    description:
      "Member-hosted evening Mingle. Tour Sofia's studio, grab a mini-manicure, and trade referrals over drinks. Hosted by a member — apply to host a future one!",
    startsAt: nextWeekday(2, 17, 30) + 21 * DAY,
    endsAt: nextWeekday(2, 19, 30) + 21 * DAY,
    recurrence: "monthly",
    venueName: "Polished Mobile Nail Studio",
    venueAddress: "77 Kutztown Rd, Laureldale, PA",
    hostMemberId: "sofia-martinez",
    cost: 0,
    capacity: 40,
    createdById: "sofia-martinez"
  },
  {
    id: "evt-ribbon",
    title: "Ribbon-Cutting: Berks Apparel Co.",
    type: "ribbon_cutting",
    description:
      "Celebrate Ari's new storefront with a ribbon-cutting and open house. Light refreshments provided. Bring a friend who might need custom apparel.",
    startsAt: nextWeekday(4, 16, 0) + 7 * DAY,
    endsAt: nextWeekday(4, 17, 30) + 7 * DAY,
    recurrence: "none",
    venueName: "Berks Apparel Co.",
    venueAddress: "48 N 5th St, Reading, PA",
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
    authorName: "Jada Lee",
    body: "So happy this worked out! Told you they'd love your merch.",
    createdAt: Date.now() - 1 * HOUR
  },
  {
    id: "cmt-2",
    postId: "ari-popup",
    authorId: "sofia-martinez",
    authorName: "Sofia Martinez",
    body: "Congrats Ari! Let's talk about branded merch for my studio events.",
    createdAt: Date.now() - 30 * 60 * 1000
  },
  {
    id: "cmt-3",
    postId: "tom-huddle",
    authorId: "noah-patel",
    authorName: "Noah Patel",
    body: "Signing up — my books are a mess before Q4.",
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
    detail: "Connected member with Keystone Web Studio for a homepage refresh."
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
