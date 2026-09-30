import type { CrmStore, CrmContactStage } from "./crm";
import type { Business, Member, CommunityPost, CommunityEvent, Referral, Rsvp, Comment, Reaction, SupportRequest } from "./types";

// Fictional fixtures: deliberately separate from the production seed catalog.
const locations = [
  ["boston", "Harborlight Business Chamber", "Harborlight", "Boston, MA", "Northeast", "#245e83"],
  ["atlanta", "Peachtree Founders Alliance", "Peachtree", "Atlanta, GA", "Southeast", "#ad4b38"],
  ["miami", "Coastal Mercado Network", "Mercado", "Miami, FL", "Southeast", "#137a78"],
  ["chicago", "Lakefront Makers Chamber", "Lakefront", "Chicago, IL", "Midwest", "#515197"],
  ["austin", "Lone Oak Business Collective", "Lone Oak", "Austin, TX", "South Central", "#976024"],
  ["denver", "Front Range Enterprise Alliance", "Front Range", "Denver, CO", "Mountain West", "#376c54"],
  ["phoenix", "Desert Bloom Entrepreneurs", "Desert Bloom", "Phoenix, AZ", "Southwest", "#a6476c"],
  ["seattle", "Cascadia Independent Business Network", "Cascadia", "Seattle, WA", "Pacific Northwest", "#206b71"],
  ["los-angeles", "Pacific Mosaic Chamber", "Pacific Mosaic", "Los Angeles, CA", "Pacific Coast", "#6d5399"],
  ["honolulu", "Island Bridge Business Alliance", "Island Bridge", "Honolulu, HI", "Pacific Islands", "#247a60"],
] as const;
export const nationwideCommunities = locations.map(([cityId, name, shortName, city, region, color]) => ({
  id: `demo-${cityId}`, slug: `demo-${cityId}`, name, shortName, city, region, color,
  description: `Fictional demo network in ${city}. Local owners sharing referrals, workshops, and growth opportunities.`,
  kind: "organizational" as const, status: "active" as const, locale: "en", directoryOnly: false,
  logo: `/demo-networks/${cityId}.svg`,
}));
export const nationwideRegions = [...new Set(locations.map(row => row[4]))].map(name => ({ id: name, name }));
export const showcaseMember: Member = { id: "demo-alex-morgan", businessId: "demo-bridge-studio", name: "Alex Morgan", title: "Founder · demo member", email: "alex@example.com", phone: "", bio: "Fictional owner building partnerships across Collab communities.", isOwner: true };
export const showcaseAdmin: Member = { ...showcaseMember, id: "demo-jordan-ellis", name: "Jordan Ellis", title: "Community manager · demo admin", email: "jordan@example.com", role: "admin" };
const day = 86400000;
const now = Date.now();
function eventTime(days: number, hour: number) {
  const date = new Date(now + days * day);
  date.setHours(hour, 30, 0, 0);
  return date.getTime();
}
const names = ["Morgan Reed", "Sam Patel", "Taylor Brooks", "Casey Rivera", "Jamie Park", "Robin Hayes", "Drew Bennett", "Avery Chen"];
const specialties = [
  ["Creative Studio", "Marketing & Design", "Brand strategy, Website design, SEO", "Free 30-minute brand review for community members."],
  ["Table Catering", "Food & Hospitality", "Corporate catering, Event menus, Delivery", "10% off your first team lunch for 20 or more people."],
  ["Ledger Partners", "Accounting", "Bookkeeping, Payroll, Business planning", "Complimentary bookkeeping workflow review."],
  ["Systems Lab", "Technology", "IT support, Cybersecurity, Workflow automation", "Member workshop: simplify your customer onboarding."],
  ["Gathering House", "Events & Coworking", "Meeting rooms, Event space, Coworking", "Try a coworking day and meet three local founders."],
  ["People Practice", "Human Resources", "Hiring, Team training, HR operations", "Seeking a local photographer for our employer showcase."],
  ["Print Workshop", "Printing & Manufacturing", "Signs, Packaging, Small-batch printing", "Looking for a distribution partner in a second city."],
  ["Growth Coaching", "Business Consulting", "Sales coaching, Leadership, Growth planning", "Two scholarship seats in our next owner roundtable."],
];
export function nationwideSeed(id: string) {
  const community = nationwideCommunities.find(c => c.id === id);
  if (!community) return undefined;
  const prefix = community.shortName;
  const businesses: Business[] = specialties.map(([suffix, category, servicesOffered, memberOffer], i) => ({
    id: `${id}-business-${i}`, name: `${prefix} ${suffix}`, category,
    description: `Fictional ${community.city} business helping independent owners with ${servicesOffered.toLowerCase()}.`,
    servicesOffered, referralsWanted: i % 2 ? "Growing teams and community event organizers" : "Owners expanding into a new city or launching a new service",
    website: "", address: "Demo location", city: community.city, tier: i % 3 === 0 ? "growth" : "small", memberOffer,
  }));
  businesses.push({ id: showcaseMember.businessId, name: "Bridge Studio (demo)", category: "Business Consulting", description: "Your fictional business for this nationwide walkthrough.", servicesOffered: "Partnership planning, Market expansion", referralsWanted: "Organizations building partnerships in new cities", website: "", address: "", city: "Nationwide · remote", tier: "small" });
  const members: Member[] = businesses.slice(0, 8).map((b, i) => ({ id: `${id}-member-${i}`, businessId: b.id, name: names[(i + nationwideCommunities.indexOf(community)) % names.length], title: "Founder · sample member", email: `member${i}@example.com`, phone: "", bio: `Demo member of ${community.name}. Happy to make introductions in ${community.city}.`, isOwner: true }));
  members.push(showcaseMember, showcaseAdmin);
  const bodies = [
    `Welcome to ${community.name}! Introduce your business and tell us one connection you would like to make this month.`,
    "We met a partner through the national owner roundtable and completed our first joint project. Who else is exploring a second market?",
    `Looking for an event photographer in ${community.city} for a 60-person founder meetup. Recommendations welcome.`,
    "We have three seats open for our operations workshop. Bring one process you would like to improve.",
    "Member offer: book a discovery call this week and we will map your next three growth priorities together.",
    "Our next virtual exchange connects owners across the country. Share your introduction below.",
  ];
  const posts: CommunityPost[] = bodies.map((body, i) => ({ id: `${id}-post-${i}`, authorId: members[i].id, author: members[i].name, businessName: businesses[i].name, timeAgo: `${i + 1}h ago`, category: ["Announcement", "Win", "Question", "Announcement", "The Pitch", "General"][i], tone: (["blue", "green", "coral", "violet"] as const)[i % 4], body, note: "Fictional showcase activity", reactions: 3, comments: 2, createdAt: now - (i + 1) * 3600000, pinned: i === 0 }));
  const comments: Comment[] = posts.flatMap((post, i) => [1, 2].map(offset => ({ id: `${post.id}-comment-${offset}`, postId: post.id, authorId: members[(i + offset) % 8].id, authorName: members[(i + offset) % 8].name, body: offset === 1 ? "Happy to connect. I can share ideas at the next member meetup." : "Count me in! This is why I joined this community.", createdAt: now - offset * 1800000 })));
  const reactions: Reaction[] = posts.flatMap(post => members.slice(3, 6).map(m => ({ id: `${post.id}-${m.id}`, postId: post.id, memberId: m.id, type: "support" })));
  const events: CommunityEvent[] = [
    { id: `${id}-breakfast`, title: `${prefix} Founder Breakfast`, type: "breakfast_club", description: `Meet local owners, exchange introductions, and bring one referral request. Fictional event in ${community.city}.`, startsAt: eventTime(3, 8), venueName: `${prefix} Gathering House`, venueAddress: `${community.city} · demo venue`, recurrence: "monthly", cost: 15, capacity: 40, createdById: members[4].id },
    { id: `${id}-workshop`, title: "From first contact to repeat customer", type: "workshop", description: "A sample workshop on follow-ups, customer experience, and your next 90-day goal.", startsAt: eventTime(6, 13), venueName: `${prefix} Systems Lab`, venueAddress: `${community.city} · demo venue`, recurrence: "none", cost: 0, capacity: 24, createdById: members[3].id },
    { id: `${id}-exchange`, title: "Coast-to-Coast Owner Exchange", type: "huddle", description: "Fictional national exchange shown in every demo network. Meet a partner in another region. RSVPs in this prototype are local to each demo community. Times display in your device timezone.", startsAt: eventTime(9, 15), venueName: "Online · demo session", venueAddress: "Virtual demo", recurrence: "monthly", cost: 0, capacity: 100, createdById: showcaseAdmin.id },
  ];
  const rsvps: Rsvp[] = events.flatMap(event => members.slice(0, event.type === "huddle" ? 8 : 5).map(m => ({ eventId: event.id, memberId: m.id, status: "going", checkedIn: false, respondedAt: now - day })));
  const referrals: Referral[] = members.slice(0, 6).map((m, i) => ({ id: `${id}-referral-${i}`, kind: "intro", giverId: i % 2 ? m.id : showcaseMember.id, receiverId: i % 2 ? showcaseMember.id : m.id, introducedMemberId: members[(i + 2) % 8].id, need: ["Help a growing team update its website before opening in a new city.", "Find a catering partner for a regional member meetup.", "Connect an owner with bookkeeping support."][i % 3], status: i < 2 ? "won" : i === 5 ? "not_won" : "sent", createdAt: now - (i + 1) * day, ...(i < 2 ? { closedAt: now - day } : {}) }));
  const requests: SupportRequest[] = [{ id: `${id}-support`, authorId: showcaseMember.id, title: "Help inviting a colleague", category: "Membership", status: "Resolved", detail: "How can I invite my operations lead?", adminReply: "This sample conversation shows where your community team can respond to membership questions.", createdAt: now - 2 * day, resolvedAt: now - day }];
  return { businesses, members, posts, comments, reactions, events, rsvps, referrals, requests };
}

export function demoToolSamples(): Record<string, unknown> {
  const date = (offset: number) => new Date(now + offset * day).toISOString().slice(0, 10);
  return {
    "sbra.tool.crm": demoCrmStore(),
    "sbra.tool.goals": [{ id: "demo-goal-1", label: "Meet owners in three new markets (demo)", unit: "introductions", current: 7, target: 12, deadline: date(30), checkins: [{ date: date(-14), value: 2 }, { date: date(-7), value: 5 }, { date: date(0), value: 7 }] }, { id: "demo-goal-2", label: "Launch a joint workshop (demo)", unit: "registrations", current: 18, target: 30, deadline: date(21), checkins: [{ date: date(-7), value: 8 }, { date: date(0), value: 18 }] }],
    "sbra.tool.pricing": [{ id: "demo-price", name: "Demo workshop package", cost: "300", margin: "40", price: 500, profit: 200, markup: 200 / 3 }],
    "sbra.tool.marketing": [{ id: "demo-marketing", kind: "event", text: "Sample draft: Join our Coast-to-Coast Owner Exchange to meet business owners, trade introductions, and find a workshop partner. Bring your 30-second introduction!", date: date(0) }],
    "sbra.tool.docs": [{ id: "demo-doc", name: "Sample partner workshop agenda", body: "DEMO — PARTNER WORKSHOP\n\n1. Welcome and introductions (10 min)\n2. Three member stories (15 min)\n3. Referral exchange (20 min)\n4. Record follow-ups and choose a next meeting (10 min)", date: date(0) }],
    "sbra.tool.invoice": { profile: { fromName: "Bridge Studio (demo)", fromContact: "alex@example.com" }, nextNumber: 1004, docs: ["draft", "sent", "paid"].map((status, i) => ({ id: `demo-invoice-${i}`, docType: i === 0 ? "Quote" : "Invoice", number: `DEMO-${1001 + i}`, date: date(-i * 3), dueDate: date(14), fromName: "Bridge Studio (demo)", fromContact: "alex@example.com", toName: `${nationwideCommunities[i].shortName} Creative Studio (demo)`, toContact: `contact${i}@example.com`, items: [{ id: `demo-item-${i}`, desc: "Sample partner workshop planning", qty: "2", rate: "250" }], taxRate: "0", notes: "Fictional sample. No payment is due.", status, createdAt: now - i * day })) },
  };
}

export function demoCrmStore(): CrmStore {
  const date = (offset: number) => new Date(now + offset * day).toISOString().slice(0, 10);
  const contacts = nationwideCommunities.slice(0, 6).map((c, i) => ({ id: `demo-contact-${i}`, name: names[i], company: `${c.shortName} Creative Studio`, title: "Founder", email: `contact${i}@example.com`, phone: "", metAt: "Coast-to-Coast Owner Exchange (demo)", tags: [c.city, "Demo", "Partnership"], stage: ["new", "connected", "nurturing", "active", "dormant", "connected"][i], priority: i < 2, followUp: date(i - 1), note: `Discuss a joint workshop with ${c.name}. Fictional contact.`, activities: [{ id: `demo-activity-${i}`, type: "meeting", date: date(-3), text: "Met at the sample national exchange; agreed to share a workshop outline." }], createdAt: now - 3 * day }));
  const businessId = showcaseMember.businessId;
  return { version: 2, workspaces: { [businessId]: { businessId,
    contacts: contacts.map(c => ({ ...c, stage: c.stage as CrmContactStage, activities: c.activities.map(a => ({ ...a, type: "meeting" as const })) })),
    tasks: contacts.map((c, i) => ({ id: `demo-task-${i}`, title: i % 2 ? `Send workshop outline to ${c.name}` : `Follow up with ${c.name}`, contactId: c.id, dueDate: date(i - 1), createdAt: now - day })),
    opportunities: contacts.slice(0, 4).map((c, i) => ({ id: `demo-opportunity-${i}`, contactId: c.id, title: ["Boston partner workshop", "Atlanta brand refresh", "Miami owner roundtable", "Chicago launch campaign"][i], stage: (["new", "contacted", "proposal", "won"] as const)[i], value: [1500, 3200, 2400, 1800][i], expectedClose: date(14 + i), source: "manual", note: "Fictional opportunity for the nationwide showcase.", stageHistory: [], createdAt: now - 3 * day, updatedAt: now }))
  } } };
}
