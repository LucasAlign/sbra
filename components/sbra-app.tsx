"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactElement } from "react";
import {
  createLiveComment,
  createLiveEvent,
  createLivePost,
  createLiveReferral,
  createLiveSupportRequest,
  getLiveServices,
  loadOrCreateUserProfile,
  saveUserProfile,
  setLiveCheckIn,
  setLiveRsvp,
  signInWithEmailPassword,
  signInForRole,
  toggleLiveReaction,
  updateLiveReferral,
  watchComments,
  watchEvents,
  watchPosts,
  watchReferrals,
  watchSupportRequests,
  type LiveUserProfile
} from "@/lib/data";
import { AdminView } from "@/components/admin-view";
import type { Session } from "next-auth";
import { signIn as authSignIn, signOut as authSignOut, useSession } from "next-auth/react";
import * as backendActions from "@/app/actions";
import { isBackendEnabled } from "@/lib/backend";
import { parseRosterFile } from "@/lib/importers";
import { communityOrganizations, getCommunityOrganization } from "@/lib/organizations";
import { latinoBusinessSeed, latinoMemberSeed } from "@/lib/latino-directory";
import {
  businessSeed,
  commentSeed,
  communityPosts,
  eventSeed,
  initials,
  learningModules,
  memberSeed,
  reactionSeed,
  referralSeed,
  rsvpSeed,
  supportCategories,
  supportRequests,
  viewTitles
} from "@/lib/seed-data";
import {
  eventTypeLabels,
  postCategories,
  referralStatusLabels,
  tierLabels,
  type Business,
  type Comment,
  type CommunityPost,
  type EventType,
  type Member,
  type MembershipTier,
  type PostAttachment,
  type Reaction,
  type Referral,
  type ReferralKind,
  type ReferralStatus,
  type Rsvp,
  type RsvpStatus,
  type SbraEvent,
  type SupportRequest,
  type UserRole,
  type ViewKey
} from "@/lib/types";

// Firebase removed (seed-first, decision #6). These stubs preserve the call
// sites; they never run while getLiveServices() returns null. When the backend
// is wired, real auth replaces them.
const onAuthStateChanged = (
  _auth: unknown,
  _next: (user: unknown) => void
): (() => void) => () => {};
const signOut = async (_auth: unknown): Promise<void> => {};

// Demo login credentials for seed mode (no backend). These are the only
// accepted email/password pairs when running on seed data — one member, one
// admin. They are no longer surfaced on the login screen.
// They carry no security: seed mode has no real backend or private data.
type DemoAccount = { email: string; password: string; role: UserRole; label: string };
const DEMO_ACCOUNTS: DemoAccount[] = [
  { email: "member@sbra.demo", password: "sbrademo", role: "member", label: "Member" },
  { email: "admin@sbra.demo", password: "sbrademo", role: "admin", label: "Admin" }
];

type MemberTextField = "name" | "title" | "email" | "phone" | "bio";
type DraftPostAttachment = PostAttachment & { file?: File };

// An open referral the receiver hasn't advanced within this many days is
// "stale" and surfaced as a nudge: stalled referrals starve the giver of the
// credit they earned, so we prompt the receiver to act.
const STALE_REFERRAL_DAYS = 7;
// Rolling window for the top-givers leaderboard. A calendar month reads empty
// near the 1st; a rolling window always reflects recent giving activity.
const LEADERBOARD_WINDOW_DAYS = 30;
const REFERRAL_DAY_MS = 24 * 60 * 60 * 1000;

function isReferralStale(referral: Referral, now: number): boolean {
  const open = referral.status === "given" || referral.status === "contacted";
  // Measure from the last activity (contacted, else created) so acting on a
  // referral resets the clock instead of nagging the receiver again immediately.
  const lastActivity = referral.contactedAt ?? referral.createdAt;
  return open && now - lastActivity >= STALE_REFERRAL_DAYS * REFERRAL_DAY_MS;
}

const demoAdminMember: Member = {
  id: "demo-admin",
  role: "admin",
  businessId: "sbra-administration",
  name: "Jordan Lee",
  title: "SBRA Administrator",
  email: "admin@sbra.demo",
  phone: "",
  bio: "Manages SBRA membership, reporting, and community operations.",
  isOwner: false
};

type ReferralDraft = {
  kind: ReferralKind;
  receiverId: string;
  introducedMemberId: string;
  prospectName: string;
  prospectContact: string;
  need: string;
};

const emptyReferralDraft: ReferralDraft = {
  kind: "lead",
  receiverId: "",
  introducedMemberId: "",
  prospectName: "",
  prospectContact: "",
  need: ""
};

type EventDraft = {
  title: string;
  type: EventType;
  description: string;
  startsAt: string; // datetime-local value
  venueName: string;
  venueAddress: string;
  cost: string;
  capacity: string;
};

const emptyEventDraft: EventDraft = {
  title: "",
  type: "mingle",
  description: "",
  startsAt: "",
  venueName: "",
  venueAddress: "",
  cost: "0",
  capacity: ""
};

type OnboardingDraft = {
  name: string;
  email: string;
  title: string;
  phone: string;
  bio: string;
  mode: "create" | "join";
  businessName: string;
  category: string;
  city: string;
  servicesOffered: string;
  referralsWanted: string;
  joinBusinessId: string;
};

const emptyOnboardingDraft: OnboardingDraft = {
  name: "",
  email: "",
  title: "Owner",
  phone: "",
  bio: "",
  mode: "create",
  businessName: "",
  category: "",
  city: "",
  servicesOffered: "",
  referralsWanted: "",
  joinBusinessId: ""
};

function slugify(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "biz"
  );
}

type GlobalSearchResult = {
  id: string;
  label: string;
  detail: string;
  view: ViewKey;
  businessId?: string;
};

const memberFields: MemberTextField[] = ["name", "title", "email", "phone", "bio"];

type NavItem = { key: ViewKey; label: string; count: string; icon: ViewKey; adminOnly?: boolean };

const navItems: NavItem[] = [
  { key: "community", label: "Home", count: "12", icon: "community" },
  { key: "directory", label: "Directory", count: "Members", icon: "directory" },
  { key: "referrals", label: "Referrals", count: "Core", icon: "referrals" },
  { key: "events", label: "Events", count: "Mingles", icon: "events" },
  { key: "learn", label: "Learn", count: "3", icon: "learn" },
  { key: "tools", label: "Tools", count: "Kit", icon: "tools" },
  { key: "support", label: "Support", count: "4", icon: "support" },
  { key: "profile", label: "Profile", count: "You", icon: "profile" },
  { key: "admin", label: "Admin tools", count: "Reports", icon: "admin", adminOnly: true }
];

const latinoNavItems: NavItem[] = [
  { key: "directory", label: "Directorio", count: "Miembros", icon: "directory" }
];

const primaryNavKeys: ViewKey[] = ["community", "directory", "referrals", "events", "tools"];

// Business Tools hub. Skeleton only for now: each tool renders a placeholder
// detail panel; the real calculators/generators get built in later per tool.
type ToolStatus = "soon" | "beta";
type ToolDef = {
  id: string;
  name: string;
  tagline: string;
  description: string;
  icon: string;
  status: ToolStatus;
};
type ToolCategory = {
  key: string;
  title: string;
  blurb: string;
  tools: ToolDef[];
};

const toolCategories: ToolCategory[] = [
  {
    key: "money",
    title: "Money & Finance",
    blurb: "Know your numbers — price right, bill fast, and see what referrals are worth.",
    tools: [
      {
        id: "referral-roi",
        name: "Referral ROI Calculator",
        tagline: "What the club is really worth to you",
        description:
          "Turn your given and received referrals into hard dollars — closed-loop value earned, given, and your net return from the exchange.",
        icon: "💸",
        status: "soon"
      },
      {
        id: "invoice-quote",
        name: "Invoice & Quote Generator",
        tagline: "Branded invoices and estimates in minutes",
        description:
          "Fill in a client and line items to produce a clean, branded invoice or quote you can download and send.",
        icon: "🧾",
        status: "soon"
      },
      {
        id: "pricing-margin",
        name: "Pricing & Margin Calculator",
        tagline: "Price for profit, not guesswork",
        description:
          "Enter costs and a target margin to get your price, markup, and break-even units at a glance.",
        icon: "🏷️",
        status: "soon"
      },
      {
        id: "loan-cashflow",
        name: "Loan & Cash-Flow Estimator",
        tagline: "See your runway before you commit",
        description:
          "Model loan payments, runway, and a simple 90-day cash-flow forecast so financing decisions are clear.",
        icon: "📉",
        status: "soon"
      }
    ]
  },
  {
    key: "growth",
    title: "Marketing & Networking",
    blurb: "Fill the pipeline and stay top-of-mind with the people you meet.",
    tools: [
      {
        id: "marketing-content",
        name: "Marketing Content Generator",
        tagline: "Draft posts and emails in seconds",
        description:
          "Answer a few prompts and generate ready-to-edit social posts, email blurbs, and promos in your voice.",
        icon: "✍️",
        status: "soon"
      },
      {
        id: "networking-crm",
        name: "Networking CRM Lite",
        tagline: "Never drop a follow-up again",
        description:
          "Track the contacts you meet at Breakfast Club and Mingles, log notes, and get reminders to follow up.",
        icon: "🤝",
        status: "soon"
      }
    ]
  },
  {
    key: "strategy",
    title: "Strategy & Performance",
    blurb: "Step back, size up the business, and track the goals that move it.",
    tools: [
      {
        id: "health-scorecard",
        name: "Business Health Scorecard",
        tagline: "A quick check-up across your business",
        description:
          "A short self-assessment across marketing, finance, operations, and sales that scores your business and points to next steps.",
        icon: "🩺",
        status: "soon"
      },
      {
        id: "goal-kpi",
        name: "Goal & KPI Tracker",
        tagline: "Set targets, watch them move",
        description:
          "Set quarterly goals and KPIs, log progress, and see momentum with simple visual progress bars.",
        icon: "🎯",
        status: "soon"
      }
    ]
  },
  {
    key: "resources",
    title: "Templates & Resources",
    blurb: "Grab-and-go documents, checklists, and local programs for Berks County owners.",
    tools: [
      {
        id: "doc-templates",
        name: "Document Template Library",
        tagline: "Contracts, NDAs, proposals — ready to fill",
        description:
          "A library of common business documents you can download, customize, and use right away.",
        icon: "📄",
        status: "soon"
      },
      {
        id: "breakeven-onepager",
        name: "Break-even & Margin One-Pagers",
        tagline: "Printable cheat sheets for your numbers",
        description:
          "Clean one-page break-even and profit-margin worksheets to plan and share.",
        icon: "📊",
        status: "soon"
      },
      {
        id: "tax-calendar",
        name: "Tax & Compliance Calendar",
        tagline: "Never miss a deadline",
        description:
          "Key tax and compliance dates with reminders so filings and renewals don't sneak up on you.",
        icon: "🗓️",
        status: "soon"
      },
      {
        id: "grant-finder",
        name: "Grant & Local Resource Finder",
        tagline: "Money and help near you",
        description:
          "Find grants, loans, and local programs — Berks LaunchBox, SBA, and county resources — matched to your business.",
        icon: "🧭",
        status: "soon"
      }
    ]
  }
];

type MemberAd = { sponsor: string; headline: string; copy: string; action: string; logo: string; tone: string };

const mockAds: MemberAd[] = [
  {
    sponsor: "Power Marketing International",
    headline: "Build a website designed to turn attention into leads.",
    copy: "Web design, online advertising, SEO, and social media support from an SBRA member.",
    action: "Member spotlight",
    logo: "https://irp.cdn-website.com/43c3ee7c/dms3rep/multi/opt/PMI-Logo-Black-150w.png",
    tone: "navy"
  },
  {
    sponsor: "Diamond Credit Union",
    headline: "A local financial partner for personal and business milestones.",
    copy: "Member-owned banking solutions built around the financial success of the people they serve.",
    action: "Meet the member",
    logo: "https://diamondcu.org/wp-content/uploads/2025/05/logo.png",
    tone: "sage"
  },
  {
    sponsor: "Precision Hearing Aid Center",
    headline: "Hear more of the moments that matter.",
    copy: "Local hearing evaluations, professional fittings, and ongoing hearing-aid service.",
    action: "Member spotlight",
    logo: "https://precisionhac.com/wp-content/uploads/2023/06/precisionhearingaidcenter-logofull-copy-v3-1.jpg",
    tone: "gold"
  },
  {
    sponsor: "Reading Dermatology Associates",
    headline: "Thoughtful skin care for every stage of life.",
    copy: "Medical and cosmetic dermatology for patients ranging from infants to seniors.",
    action: "Meet the member",
    logo: "https://readingderm.com/wp-content/uploads/2026/04/Logo.svg",
    tone: "coral"
  },
  {
    sponsor: "Security Service Company",
    headline: "Local security experience you can build around.",
    copy: "Security-system solutions from a Berks County SBRA member serving homes and businesses.",
    action: "Member spotlight",
    logo: "https://securityservicecompany.com/img/2022/12/SSC-Logo.svg",
    tone: "blue"
  }
];

function latinoBusinessLogo(name: string) {
  return latinoBusinessSeed.find((business) => business.name === name)?.logo || "/sbra-mark.png";
}

const latinoAds: MemberAd[] = [
  { sponsor: "Fritura Kings", headline: "Sabor local para compartir en comunidad.", copy: "Restaurante miembro de la Cámara Latina en Reading.", action: "Conoce al miembro", logo: latinoBusinessLogo("Fritura Kings"), tone: "coral" },
  { sponsor: "OmniV Global Systems, LLC", headline: "Tecnología para conectar y hacer crecer tu negocio.", copy: "Sistemas y soluciones empresariales de un miembro local.", action: "Ver negocio", logo: latinoBusinessLogo("OmniV Global Systems, LLC"), tone: "blue" },
  { sponsor: "Penn State Berks", headline: "Educación y recursos para avanzar.", copy: "Programas de educación continua y Berks LaunchBox.", action: "Conoce al miembro", logo: latinoBusinessLogo("Penn State Berks"), tone: "navy" },
  { sponsor: "KimonoMono, LLC", headline: "Estrategia y mercadeo con propósito.", copy: "Apoyo creativo para marcas y empresas en crecimiento.", action: "Ver negocio", logo: latinoBusinessLogo("KimonoMono, LLC"), tone: "sage" },
  { sponsor: "Tec Centro Berks", headline: "Capacitación que abre nuevas oportunidades.", copy: "Desarrollo de la fuerza laboral para nuestra comunidad.", action: "Conoce al miembro", logo: latinoBusinessLogo("Tec Centro Berks"), tone: "gold" }
];

// Illustrative demo savings from member pricing, included events, and learning.
// Referral revenue remains sourced from closed referral records below.
const memberSavings: Record<string, { amount: number; detail: string }> = {
  "maya-chen": { amount: 860, detail: "Workshops + member services" },
  "devin-brooks": { amount: 340, detail: "Events + learning" },
  "ari-rivera": { amount: 720, detail: "Vendor discounts + events" },
  "jada-lee": { amount: 1180, detail: "Member pricing + workshops" },
  "noah-patel": { amount: 1540, detail: "Training + vendor discounts" },
  "marisol-ortiz": { amount: 410, detail: "Learning + events" },
  "sofia-martinez": { amount: 630, detail: "Events + member services" },
  "grace-whitfield": { amount: 1320, detail: "Programs + member pricing" },
  "tom-alvarez": { amount: 940, detail: "Workshops + events" }
};

function splitList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function SBRAApp() {
  const liveServices = useMemo(() => getLiveServices(), []);
  const backendEnabled = Boolean(liveServices);
  const dbEnabled = useMemo(() => isBackendEnabled(), []);
  // Session is fed in by <SessionBridge>, mounted only in backend mode so that
  // useSession() (and its /api/auth/session fetch) never runs in seed mode.
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [liveProfile, setLiveProfile] = useState<LiveUserProfile | null>(null);
  const [authLoading, setAuthLoading] = useState(backendEnabled);
  const [liveNote, setLiveNote] = useState(
    backendEnabled
      ? "Backend connected. Sign in to load live data."
      : "Demo mode: running on seed data. Sign in as a member or admin to explore."
  );
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginRole, setLoginRole] = useState<UserRole>("member");
  const [activeView, setActiveView] = useState<ViewKey>("community");
  const [activeOrganizationId, setActiveOrganizationId] = useState("sbra");
  const activeOrganization = getCommunityOrganization(activeOrganizationId);
  const isLatino = activeOrganizationId === "berks-latino-chamber";
  // Keeps the active destination scrolled into view within the horizontally
  // scrollable mobile nav bar, so the selected tab is always visible.
  const activeNavRef = useRef<HTMLButtonElement | null>(null);
  const [members, setMembers] = useState<Member[]>(memberSeed);
  const [businesses, setBusinesses] = useState<Business[]>(businessSeed);
  const [posts, setPosts] = useState(communityPosts);
  const [requests, setRequests] = useState(supportRequests);
  const [referrals, setReferrals] = useState<Referral[]>(referralSeed);
  const [referralComposerOpen, setReferralComposerOpen] = useState(false);
  const [referralDraft, setReferralDraft] = useState<ReferralDraft>(emptyReferralDraft);
  const [closingReferral, setClosingReferral] = useState<Referral | null>(null);
  const [events, setEvents] = useState<SbraEvent[]>(eventSeed);
  const [rsvps, setRsvps] = useState<Rsvp[]>(rsvpSeed);
  const [eventComposerOpen, setEventComposerOpen] = useState(false);
  const [eventDraft, setEventDraft] = useState<EventDraft>(emptyEventDraft);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [onboardingDraft, setOnboardingDraft] = useState<OnboardingDraft>(emptyOnboardingDraft);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [activeBusiness, setActiveBusiness] = useState<Business | null>(null);
  const [activeMember, setActiveMember] = useState<Member | null>(null);
  const [draftMember, setDraftMember] = useState<Member | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [postDraft, setPostDraft] = useState("");
  const [postCategory, setPostCategory] = useState<string>("General");
  const [postAttachments, setPostAttachments] = useState<DraftPostAttachment[]>([]);
  const [comments, setComments] = useState<Comment[]>(commentSeed);
  const [reactions, setReactions] = useState<Reaction[]>(reactionSeed);
  const [openComments, setOpenComments] = useState<string[]>([]);
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [globalSearch, setGlobalSearch] = useState("");
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [supportCategory, setSupportCategory] = useState(supportCategories[0]);
  const [supportDetail, setSupportDetail] = useState("");
  const [adminNote, setAdminNote] = useState("Choose an admin tool to preview the next operational workflow.");
  const [importNote, setImportNote] = useState(
    "Upload CSV or Excel columns like name, business, category, email, phone, city, services, referralsWanted."
  );

  const businessById = useMemo(() => {
    const map = new Map<string, Business>();
    businesses.forEach((business) => map.set(business.id, business));
    return map;
  }, [businesses]);

  const membersByBusiness = useMemo(() => {
    const map = new Map<string, Member[]>();
    members.forEach((member) => {
      const list = map.get(member.businessId) ?? [];
      list.push(member);
      map.set(member.businessId, list);
    });
    return map;
  }, [members]);

  const memberById = useMemo(() => {
    const map = new Map<string, Member>();
    members.forEach((member) => map.set(member.id, member));
    return map;
  }, [members]);

  const currentMember = liveProfile ?? (role === "admin" ? demoAdminMember : members[0]);
  const currentBusiness = currentMember ? businessById.get(currentMember.businessId) : undefined;

  useEffect(() => {
    activeNavRef.current?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [activeView, role]);

  useEffect(() => {
    if (!liveServices) {
      setAuthLoading(false);
      return;
    }

    let authSettled = false;
    const authFallback = window.setTimeout(() => {
      if (!authSettled) {
        setAuthLoading(false);
        setLiveNote("Backend connected. Sign in to load live data.");
      }
    }, 3000);

    const stopAuthListener = onAuthStateChanged(liveServices.auth, async (user) => {
      authSettled = true;
      window.clearTimeout(authFallback);
      if (!user) {
        setLiveProfile(null);
        setRole(null);
        setAuthLoading(false);
        return;
      }

      try {
        const profile = await loadOrCreateUserProfile(user, "member");
        if (!profile) return;
        setLiveProfile(profile);
        setRole(profile.role);
        setMembers((records) => [profile, ...records.filter((person) => person.id !== profile.id)]);
        setActiveView("community");
        setLiveNote("Profile loaded. Feed and support requests are live.");
      } catch (error) {
        setLiveNote(error instanceof Error ? error.message : "Unable to load profile.");
      } finally {
        setAuthLoading(false);
      }
    });

    return () => {
      window.clearTimeout(authFallback);
      stopAuthListener();
    };
  }, [liveServices]);

  useEffect(() => {
    if (!liveServices || !role) return;

    const stopPosts = watchPosts(
      (livePosts) => setPosts(livePosts),
      (error) => setLiveNote(`Posts are still using local data: ${error.message}`)
    );
    const stopRequests = watchSupportRequests(
      (liveRequests) => setRequests(liveRequests),
      (error) => setLiveNote(`Support requests are still using local data: ${error.message}`)
    );
    const stopReferrals = watchReferrals(
      (liveReferrals) => setReferrals(liveReferrals),
      (error) => setLiveNote(`Referrals are still using local data: ${error.message}`)
    );
    const stopEvents = watchEvents(
      (liveEvents) => setEvents(liveEvents),
      (error) => setLiveNote(`Events are still using local data: ${error.message}`)
    );
    const stopComments = watchComments(
      (liveComments) => setComments(liveComments),
      (error) => setLiveNote(`Comments are still using local data: ${error.message}`)
    );

    return () => {
      stopPosts?.();
      stopRequests?.();
      stopReferrals?.();
      stopEvents?.();
      stopComments?.();
    };
  }, [liveServices, role]);

  // When the real backend is enabled (NEXT_PUBLIC_BACKEND_ENABLED=1 + DATABASE_URL),
  // replace the seed collections with live data from Postgres on mount.
  useEffect(() => {
    if (!dbEnabled) return;
    let active = true;
    void backendActions.bootstrap().then((data) => {
      if (!active || !data) return;
      setBusinesses(data.businesses);
      setMembers(data.members);
      setReferrals(data.referrals);
      setEvents(data.events);
      setRsvps(data.rsvps);
      setPosts(data.posts);
      setComments(data.comments);
      setReactions(data.reactions);
    });
    return () => {
      active = false;
    };
  }, [dbEnabled]);

  // In backend/auth mode, a signed-in Auth.js session enters the app and is
  // matched to a member by email (open self-signup lands as a generic member).
  useEffect(() => {
    if (!dbEnabled || role || !session?.user?.email) return;
    const email = session.user.email.toLowerCase();
    const matched = members.find((member) => member.email.toLowerCase() === email);
    if (matched) {
      setLiveProfile({ ...matched, uid: matched.id, role: "member" });
    }
    setRole("member");
    setActiveView("community");
  }, [dbEnabled, session, role, members]);

  const visibleNav = (isLatino ? latinoNavItems : navItems).filter((item) => !item.adminOnly || role === "admin");
  const primaryNav = visibleNav.filter((item) => primaryNavKeys.includes(item.key));
  const moreNav = visibleNav.filter((item) => !primaryNavKeys.includes(item.key));
  // Admins get their tools pinned to the top of the sidebar, above Home. The
  // mobile bar keeps them under More so it stays four tabs wide.
  const adminNavItem = visibleNav.find((item) => item.key === "admin");
  const sidebarNav = adminNavItem ? [adminNavItem, ...primaryNav] : primaryNav;
  const sidebarMoreNav = moreNav.filter((item) => item.key !== "admin");

  const categories = useMemo(
    () => Array.from(new Set(businesses.map((business) => business.category))).sort(),
    [businesses]
  );

  const filteredBusinesses = useMemo(() => {
    const query = search.trim().toLowerCase();
    return businesses.filter((business) => {
      const haystack = [
        business.name,
        business.category,
        business.description,
        business.servicesOffered,
        business.referralsWanted,
        business.city
      ]
        .join(" ")
        .toLowerCase();
      const matchesQuery = !query || haystack.includes(query);
      const matchesCategory = categoryFilter === "all" || business.category === categoryFilter;
      return matchesQuery && matchesCategory;
    });
  }, [businesses, categoryFilter, search]);

  const globalResults = useMemo<GlobalSearchResult[]>(() => {
    const query = globalSearch.trim().toLowerCase();
    if (!query) return [];

    const results: GlobalSearchResult[] = [];
    businesses.forEach((business) => {
      const haystack = [business.name, business.category, business.servicesOffered, business.referralsWanted, business.city]
        .join(" ")
        .toLowerCase();
      if (haystack.includes(query)) {
        results.push({
          id: `business-${business.id}`,
          label: business.name,
          detail: `${business.category} · ${business.city}`,
          view: "directory",
          businessId: business.id
        });
      }
    });

    members.forEach((member) => {
      const business = businessById.get(member.businessId);
      const haystack = [member.name, member.title, member.email, business?.name ?? ""].join(" ").toLowerCase();
      if (haystack.includes(query)) {
        results.push({
          id: `member-${member.id}`,
          label: member.name,
          detail: `${member.title}${business ? ` · ${business.name}` : ""}`,
          view: "directory",
          businessId: member.businessId
        });
      }
    });

    posts.forEach((post) => {
      const haystack = [post.author, post.category, post.body, post.businessName].join(" ").toLowerCase();
      if (haystack.includes(query)) {
        results.push({
          id: `post-${post.id}`,
          label: post.category,
          detail: `${post.author}: ${post.body}`,
          view: "community"
        });
      }
    });

    learningModules.forEach((module) => {
      const haystack = [module.title, module.description].join(" ").toLowerCase();
      if (haystack.includes(query)) {
        results.push({ id: `module-${module.number}`, label: module.title, detail: module.description, view: "learn" });
      }
    });

    requests.forEach((request) => {
      const haystack = [request.title, request.category, request.status, request.detail].join(" ").toLowerCase();
      if (haystack.includes(query)) {
        results.push({
          id: `request-${request.id}`,
          label: request.title,
          detail: `${request.status}: ${request.detail}`,
          view: "support"
        });
      }
    });

    return results.slice(0, 8);
  }, [businessById, businesses, globalSearch, members, posts, requests]);

  const alerts = useMemo(
    () => [
      {
        id: "support-alert",
        title: "Support queue updated",
        detail: `${requests.filter((request) => !request.status.toLowerCase().startsWith("resolved")).length} requests need attention.`,
        view: "support" as ViewKey
      },
      {
        id: "referral-alert",
        title: "Referrals wanted",
        detail: `${businesses.length} member businesses are open to new referrals.`,
        view: "directory" as ViewKey
      },
      {
        id: "event-alert",
        title: "Breakfast Referral Club",
        detail: "Friday 7:30 AM at B2 Bistro — sample event details for the member demo.",
        view: "community" as ViewKey
      }
    ],
    [businesses.length, requests]
  );

  async function loginAs(nextRole: UserRole) {
    if (!liveServices) {
      setRole(nextRole);
      setActiveView("community");
      return;
    }

    setAuthLoading(true);
    setLiveNote("Opening sign-in...");
    try {
      const credential = await signInForRole(nextRole);
      if (!credential) return;
      const profile = await loadOrCreateUserProfile(credential.user, nextRole);
      if (!profile) return;
      setLiveProfile(profile);
      setRole(profile.role);
      setMembers((records) => [profile, ...records.filter((person) => person.id !== profile.id)]);
      setActiveView("community");
      setLiveNote(`Signed in as ${profile.role}.`);
    } catch (error) {
      setLiveNote(error instanceof Error ? error.message : "Sign-in failed.");
    } finally {
      setAuthLoading(false);
    }
  }

  async function loginWithEmailPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!liveServices) {
      // Seed mode: validate against the fixed demo accounts. The matched
      // account's role wins (so the admin credential always lands in admin),
      // independent of the Member/Admin toggle.
      const email = loginEmail.trim().toLowerCase();
      const account = DEMO_ACCOUNTS.find(
        (candidate) => candidate.email === email && candidate.password === loginPassword
      );
      if (!account) {
        setLiveNote("Invalid demo credentials.");
        return;
      }
      setRole(account.role);
      setActiveView("community");
      setLoginPassword("");
      return;
    }

    if (!loginEmail.trim() || !loginPassword) {
      setLiveNote("Enter an email and password to sign in.");
      return;
    }

    setAuthLoading(true);
    setLiveNote("Signing in...");
    try {
      const credential = await signInWithEmailPassword(loginEmail.trim(), loginPassword);
      if (!credential) return;
      const profile = await loadOrCreateUserProfile(credential.user, loginRole);
      if (!profile) return;
      setLiveProfile(profile);
      setRole(profile.role);
      setMembers((records) => [profile, ...records.filter((person) => person.id !== profile.id)]);
      setActiveView("community");
      setLoginPassword("");
      setLiveNote(`Signed in as ${profile.role}.`);
    } catch (error) {
      setLiveNote(error instanceof Error ? error.message : "Email sign-in failed.");
    } finally {
      setAuthLoading(false);
    }
  }

  async function signOutCurrentUser() {
    if (liveServices) {
      await signOut(liveServices.auth);
      setLiveNote("Signed out.");
    }
    if (dbEnabled && session?.user) {
      await authSignOut({ redirect: false });
    }
    setRole(null);
    setLiveProfile(null);
  }

  function changeView(view: ViewKey) {
    if (view === "admin" && role !== "admin") {
      setActiveView("community");
      return;
    }
    setActiveView(view);
    setGlobalSearchOpen(false);
    setAlertsOpen(false);
    setSettingsOpen(false);
  }

  function openBusiness(business: Business) {
    setActiveBusiness(business);
  }

  function openMemberEditor(member: Member) {
    setActiveMember(member);
    setDraftMember({ ...member });
  }

  async function saveMember() {
    if (!draftMember) return;
    setMembers((records) => records.map((person) => (person.id === draftMember.id ? draftMember : person)));
    if (dbEnabled) void backendActions.persistMember(draftMember);
    if (liveProfile && draftMember.id === liveProfile.id) {
      const updatedProfile = { ...liveProfile, ...draftMember };
      setLiveProfile(updatedProfile);
      await saveUserProfile(updatedProfile);
      setLiveNote("Profile saved.");
    }
    setActiveMember(null);
    setDraftMember(null);
  }

  async function createPost() {
    const body = postDraft.trim();
    if (!body && postAttachments.length === 0) return;

    if (liveServices && liveProfile) {
      try {
        await createLivePost({
          body,
          files: postAttachments.flatMap((attachment) => (attachment.file ? [attachment.file] : [])),
          profile: liveProfile
        });
        setPostDraft("");
        setPostAttachments([]);
        setComposerOpen(false);
        setLiveNote("Post saved.");
      } catch (error) {
        setLiveNote(error instanceof Error ? error.message : "Unable to save this post.");
      }
      return;
    }

    const toneByCategory: Record<string, CommunityPost["tone"]> = {
      Win: "coral",
      Announcement: "violet",
      "The Pitch": "violet",
      Question: "blue",
      Podcast: "green",
      General: "green"
    };
    const newPost: CommunityPost = {
      id: `post-${Date.now()}`,
      author: currentMember?.name ?? "SBRA Member",
      businessName: currentBusiness?.name ?? "",
      timeAgo: "Just now",
      category: postCategory,
      tone: toneByCategory[postCategory] ?? "green",
      body: body || "Shared new files with the community.",
      attachments: postAttachments,
      reactions: 0,
      comments: 0
    };
    setPosts((records) => [newPost, ...records]);
    if (dbEnabled) void backendActions.persistPost(newPost);
    setPostDraft("");
    setPostCategory("General");
    setPostAttachments([]);
    setComposerOpen(false);
  }

  function toggleReaction(postId: string) {
    if (!currentMember) return;
    const memberId = currentMember.id;
    if (liveServices && liveProfile) {
      void toggleLiveReaction(postId, memberId, "celebrate");
      return;
    }
    if (dbEnabled) void backendActions.toggleReaction(postId, memberId);
    setReactions((records) => {
      const existing = records.find(
        (reaction) => reaction.postId === postId && reaction.memberId === memberId && reaction.type === "celebrate"
      );
      if (existing) {
        return records.filter((reaction) => reaction.id !== existing.id);
      }
      return [...records, { id: `rx-${Date.now()}`, postId, memberId, type: "celebrate" }];
    });
  }

  function toggleCommentThread(postId: string) {
    setOpenComments((open) => (open.includes(postId) ? open.filter((id) => id !== postId) : [...open, postId]));
  }

  function addComment(postId: string) {
    if (!currentMember) return;
    const body = (commentDrafts[postId] ?? "").trim();
    if (!body) return;
    const authorName = currentMember.name;
    if (liveServices && liveProfile) {
      void createLiveComment({ postId, authorId: currentMember.id, authorName, body });
    } else {
      const newComment: Comment = {
        id: `cmt-${Date.now()}`,
        postId,
        authorId: currentMember.id,
        authorName,
        body,
        createdAt: Date.now()
      };
      setComments((records) => [...records, newComment]);
      if (dbEnabled) void backendActions.persistComment(newComment);
    }
    setCommentDrafts((drafts) => ({ ...drafts, [postId]: "" }));
  }

  function addPostFiles(fileList: FileList | null) {
    if (!fileList) return;
    const nextFiles = Array.from(fileList).map<DraftPostAttachment>((file, index) => ({
      id: `attachment-${Date.now()}-${index}`,
      name: file.name,
      kind: file.type.startsWith("image/") ? "image" : "file",
      url: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined,
      contentType: file.type,
      size: file.size,
      file
    }));
    setPostAttachments((records) => [...records, ...nextFiles]);
  }

  function removePostAttachment(id: string) {
    setPostAttachments((records) => records.filter((attachment) => attachment.id !== id));
  }

  async function createSupportRequest() {
    const detail = supportDetail.trim();
    if (!detail) return;

    if (liveServices && liveProfile) {
      try {
        await createLiveSupportRequest({ category: supportCategory, detail, profile: liveProfile });
        setSupportDetail("");
        setLiveNote("Support request saved.");
      } catch (error) {
        setLiveNote(error instanceof Error ? error.message : "Unable to save this support request.");
      }
      return;
    }

    const newRequest: SupportRequest = {
      id: `request-${Date.now()}`,
      title: supportCategory,
      category: supportCategory,
      status: "New request",
      detail
    };
    setRequests((records) => [newRequest, ...records]);
    setSupportDetail("");
  }

  function openReferralComposer() {
    setReferralDraft(emptyReferralDraft);
    setReferralComposerOpen(true);
  }

  async function submitReferral() {
    if (!currentMember) return;
    const draft = referralDraft;
    if (!draft.receiverId || !draft.need.trim()) return;
    if (draft.kind === "intro" && !draft.introducedMemberId) return;

    const base = {
      kind: draft.kind,
      giverId: currentMember.id,
      receiverId: draft.receiverId,
      need: draft.need.trim(),
      ...(draft.kind === "intro"
        ? { introducedMemberId: draft.introducedMemberId }
        : { prospectName: draft.prospectName.trim(), prospectContact: draft.prospectContact.trim() })
    };

    if (liveServices && liveProfile) {
      try {
        await createLiveReferral(base);
        setReferralComposerOpen(false);
        setLiveNote("Referral sent.");
      } catch (error) {
        setLiveNote(error instanceof Error ? error.message : "Unable to send this referral.");
      }
      return;
    }

    const newReferral: Referral = {
      id: `ref-${Date.now()}`,
      status: "given",
      createdAt: Date.now(),
      ...base
    };
    setReferrals((records) => [newReferral, ...records]);
    if (dbEnabled) void backendActions.insertReferral(newReferral);
    setReferralComposerOpen(false);
  }

  async function patchReferral(id: string, changes: Partial<Referral>) {
    if (liveServices && liveProfile) {
      try {
        await updateLiveReferral(id, changes);
        return;
      } catch (error) {
        setLiveNote(error instanceof Error ? error.message : "Unable to update this referral.");
        return;
      }
    }
    setReferrals((records) => records.map((referral) => (referral.id === id ? { ...referral, ...changes } : referral)));
    if (dbEnabled) void backendActions.updateReferral(id, changes);
  }

  function markReferralContacted(referral: Referral) {
    void patchReferral(referral.id, { status: "contacted", contactedAt: Date.now() });
  }

  function markReferralLost(referral: Referral) {
    void patchReferral(referral.id, { status: "closed_lost", closedAt: Date.now() });
  }

  function closeReferralWon(referral: Referral, closedValue: number, thankYou: string) {
    void patchReferral(referral.id, {
      status: "closed_won",
      closedValue,
      thankYou: thankYou.trim() || undefined,
      closedAt: Date.now()
    });
    setClosingReferral(null);
  }

  function setEventRsvp(eventId: string, status: RsvpStatus) {
    if (!currentMember) return;
    const memberId = currentMember.id;
    if (liveServices && liveProfile) {
      void setLiveRsvp(eventId, memberId, status);
      return;
    }
    setRsvps((records) => {
      const existing = records.find((rsvp) => rsvp.eventId === eventId && rsvp.memberId === memberId);
      if (existing) {
        return records.map((rsvp) =>
          rsvp.eventId === eventId && rsvp.memberId === memberId
            ? { ...rsvp, status, respondedAt: Date.now(), checkedIn: status === "going" ? rsvp.checkedIn : false }
            : rsvp
        );
      }
      return [...records, { eventId, memberId, status, checkedIn: false, respondedAt: Date.now() }];
    });
    if (dbEnabled) void backendActions.setRsvp(eventId, memberId, status);
  }

  function toggleCheckIn(eventId: string) {
    if (!currentMember) return;
    const memberId = currentMember.id;
    const existing = rsvps.find((rsvp) => rsvp.eventId === eventId && rsvp.memberId === memberId);
    const nextChecked = !(existing?.checkedIn ?? false);
    if (liveServices && liveProfile) {
      void setLiveCheckIn(eventId, memberId, nextChecked);
      return;
    }
    setRsvps((records) => {
      if (!existing) {
        return [...records, { eventId, memberId, status: "going", checkedIn: true, respondedAt: Date.now() }];
      }
      return records.map((rsvp) =>
        rsvp.eventId === eventId && rsvp.memberId === memberId
          ? { ...rsvp, checkedIn: nextChecked, status: "going" }
          : rsvp
      );
    });
    if (dbEnabled) void backendActions.setCheckIn(eventId, memberId, nextChecked);
  }

  async function submitEvent() {
    if (!currentMember) return;
    const draft = eventDraft;
    if (!draft.title.trim() || !draft.startsAt || !draft.venueName.trim()) return;

    const startsAt = new Date(draft.startsAt).getTime();
    const base = {
      title: draft.title.trim(),
      type: draft.type,
      description: draft.description.trim(),
      startsAt,
      recurrence: "none" as const,
      venueName: draft.venueName.trim(),
      venueAddress: draft.venueAddress.trim(),
      hostMemberId: currentMember.id,
      cost: Number(draft.cost) || 0,
      capacity: draft.capacity ? Number(draft.capacity) : undefined,
      createdById: currentMember.id
    };

    if (liveServices && liveProfile) {
      try {
        await createLiveEvent(base);
        setEventComposerOpen(false);
        setLiveNote("Event created.");
      } catch (error) {
        setLiveNote(error instanceof Error ? error.message : "Unable to create this event.");
      }
      return;
    }

    const newEvent: SbraEvent = { id: `evt-${Date.now()}`, ...base };
    setEvents((records) => [newEvent, ...records]);
    // creator auto-RSVPs as going
    const creatorRsvp: Rsvp = {
      eventId: newEvent.id,
      memberId: currentMember.id,
      status: "going",
      checkedIn: false,
      respondedAt: Date.now()
    };
    setRsvps((records) => [...records, creatorRsvp]);
    if (dbEnabled) {
      void backendActions.persistEvent(newEvent);
      void backendActions.setRsvp(newEvent.id, currentMember.id, "going");
    }
    setEventComposerOpen(false);
    setEventDraft(emptyEventDraft);
  }

  function openEventComposer() {
    setEventDraft(emptyEventDraft);
    setEventComposerOpen(true);
  }

  function finishOnboarding() {
    const draft = onboardingDraft;
    if (!draft.name.trim() || !draft.email.trim()) return;
    if (draft.mode === "create" && !draft.businessName.trim()) return;
    if (draft.mode === "join" && !draft.joinBusinessId) return;

    const memberId = `member-${Date.now()}`;
    let businessId: string;
    let newBusiness: Business | null = null;

    if (draft.mode === "create") {
      businessId = `biz-${slugify(draft.businessName)}-${Date.now()}`;
      newBusiness = {
        id: businessId,
        name: draft.businessName.trim(),
        category: draft.category.trim() || "Uncategorized",
        description: "",
        servicesOffered: draft.servicesOffered.trim(),
        referralsWanted: draft.referralsWanted.trim(),
        website: "",
        address: "",
        city: draft.city.trim(),
        tier: "solo"
      };
    } else {
      businessId = draft.joinBusinessId;
    }

    const newMember: Member = {
      id: memberId,
      businessId,
      name: draft.name.trim(),
      title: draft.title.trim() || (draft.mode === "create" ? "Owner" : "Team member"),
      email: draft.email.trim(),
      phone: draft.phone.trim(),
      bio: draft.bio.trim(),
      isOwner: draft.mode === "create",
      role: "member"
    };

    if (newBusiness) setBusinesses((records) => [newBusiness as Business, ...records]);
    setMembers((records) => [newMember, ...records]);
    setLiveProfile({ ...newMember, uid: memberId, role: "member" });
    setRole("member");
    setActiveView("community");
    setOnboardingOpen(false);
    setOnboardingDraft(emptyOnboardingDraft);

    if (dbEnabled) {
      if (newBusiness) void backendActions.insertBusinessWithOwner(newBusiness, newMember);
      else void backendActions.insertMember(newMember);
    }
  }

  function openSearchResult(result: GlobalSearchResult) {
    setActiveView(result.view);
    setGlobalSearchOpen(false);
    setAlertsOpen(false);
    setSettingsOpen(false);
    setGlobalSearch("");
    if (result.businessId) {
      const business = businessById.get(result.businessId);
      if (business) openBusiness(business);
    }
  }

  async function handleImport(file: File | undefined) {
    if (!file || role !== "admin") return;

    try {
      const imported = await parseRosterFile(file);
      setBusinesses((records) => [...imported.map((row) => row.business), ...records]);
      setMembers((records) => [...imported.map((row) => row.member), ...records]);
      if (dbEnabled) void backendActions.persistImportedMembers(imported);
      setImportNote(`Imported ${imported.length} member${imported.length === 1 ? "" : "s"} from ${file.name}.`);
      setActiveView("directory");
    } catch (error) {
      setImportNote(error instanceof Error ? error.message : "Unable to import this roster.");
    }
  }

  const roleLabel = role === "admin" ? "Admin" : "Member";

  function selectNav(view: ViewKey) {
    changeView(view);
    setMoreOpen(false);
  }

  function selectOrganization(organizationId: string) {
    const latino = organizationId === "berks-latino-chamber";
    setActiveOrganizationId(organizationId);
    setBusinesses(latino ? latinoBusinessSeed : businessSeed);
    setMembers(latino ? latinoMemberSeed : memberSeed);
    setActiveView(latino ? "directory" : "community");
    setSearch("");
    setCategoryFilter("all");
    setActiveBusiness(null);
    setMoreOpen(false);
    setAlertsOpen(false);
    setSettingsOpen(false);
    setGlobalSearchOpen(false);
  }

  if (authLoading) {
    return (
      <main className="login-screen">
        <section className="glass-panel login-card">
          <h1 className="login-brand-lockup">
            <img src="/berks-county-collab.png" alt="Berks County Collab" width={1254} height={1254} />
          </h1>
          <h2 className="login-heading">Local networks. One community.</h2>
          <div className="login-network"><span>Founding network</span><LogoBlock large /></div>
          <p className="login-copy">Loading your community...</p>
        </section>
      </main>
    );
  }

  if (!role) {
    return (
      <main className="login-screen">
        {dbEnabled && <SessionBridge onSession={setSession} />}
        <section className="glass-panel login-card">
          <h1 className="login-brand-lockup">
            <img src="/berks-county-collab.png" alt="Berks County Collab" width={1254} height={1254} />
          </h1>
          <h2 className="login-heading">Your local business community, connected.</h2>
          <div className="login-network"><span>Founding network</span><LogoBlock large /></div>
          <p className="tagline">Be Better. Grow Faster.</p>
          <p className="login-copy">{liveNote}</p>
          <div className="login-form">
            <div className="role-toggle" aria-label="Choose sign-in role">
              <button type="button" className={loginRole === "member" ? "active" : ""} onClick={() => setLoginRole("member")}>
                Member
              </button>
              <button type="button" className={loginRole === "admin" ? "active" : ""} onClick={() => setLoginRole("admin")}>
                Admin
              </button>
            </div>
            {backendEnabled ? (
              <form className="login-form nested" onSubmit={(event) => void loginWithEmailPassword(event)}>
                <input
                  aria-label="Email"
                  autoComplete="email"
                  inputMode="email"
                  placeholder="Email"
                  type="email"
                  value={loginEmail}
                  onChange={(event) => setLoginEmail(event.target.value)}
                />
                <input
                  aria-label="Password"
                  autoComplete="current-password"
                  placeholder="Password"
                  type="password"
                  value={loginPassword}
                  onChange={(event) => setLoginPassword(event.target.value)}
                />
                <button className="primary-button" type="submit">
                  Sign In
                </button>
              </form>
            ) : dbEnabled ? (
              <button className="primary-button" type="button" onClick={() => void authSignIn("google")}>
                Continue with Google
              </button>
            ) : (
              <button
                className="primary-button"
                type="button"
                onClick={() => {
                  setRole(loginRole);
                  setActiveView(loginRole === "admin" ? "admin" : "community");
                }}
              >
                Enter {loginRole === "admin" ? "admin" : "member"} demo
              </button>
            )}
          </div>
          {backendEnabled && (
            <div className="login-actions compact">
              <button className="secondary-button" onClick={() => void loginAs(loginRole)}>
                Continue with Google
              </button>
            </div>
          )}
          <p className="login-signup">
            New to {activeOrganization.shortName}?{" "}
            <button
              type="button"
              className="link-button"
              onClick={() => {
                setOnboardingDraft(emptyOnboardingDraft);
                setOnboardingOpen(true);
              }}
            >
              Create your member profile
            </button>
          </p>
        </section>
        {onboardingOpen && (
          <OnboardingWizard
            draft={onboardingDraft}
            businesses={businesses}
            onChange={setOnboardingDraft}
            onClose={() => setOnboardingOpen(false)}
            onFinish={finishOnboarding}
          />
        )}
      </main>
    );
  }

  return (
    <div className="app-shell">
      {dbEnabled && <SessionBridge onSession={setSession} />}
      <aside className="glass-panel sidebar">
        <div className="brand">
          {activeOrganization.logo ? (
            <div className="brand-logo organization-logo">
              <img src={activeOrganization.logo} alt="Cámara de Comercio Latina del Condado de Berks" />
            </div>
          ) : <LogoBlock />}
          <div>
            <h1>{isLatino ? "Red de la Cámara Latina" : `${activeOrganization.shortName} Network`}</h1>
          </div>
        </div>

        <label className="organization-switcher">
          <span>{isLatino ? "Comunidad" : "Community"}</span>
          <select
            value={activeOrganizationId}
            onChange={(event) => selectOrganization(event.target.value)}
            aria-label={isLatino ? "Elegir organización comunitaria" : "Choose community organization"}
          >
            {communityOrganizations.map((organization) => (
              <option
                key={organization.id}
                value={organization.id}
                disabled={organization.status !== "active"}
              >
                {organization.shortName}{organization.status === "coming_soon" ? " — Coming soon" : ""}
              </option>
            ))}
          </select>
          <small>{activeOrganization.name}{activeOrganization.isFoundingPartner ? " · Founding partner" : ""}</small>
        </label>

        <nav className="nav-list" aria-label="Primary">
          {sidebarNav.map((item) => (
            <NavButton key={item.key} item={item} active={activeView === item.key} onClick={() => selectNav(item.key)} />
          ))}
          {!isLatino && <button className={moreOpen || sidebarMoreNav.some((item) => item.key === activeView) ? "nav-item active" : "nav-item"} onClick={() => setMoreOpen((open) => !open)} aria-expanded={moreOpen}>
            <span className="nav-icon">•••</span><span><strong>More</strong><small>Learn, support &amp; profile</small></span>
          </button>}
          {!isLatino && moreOpen && <div className="more-menu">{sidebarMoreNav.map((item) => <NavButton key={item.key} item={item} active={activeView === item.key} onClick={() => selectNav(item.key)} />)}</div>}
        </nav>

        <section className="theme-card">
          <p className="section-label">{isLatino ? "Sesión activa" : "Signed in"}</p>
          <div className="role-grid compact">
            <div>
              <strong>{isLatino ? (role === "admin" ? "Administrador" : "Miembro") : roleLabel}</strong>
              <span>
                {liveProfile?.email ||
                  (role === "admin" ? "Reports, import, moderation" : currentBusiness?.name || "Member")}
              </span>
            </div>
          </div>
          <div className="live-note">{isLatino ? "Directorio público de miembros de la Cámara Latina." : liveNote}</div>
          <button className="secondary-button logout-button" onClick={() => void signOutCurrentUser()}>
            <span className="button-icon">O</span>
            {isLatino ? "Cerrar sesión" : "Sign out"}
          </button>
        </section>
      </aside>

      <main className="main-panel">
        <header className="glass-panel topbar">
          <div>
            <p className="eyebrow">{isLatino ? `${activeOrganization.shortName} · Bienvenido` : `${activeOrganization.shortName} · Welcome back, ${currentMember?.name.split(" ")[0] || "there"}`}</p>
            <h2>{isLatino ? "Directorio de miembros" : viewTitles[activeView]}</h2>
          </div>
          <div className="top-actions">
            <span className="session-pill">{isLatino ? (role === "admin" ? "Administrador" : "Miembro") : roleLabel}</span>
            <button
              className={globalSearchOpen ? "icon-button active" : "icon-button"}
              aria-label={isLatino ? "Buscar" : "Search"}
              onClick={() => {
                setGlobalSearchOpen((open) => !open);
                setAlertsOpen(false);
              }}
            >
              {isLatino ? "Buscar" : "Search"}
            </button>
            {!isLatino && <button
              className={alertsOpen ? "icon-button active" : "icon-button"}
              aria-label="Notifications"
              onClick={() => {
                setAlertsOpen((open) => !open);
                setGlobalSearchOpen(false);
              }}
            >
              <UtilityIcon icon="bell" />
            </button>}
            {!isLatino && <button
              className={settingsOpen ? "icon-button active" : "icon-button"}
              aria-label="Settings"
              onClick={() => {
                setSettingsOpen((open) => !open);
                setAlertsOpen(false);
                setGlobalSearchOpen(false);
              }}
            >
              <UtilityIcon icon="settings" />
            </button>}
            {!isLatino && <button className="primary-button" onClick={() => setComposerOpen(true)}>
              <span className="button-icon">+</span>
              New Post
            </button>}
          </div>
          {globalSearchOpen && (
            <div className="top-popover search-popover">
              <input
                aria-label={isLatino ? "Buscar en el directorio" : "Search Berks County Collab"}
                autoFocus
                placeholder={isLatino ? "Buscar negocios, miembros o servicios..." : "Search businesses, members, posts, support..."}
                value={globalSearch}
                onChange={(event) => setGlobalSearch(event.target.value)}
              />
              <div className="popover-list">
                {globalResults.map((result) => (
                  <button key={result.id} onClick={() => openSearchResult(result)}>
                    <strong>{result.label}</strong>
                    <span>{result.detail}</span>
                  </button>
                ))}
                {globalSearch.trim() && globalResults.length === 0 && <p>{isLatino ? "No hay resultados." : "No matches yet."}</p>}
                {!globalSearch.trim() && <p>{isLatino ? "Busca un negocio, miembro o servicio." : "Try a business, member, service, support topic, or module."}</p>}
              </div>
            </div>
          )}
          {!isLatino && alertsOpen && (
            <div className="top-popover alerts-popover">
              <p className="section-label">Notifications</p>
              <div className="popover-list">
                {alerts.map((alert) => (
                  <button key={alert.id} onClick={() => changeView(alert.view)}>
                    <strong>{alert.title}</strong>
                    <span>{alert.detail}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {!isLatino && settingsOpen && (
            <div className="top-popover settings-popover">
              <p className="section-label">Settings</p>
              <div className="settings-list">
                <label>
                  <span>Community digest</span>
                  <input type="checkbox" defaultChecked />
                </label>
                <label>
                  <span>Referral alerts</span>
                  <input type="checkbox" defaultChecked />
                </label>
                <label>
                  <span>Compact directory cards</span>
                  <input type="checkbox" />
                </label>
              </div>
            </div>
          )}
        </header>

        <AdBanner ads={isLatino ? latinoAds : mockAds} spanish={isLatino} />

        {activeView === "community" && (
          <CommunityView
            posts={posts}
            referrals={referrals}
            memberById={memberById}
            businessById={businessById}
            reactions={reactions}
            comments={comments}
            currentMemberId={currentMember?.id ?? ""}
            openComments={openComments}
            commentDrafts={commentDrafts}
            authorInitials={currentMember ? initials(currentMember.name) : "SB"}
            composerOpen={composerOpen}
            postDraft={postDraft}
            postCategory={postCategory}
            attachments={postAttachments}
            onOpenComposer={() => setComposerOpen(true)}
            onPostDraft={setPostDraft}
            onPostCategory={setPostCategory}
            onAddFiles={addPostFiles}
            onRemoveAttachment={removePostAttachment}
            onCreatePost={createPost}
            onToggleReaction={toggleReaction}
            onToggleCommentThread={toggleCommentThread}
            onCommentDraft={(postId, value) => setCommentDrafts((drafts) => ({ ...drafts, [postId]: value }))}
            onAddComment={addComment}
            onCancelPost={() => {
              setComposerOpen(false);
              setPostDraft("");
              setPostAttachments([]);
            }}
            onFindMember={() => selectNav("directory")}
            onGiveReferral={openReferralComposer}
            onViewEvents={() => selectNav("events")}
          />
        )}
        {activeView === "directory" && (
          <DirectoryView
            businesses={filteredBusinesses}
            membersByBusiness={membersByBusiness}
            categories={categories}
            categoryFilter={categoryFilter}
            search={search}
            onCategoryFilter={setCategoryFilter}
            onSearch={setSearch}
            onOpenBusiness={openBusiness}
            spanish={isLatino}
          />
        )}
        {activeView === "referrals" && (
          <ReferralsView
            referrals={referrals}
            memberById={memberById}
            businessById={businessById}
            currentMemberId={currentMember?.id ?? ""}
            onGive={openReferralComposer}
            onMarkContacted={markReferralContacted}
            onMarkLost={markReferralLost}
            onOpenClose={setClosingReferral}
          />
        )}
        {activeView === "events" && (
          <EventsView
            events={events}
            rsvps={rsvps}
            memberById={memberById}
            currentMemberId={currentMember?.id ?? ""}
            onCreate={() => {
              if (role === "admin") {
                openEventComposer();
              } else {
                setSupportCategory("Event proposal");
                setSupportDetail("I would like to propose an event. Suggested topic, date, location, and audience: ");
                selectNav("support");
              }
            }}
            onRsvp={setEventRsvp}
            onToggleCheckIn={toggleCheckIn}
            canCreate={role === "admin"}
          />
        )}
        {activeView === "learn" && <LearnView />}
        {activeView === "tools" && (
          <ToolsView
            referrals={referrals}
            currentMemberId={currentMember?.id ?? ""}
            memberById={memberById}
            currentMember={currentMember}
            currentBusiness={currentBusiness}
            onGetHelp={() => selectNav("support")}
          />
        )}
        {activeView === "support" && (
          <SupportView
            requests={requests}
            selectedCategory={supportCategory}
            detail={supportDetail}
            onCategory={setSupportCategory}
            onDetail={setSupportDetail}
            onCreateRequest={createSupportRequest}
          />
        )}
        {activeView === "profile" && (
          <ProfileView member={currentMember} business={currentBusiness} onEdit={openMemberEditor} />
        )}
        {activeView === "admin" && role === "admin" && (
          <AdminView
            businesses={businesses}
            members={members}
            referrals={referrals}
            events={events}
            rsvps={rsvps}
            requests={requests}
            posts={posts}
            comments={comments}
            reactions={reactions}
            importNote={importNote}
            adminNote={adminNote}
            onAdminAction={setAdminNote}
            onImport={handleImport}
          />
        )}
      </main>

      <nav className="glass-panel mobile-nav" aria-label="Mobile primary">
        {primaryNav.map((item) => (
          <button
            key={item.key}
            ref={activeView === item.key ? activeNavRef : null}
            className={activeView === item.key ? "active" : ""}
            onClick={() => selectNav(item.key)}
            aria-label={item.label}
          >
            <span className="mobile-icon">
              <NavIcon icon={item.icon} />
            </span>
            <span>{item.label}</span>
          </button>
        ))}
        {!isLatino && <button className={moreNav.some((item) => item.key === activeView) ? "active" : ""} onClick={() => setMoreOpen((open) => !open)} aria-label="More">
          <span className="mobile-icon">•••</span><span>More</span>
        </button>}
      </nav>
      {moreOpen && <div className="mobile-more-menu glass-panel">{moreNav.map((item) => <button key={item.key} className={activeView === item.key ? "active" : ""} onClick={() => selectNav(item.key)}><NavIcon icon={item.icon} /><span>{item.label}</span></button>)}</div>}

      {activeBusiness && (
        <BusinessModal
          business={activeBusiness}
          members={membersByBusiness.get(activeBusiness.id) ?? []}
          onClose={() => setActiveBusiness(null)}
          spanish={isLatino}
        />
      )}

      {activeMember && draftMember && (
        <MemberModal
          draft={draftMember}
          business={businessById.get(draftMember.businessId)}
          onChange={setDraftMember}
          onClose={() => setActiveMember(null)}
          onSave={saveMember}
        />
      )}

      {referralComposerOpen && currentMember && (
        <GiveReferralModal
          draft={referralDraft}
          members={members}
          businessById={businessById}
          currentMemberId={currentMember.id}
          onChange={setReferralDraft}
          onClose={() => setReferralComposerOpen(false)}
          onSubmit={submitReferral}
        />
      )}

      {closingReferral && (
        <CloseReferralModal
          referral={closingReferral}
          memberById={memberById}
          onClose={() => setClosingReferral(null)}
          onConfirm={closeReferralWon}
        />
      )}

      {eventComposerOpen && currentMember && (
        <CreateEventModal
          draft={eventDraft}
          onChange={setEventDraft}
          onClose={() => setEventComposerOpen(false)}
          onSubmit={submitEvent}
        />
      )}
    </div>
  );
}

function AdBanner({ ads, spanish = false }: { ads: MemberAd[]; spanish?: boolean }) {
  const [activeAd, setActiveAd] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const timer = window.setInterval(() => {
      setActiveAd((current) => (current + 1) % ads.length);
    }, 12_000);
    return () => window.clearInterval(timer);
  }, [ads.length, paused]);

  const ad = ads[activeAd];

  return (
    <aside
      className={`sponsor-banner sponsor-${ad.tone}`}
      aria-label={spanish ? `Promoción de muestra del miembro ${ad.sponsor}` : `Sample member promotion from ${ad.sponsor}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false);
      }}
    >
      <div className="sponsor-mark">
        <img src={ad.logo} alt={`${ad.sponsor} logo`} />
      </div>
      <div className="sponsor-message" aria-live="polite">
        <p><span>{spanish ? "Promoción de miembro" : "Sample member promotion"}</span>{ad.sponsor}</p>
        <div className="sponsor-copy">
          <strong>{ad.headline}</strong>
          <small>{ad.copy}</small>
        </div>
      </div>
      <span className="sponsor-action">{ad.action}<span aria-hidden="true">→</span></span>
      <div className="sponsor-controls" aria-label={spanish ? "Elegir anuncio" : "Choose advertisement"}>
        {ads.map((item, index) => (
          <button
            key={item.sponsor}
            className={index === activeAd ? "active" : ""}
            onClick={() => setActiveAd(index)}
            aria-label={spanish ? `Mostrar anuncio ${index + 1}: ${item.sponsor}` : `Show ad ${index + 1}: ${item.sponsor}`}
            aria-current={index === activeAd ? "true" : undefined}
          />
        ))}
      </div>
    </aside>
  );
}

function LogoBlock({ large = false }: { large?: boolean }) {
  if (large) {
    // Login / hero: full horizontal SBRA wordmark.
    return (
      <div className="brand-logo large-logo">
        <img
          className="brand-logo-wordmark"
          src="/sbra-logo.png"
          alt="Small Business Resource Association"
          width={313}
          height={40}
        />
      </div>
    );
  }
  // Compact (sidebar/header): the SBRA "A" mark in a rounded tile.
  return (
    <div className="brand-logo">
      <img
        className="brand-logo-mark"
        src="/sbra-mark.png"
        alt="SBRA"
        width={180}
        height={128}
      />
    </div>
  );
}

function TierBadge({ tier }: { tier: MembershipTier }) {
  return <span className={`tier-badge tier-${tier}`}>{tierLabels[tier]}</span>;
}

function NavButton({
  item,
  active,
  onClick
}: {
  item: NavItem;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button className={active ? "nav-item active" : "nav-item"} onClick={onClick}>
      <span>
        <span className="nav-icon">
          <NavIcon icon={item.icon} />
        </span>
        {item.label}
      </span>
      <strong>{item.count}</strong>
    </button>
  );
}

function NavIcon({ icon }: { icon: ViewKey }) {
  const common = {
    width: "18",
    height: "18",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true
  };

  if (icon === "community") {
    return (
      <svg {...common}>
        <path d="M3 10.5 12 3l9 7.5" />
        <path d="M5 10v10h14V10" />
        <path d="M9 20v-6h6v6" />
      </svg>
    );
  }

  if (icon === "directory") {
    return (
      <svg {...common}>
        <path d="M8 7a4 4 0 1 0 8 0 4 4 0 0 0-8 0Z" />
        <path d="M4 21a8 8 0 0 1 16 0" />
      </svg>
    );
  }

  if (icon === "referrals") {
    return (
      <svg {...common}>
        <path d="M4 8h13" />
        <path d="m14 5 3 3-3 3" />
        <path d="M20 16H7" />
        <path d="m10 13-3 3 3 3" />
      </svg>
    );
  }

  if (icon === "events") {
    return (
      <svg {...common}>
        <rect x="3" y="4" width="18" height="17" rx="2" />
        <path d="M3 9h18" />
        <path d="M8 2v4" />
        <path d="M16 2v4" />
      </svg>
    );
  }

  if (icon === "learn") {
    return (
      <svg {...common}>
        <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5v-16Z" />
        <path d="M8 7h8" />
        <path d="M8 11h6" />
      </svg>
    );
  }

  if (icon === "support") {
    return (
      <svg {...common}>
        <path d="M12 21s8-4.5 8-11a5 5 0 0 0-8-4 5 5 0 0 0-8 4c0 6.5 8 11 8 11Z" />
      </svg>
    );
  }

  if (icon === "profile") {
    return (
      <svg {...common}>
        <circle cx="12" cy="8" r="4" />
        <path d="M5 21a7 7 0 0 1 14 0" />
      </svg>
    );
  }

  if (icon === "tools") {
    return (
      <svg {...common}>
        <path d="M14.7 6.3a4 4 0 0 0-5.4 5.2L3 17.8 6.2 21l6.3-6.3a4 4 0 0 0 5.2-5.4l-2.6 2.6-2.2-.4-.4-2.2 2.6-2.6Z" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <path d="M4 6h16" />
      <path d="M4 12h16" />
      <path d="M4 18h16" />
      <path d="M8 3v18" />
      <path d="M16 3v18" />
    </svg>
  );
}

function UtilityIcon({ icon }: { icon: "bell" | "settings" | "paperclip" }) {
  const common = {
    width: "18",
    height: "18",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true
  };

  if (icon === "bell") {
    return (
      <svg {...common}>
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
        <path d="M10 21h4" />
      </svg>
    );
  }

  if (icon === "settings") {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1A2 2 0 1 1 4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1A2 2 0 1 1 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1A2 2 0 1 1 19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.1a2 2 0 1 1 0 4H21a1.7 1.7 0 0 0-1.6 1Z" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <path d="m21.4 11.6-8.5 8.5a6 6 0 0 1-8.5-8.5l8.9-8.9a4 4 0 0 1 5.7 5.7l-8.9 8.9a2 2 0 0 1-2.8-2.8l8.5-8.5" />
    </svg>
  );
}

function CommunityView({
  posts,
  referrals,
  memberById,
  businessById,
  reactions,
  comments,
  currentMemberId,
  openComments,
  commentDrafts,
  authorInitials,
  composerOpen,
  postDraft,
  postCategory,
  attachments,
  onOpenComposer,
  onPostDraft,
  onPostCategory,
  onAddFiles,
  onRemoveAttachment,
  onCreatePost,
  onToggleReaction,
  onToggleCommentThread,
  onCommentDraft,
  onAddComment,
  onCancelPost,
  onFindMember,
  onGiveReferral,
  onViewEvents
}: {
  posts: CommunityPost[];
  referrals: Referral[];
  memberById: Map<string, Member>;
  businessById: Map<string, Business>;
  reactions: Reaction[];
  comments: Comment[];
  currentMemberId: string;
  openComments: string[];
  commentDrafts: Record<string, string>;
  authorInitials: string;
  composerOpen: boolean;
  postDraft: string;
  postCategory: string;
  attachments: PostAttachment[];
  onOpenComposer: () => void;
  onPostDraft: (value: string) => void;
  onPostCategory: (value: string) => void;
  onAddFiles: (files: FileList | null) => void;
  onRemoveAttachment: (id: string) => void;
  onCreatePost: () => void;
  onToggleReaction: (postId: string) => void;
  onToggleCommentThread: (postId: string) => void;
  onCommentDraft: (postId: string, value: string) => void;
  onAddComment: (postId: string) => void;
  onCancelPost: () => void;
  onFindMember: () => void;
  onGiveReferral: () => void;
  onViewEvents: () => void;
}) {
  const referralLeaders = Array.from(memberById.values())
    .map((member) => {
      const sent = referrals.filter((referral) => referral.giverId === member.id);
      const wins = sent.filter((referral) => referral.status === "closed_won");
      return {
        member,
        business: businessById.get(member.businessId),
        sent: sent.length,
        wins: wins.length,
        generated: wins.reduce((sum, referral) => sum + (referral.closedValue ?? 0), 0)
      };
    })
    .filter((row) => row.sent > 0)
    .sort((a, b) => b.sent - a.sent || b.generated - a.generated)
    .slice(0, 5);

  return (
    <>
    <section className="quick-actions" aria-label="Quick actions">
      <button className="glass-panel quick-action" onClick={onFindMember}><span className="quick-action-icon">⌕</span><span><strong>Find a member</strong><small>Search businesses and services</small></span></button>
      <button className="glass-panel quick-action" onClick={onGiveReferral}><span className="quick-action-icon">↗</span><span><strong>Give a referral</strong><small>Connect a lead with a member</small></span></button>
      <button className="glass-panel quick-action" onClick={onViewEvents}><span className="quick-action-icon">◇</span><span><strong>View events</strong><small>RSVP to upcoming gatherings</small></span></button>
    </section>
    <section className="glass-panel feed-leaderboard" aria-labelledby="feed-leaderboard-title">
      <div className="feed-leaderboard-head">
        <div>
          <p className="section-label">Referral leaderboard</p>
          <h3 id="feed-leaderboard-title">Members making connections</h3>
        </div>
        <button className="link-button" onClick={onGiveReferral}>Give a referral →</button>
      </div>
      <div className="feed-leader-list">
        {referralLeaders.map((row, index) => (
          <div className="feed-leader" key={row.member.id}>
            <span className={`leader-rank rank-${index + 1}`}>{index + 1}</span>
            <span className="impact-avatar">{initials(row.member.name)}</span>
            <span className="leader-person">
              <strong>{row.member.name}</strong>
              <small>{row.business?.name ?? "SBRA member"}</small>
            </span>
            <span className="leader-metric"><strong>{row.sent}</strong><small>Sent</small></span>
            <span className="leader-metric"><strong>{row.wins}</strong><small>Won</small></span>
            <span className="leader-value"><strong>${row.generated.toLocaleString()}</strong><small>Generated</small></span>
          </div>
        ))}
      </div>
    </section>
    <section className="content-grid">
      <div className="feed-column">
        <div className="glass-panel composer">
          <div className="avatar">{authorInitials}</div>
          {composerOpen ? (
            <div className="composer-form">
              <textarea
                aria-label="New community post"
                autoFocus
                placeholder="Share a win, ask for a referral, or post an opportunity..."
                value={postDraft}
                onChange={(event) => onPostDraft(event.target.value)}
              />
              {attachments.length > 0 && (
                <div className="attachment-preview-list">
                  {attachments.map((attachment) => (
                    <div className="draft-attachment" key={attachment.id}>
                      <AttachmentPreview attachment={attachment} />
                      <button onClick={() => onRemoveAttachment(attachment.id)} aria-label={`Remove ${attachment.name}`}>
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="composer-category">
                <span className="section-label">Category</span>
                <div className="category-chips">
                  {postCategories.map((category) => (
                    <button
                      key={category}
                      type="button"
                      className={postCategory === category ? "category-chip active" : "category-chip"}
                      onClick={() => onPostCategory(category)}
                    >
                      {category}
                    </button>
                  ))}
                </div>
              </div>
              <div className="composer-actions">
                <label className="secondary-button file-button">
                  <UtilityIcon icon="paperclip" />
                  Add file
                  <input
                    type="file"
                    multiple
                    accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv"
                    onChange={(event) => {
                      onAddFiles(event.target.files);
                      event.currentTarget.value = "";
                    }}
                  />
                </label>
                <button className="secondary-button" onClick={onCancelPost}>
                  Cancel
                </button>
                <button
                  className="primary-button"
                  onClick={onCreatePost}
                  disabled={postDraft.trim().length === 0 && attachments.length === 0}
                >
                  Post
                </button>
              </div>
            </div>
          ) : (
            <button className="composer-input" onClick={onOpenComposer}>
              Share a win, ask for a referral, or post an opportunity...
            </button>
          )}
        </div>

        {posts.map((post) => {
          const postReactions = reactions.filter((reaction) => reaction.postId === post.id);
          const reactionCount = post.reactions + postReactions.length;
          const iReacted = postReactions.some(
            (reaction) => reaction.memberId === currentMemberId && reaction.type === "celebrate"
          );
          const postComments = comments
            .filter((comment) => comment.postId === post.id)
            .sort((a, b) => a.createdAt - b.createdAt);
          const commentCount = post.comments + postComments.length;
          const threadOpen = openComments.includes(post.id);
          return (
            <article className="glass-panel post-card" key={post.id}>
              <div className="post-head">
                <div className={`avatar ${post.tone}`}>{initials(post.author)}</div>
                <div className="post-author">
                  <h3>{post.author}<span className="member-check" aria-label="Verified SBRA member">✓</span></h3>
                  <p>{post.businessName}</p>
                </div>
                <span className={`pill ${post.tone === "violet" ? "violet" : ""}`}>{post.category}</span>
                <button className="post-menu" aria-label={`More options for ${post.author}'s post`}>•••</button>
              </div>
              {post.attachments && post.attachments.length > 0 && (
                <div className={post.attachments.some((attachment) => attachment.kind === "image") ? "post-attachments media-grid" : "post-attachments"}>
                  {post.attachments.map((attachment) => (
                    <AttachmentPreview attachment={attachment} key={attachment.id} />
                  ))}
                </div>
              )}
              <div className="post-actions">
                <button className={iReacted ? "post-action active" : "post-action"} onClick={() => onToggleReaction(post.id)} aria-label="Celebrate post">
                  <span aria-hidden="true">{iReacted ? "♥" : "♡"}</span>
                </button>
                <button className={threadOpen ? "post-action active" : "post-action"} onClick={() => onToggleCommentThread(post.id)} aria-label="Comment on post">
                  <span aria-hidden="true">◯</span>
                </button>
                <button className="post-action" aria-label="Share post"><span aria-hidden="true">↗</span></button>
                <button className="post-action save-action" aria-label="Save post"><span aria-hidden="true">◇</span></button>
              </div>
              <p className="post-likes"><strong>{reactionCount.toLocaleString()} celebrations</strong></p>
              <p className="post-copy"><strong>{post.author}</strong> {post.body}</p>
              {post.note && (
                <div className="reply-box">
                  <strong>SBRA note</strong>
                  <span>{post.note}</span>
                </div>
              )}
              <button className="view-comments" onClick={() => onToggleCommentThread(post.id)}>
                {threadOpen ? "Hide comments" : `View all ${commentCount} comments`}
              </button>
              <time className="post-time">{post.timeAgo}</time>
              {threadOpen && (
                <div className="comment-thread">
                  {postComments.map((comment) => (
                    <div className="comment-row" key={comment.id}>
                      <div className="mini-avatar blue">{initials(comment.authorName)}</div>
                      <div className="comment-body">
                        <strong>{comment.authorName}</strong>
                        <p>{comment.body}</p>
                      </div>
                    </div>
                  ))}
                  <div className="comment-composer">
                    <input
                      aria-label="Add a comment"
                      placeholder="Add a comment…"
                      value={commentDrafts[post.id] ?? ""}
                      onChange={(event) => onCommentDraft(post.id, event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          onAddComment(post.id);
                        }
                      }}
                    />
                    <button className="primary-button" onClick={() => onAddComment(post.id)}>
                      Reply
                    </button>
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>

      <aside className="right-rail">
        <section className="glass-panel rail-card">
          <p className="section-label">Upcoming</p>
          <h3>Breakfast Referral Club</h3>
          <p>Friday, 7:30 AM at B2 Bistro</p>
          <div className="mini-row">
            <span>Members going</span>
            <strong>18</strong>
          </div>
          <button className="secondary-button">RSVP</button>
        </section>

        <section className="glass-panel rail-card">
          <p className="section-label">New members</p>
          {["Yamile Zabala", "Adam Wentling"].map((name, index) => (
            <div className="mentor" key={name}>
              <div className={index === 0 ? "avatar blue" : "avatar violet"}>{initials(name)}</div>
              <div>
                <strong>{name}</strong>
                <span>{index === 0 ? "Diamond Credit Union" : "Precision Hearing Aid Center"}</span>
              </div>
            </div>
          ))}
        </section>
      </aside>
    </section>
    </>
  );
}

function AttachmentPreview({ attachment }: { attachment: PostAttachment }) {
  if (attachment.kind === "image") {
    return (
      <div className="image-attachment">
        {attachment.url ? <img src={attachment.url} alt={attachment.name} /> : <span>{attachment.label ?? attachment.name}</span>}
      </div>
    );
  }

  return (
    <div className="file-attachment">
      <UtilityIcon icon="paperclip" />
      <span>{attachment.name}</span>
    </div>
  );
}

function DirectoryView({
  businesses,
  membersByBusiness,
  categories,
  categoryFilter,
  search,
  onCategoryFilter,
  onSearch,
  onOpenBusiness,
  spanish = false
}: {
  businesses: Business[];
  membersByBusiness: Map<string, Member[]>;
  categories: string[];
  categoryFilter: string;
  search: string;
  onCategoryFilter: (value: string) => void;
  onSearch: (value: string) => void;
  onOpenBusiness: (business: Business) => void;
  spanish?: boolean;
}) {
  return (
    <section>
      <div className="glass-panel toolbar">
        <input
          aria-label={spanish ? "Buscar negocios miembros" : "Search member businesses"}
          placeholder={spanish ? "Buscar por negocio, servicio o necesidad..." : "Search by business, service, or referral need..."}
          value={search}
          onChange={(event) => onSearch(event.target.value)}
        />
        <select aria-label={spanish ? "Filtrar por categoría" : "Filter by category"} value={categoryFilter} onChange={(event) => onCategoryFilter(event.target.value)}>
          <option value="all">{spanish ? "Todas las categorías" : "All categories"}</option>
          {categories.map((category) => (
            <option value={category} key={category}>
              {category}
            </option>
          ))}
        </select>
      </div>
      <div className="biz-grid">
        {businesses.map((business) => {
          const primaryContact = (membersByBusiness.get(business.id) ?? []).find((member) => member.isOwner)
            ?? (membersByBusiness.get(business.id) ?? [])[0];
          const teamSize = membersByBusiness.get(business.id)?.length ?? 0;
          return (
            <button className="glass-panel biz-card" key={business.id} onClick={() => onOpenBusiness(business)}>
              <div className="biz-card-head">
                <span className="mini-avatar business-logo">
                  {business.logo ? <img src={business.logo} alt={`${business.name} logo`} /> : initials(business.name)}
                </span>
                <div>
                  <strong>{business.name}</strong>
                  <small>{business.category} · {business.city}</small>
                </div>
              </div>
              <p className="biz-desc">{business.description}</p>
              <div className="biz-services">
                {splitList(business.servicesOffered).slice(0, 3).map((service) => (
                  <span className="service-chip" key={service}>
                    {service}
                  </span>
                ))}
              </div>
              <div className="biz-referral">
                <span className="section-label">{spanish ? "Conexiones buscadas" : "Referrals wanted"}</span>
                <p>{business.referralsWanted || (spanish ? "Abierto a nuevas conexiones." : "Open to all introductions.")}</p>
              </div>
              <div className="biz-card-foot">
                <span>{primaryContact ? primaryContact.name : "Member"}</span>
                <strong>{spanish ? "Ver perfil →" : "View profile →"}</strong>
              </div>
            </button>
          );
        })}
        {businesses.length === 0 && <div className="empty-state">{spanish ? "No hay negocios que coincidan con estos filtros." : "No member businesses match these filters yet."}</div>}
      </div>
    </section>
  );
}

function BusinessModal({
  business,
  members,
  onClose,
  spanish = false
}: {
  business: Business;
  members: Member[];
  onClose: () => void;
  spanish?: boolean;
}) {
  return (
    <div className="modal-backdrop open" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="glass-panel profile-modal" role="dialog" aria-modal="true" aria-labelledby="business-name">
        <button className="modal-close" onClick={onClose} aria-label={spanish ? "Cerrar perfil del negocio" : "Close business profile"}>
          {spanish ? "Cerrar" : "Close"}
        </button>
        <div className="modal-head">
          <div className="avatar large business-logo">
            {business.logo ? <img src={business.logo} alt={`${business.name} logo`} /> : initials(business.name)}
          </div>
          <div>
            <p className="section-label">{spanish ? "Negocio miembro" : "Member business"}</p>
            <h3 id="business-name">{business.name}</h3>
            <p>{business.category} · {business.city}</p>
          </div>
        </div>

        <p className="post-copy">{business.description}</p>

        <div className="biz-detail-grid">
          <div>
            <span className="section-label">{spanish ? "Servicios ofrecidos" : "Services offered"}</span>
            <div className="biz-services">
              {splitList(business.servicesOffered).map((service) => (
                <span className="service-chip" key={service}>
                  {service}
                </span>
              ))}
            </div>
          </div>
          <div>
            <span className="section-label">{spanish ? "Conexiones buscadas" : "Referrals wanted"}</span>
            <p>{business.referralsWanted || (spanish ? "Abierto a nuevas conexiones." : "Open to all introductions.")}</p>
          </div>
          <div>
            <span className="section-label">{spanish ? "Contacto" : "Contact"}</span>
            <p>
              {business.website && (
                <>
                  <a href={business.website} target="_blank" rel="noreferrer">{spanish ? "Visitar sitio web" : "Visit website"}</a>
                  <br />
                </>
              )}
              {business.address}
              {business.address && business.city ? ", " : ""}
              {business.city}
            </p>
          </div>
          {business.memberOffer && (
            <div>
              <span className="section-label">{spanish ? "Oferta para miembros" : "Member offer"}</span>
              <p>{business.memberOffer}</p>
            </div>
          )}
        </div>

        <div className="member-list">
          <span className="section-label">{spanish ? `Miembros (${members.length})` : `Team (${members.length})`}</span>
          {members.map((member) => (
            <div className="member-row" key={member.id}>
              <div className="mini-avatar blue member-photo">
                {member.photo ? <img src={member.photo} alt="" /> : initials(member.name)}
              </div>
              <div className="member-row-main">
                <strong>
                  {member.name}
                  {member.isOwner && <span className="owner-badge">Owner</span>}
                </strong>
                <small>{member.title}</small>
                {member.bio && <p>{member.bio}</p>}
              </div>
              <div className="member-row-contact">
                <a href={`mailto:${member.email}`}>{member.email}</a>
                <span>{member.phone}</span>
              </div>
            </div>
          ))}
          {members.length === 0 && <p>{spanish ? "No hay miembros disponibles." : "No members listed yet."}</p>}
        </div>
      </section>
    </div>
  );
}

// Tools that have a working build. Anything not listed falls back to the
// "coming soon" placeholder so the hub stays complete while we flesh tools out.
const BUILT_TOOLS = new Set([
  "referral-roi",
  "pricing-margin",
  "loan-cashflow",
  "health-scorecard",
  "goal-kpi",
  "invoice-quote",
  "breakeven-onepager",
  "marketing-content",
  "networking-crm",
  "tax-calendar",
  "grant-finder",
  "doc-templates"
]);

// Per-category color accent for the hub cards (kept within the SBRA palette).
const categoryStyle: Record<string, { accent: string; tint: string }> = {
  money: { accent: "#001167", tint: "rgba(0, 17, 103, 0.08)" },
  growth: { accent: "#b81a1f", tint: "rgba(184, 26, 31, 0.08)" },
  strategy: { accent: "#2a3a8c", tint: "rgba(42, 58, 140, 0.1)" },
  resources: { accent: "#8a6d00", tint: "rgba(247, 215, 68, 0.22)" }
};

function ToolsView({
  referrals,
  currentMemberId,
  memberById,
  currentMember,
  currentBusiness,
  onGetHelp
}: {
  referrals: Referral[];
  currentMemberId: string;
  memberById: Map<string, Member>;
  currentMember?: Member;
  currentBusiness?: Business;
  onGetHelp: () => void;
}) {
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [openTool, setOpenTool] = useState<ToolDef | null>(null);

  const toolCount = toolCategories.reduce((sum, category) => sum + category.tools.length, 0);
  const q = query.trim().toLowerCase();
  const shownCategories = (activeCategory === "all"
    ? toolCategories
    : toolCategories.filter((category) => category.key === activeCategory)
  )
    .map((category) => ({
      ...category,
      tools: category.tools.filter(
        (tool) => !q || `${tool.name} ${tool.tagline} ${tool.description}`.toLowerCase().includes(q)
      )
    }))
    .filter((category) => category.tools.length > 0);

  if (openTool) {
    const back = (
      <button className="tool-back" onClick={() => setOpenTool(null)}>
        ← All tools
      </button>
    );

    let body: ReactElement;
    if (openTool.id === "referral-roi") {
      body = <ReferralRoiTool referrals={referrals} currentMemberId={currentMemberId} memberById={memberById} />;
    } else if (openTool.id === "pricing-margin") {
      body = <PricingMarginTool />;
    } else if (openTool.id === "loan-cashflow") {
      body = <LoanCashFlowTool />;
    } else if (openTool.id === "health-scorecard") {
      body = <HealthScorecardTool />;
    } else if (openTool.id === "goal-kpi") {
      body = <GoalKpiTool />;
    } else if (openTool.id === "invoice-quote") {
      body = <InvoiceQuoteTool currentMember={currentMember} currentBusiness={currentBusiness} />;
    } else if (openTool.id === "breakeven-onepager") {
      body = <BreakEvenTool currentBusiness={currentBusiness} />;
    } else if (openTool.id === "marketing-content") {
      body = <MarketingContentTool currentBusiness={currentBusiness} onRequestAi={onGetHelp} />;
    } else if (openTool.id === "networking-crm") {
      body = <NetworkingCrmTool />;
    } else if (openTool.id === "tax-calendar") {
      body = <TaxCalendarTool />;
    } else if (openTool.id === "grant-finder") {
      body = <GrantFinderTool />;
    } else if (openTool.id === "doc-templates") {
      body = <DocTemplatesTool currentBusiness={currentBusiness} />;
    } else {
      body = (
        <article className="glass-panel tool-detail">
          <p className="tool-detail-copy">{openTool.description}</p>
          <div className="tool-detail-note">
            <strong>Coming soon.</strong> This tool is on the SBRA roadmap — the working version
            gets built out next. Tell us how you'd use it and we'll prioritize it.
          </div>
          <div className="tool-detail-actions">
            <button className="primary-button" onClick={onGetHelp}>Request this tool</button>
            <button className="secondary-button" onClick={() => setOpenTool(null)}>Back to tools</button>
          </div>
        </article>
      );
    }

    return (
      <section className="tools-page">
        {back}
        <div className="tool-detail-head">
          <span className="tool-detail-icon" aria-hidden="true">{openTool.icon}</span>
          <div>
            <p className="section-label">{openTool.tagline}</p>
            <h3>{openTool.name}</h3>
          </div>
        </div>
        {body}
      </section>
    );
  }

  return (
    <section className="tools-page">
      <article className="glass-panel tools-hero">
        <div className="tools-hero-main">
          <p className="section-label">Member toolkit</p>
          <h3>Power tools to run and grow your business</h3>
          <p>Calculators, generators, and templates built for SBRA members — be better, grow faster.</p>
        </div>
        <div className="tools-hero-stats" aria-hidden="true">
          <div><strong>{toolCount}</strong><span>Tools</span></div>
          <div className="stat-divider" />
          <div><strong>{toolCategories.length}</strong><span>Categories</span></div>
        </div>
      </article>

      <div className="tools-toolbar">
        <div className="tools-search">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            value={query}
            placeholder="Search tools…"
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Search tools"
          />
          {query && <button className="tools-search-clear" onClick={() => setQuery("")} aria-label="Clear search">×</button>}
        </div>
        <div className="tools-filters" role="tablist" aria-label="Tool categories">
          <button
            className={activeCategory === "all" ? "tool-chip active" : "tool-chip"}
            onClick={() => setActiveCategory("all")}
          >
            All
          </button>
          {toolCategories.map((category) => (
            <button
              key={category.key}
              className={activeCategory === category.key ? "tool-chip active" : "tool-chip"}
              onClick={() => setActiveCategory(category.key)}
            >
              {category.title}
            </button>
          ))}
        </div>
      </div>

      {shownCategories.length === 0 && (
        <article className="glass-panel tool-panel tools-empty">
          <p>No tools match “{query}”.</p>
          <button className="secondary-button" onClick={() => setQuery("")}>Clear search</button>
        </article>
      )}

      {shownCategories.map((category) => {
        const style = categoryStyle[category.key];
        return (
          <section className="tool-category" key={category.key} aria-labelledby={`tool-cat-${category.key}`}>
            <div className="tool-category-head">
              <h4 id={`tool-cat-${category.key}`}>
                {category.title}
                <span className="tool-cat-count">{category.tools.length} {category.tools.length === 1 ? "tool" : "tools"}</span>
              </h4>
              <p>{category.blurb}</p>
            </div>
            <div className="tools-grid">
              {category.tools.map((tool) => (
                <button
                  className="glass-panel tool-card"
                  key={tool.id}
                  onClick={() => setOpenTool(tool)}
                  style={style ? ({ ["--accent" as string]: style.accent, ["--tint" as string]: style.tint }) : undefined}
                >
                  <span className="tool-card-icon" aria-hidden="true">{tool.icon}</span>
                  {!BUILT_TOOLS.has(tool.id) && <span className="tool-card-status">Soon</span>}
                  <h5>{tool.name}</h5>
                  <p>{tool.tagline}</p>
                  <span className="tool-card-open">{BUILT_TOOLS.has(tool.id) ? "Open" : "Preview"} <span className="tool-card-arrow" aria-hidden="true">→</span></span>
                </button>
              ))}
            </div>
          </section>
        );
      })}
    </section>
  );
}

// Shared helpers for the calculator tools.
function usd(n: number) {
  if (!Number.isFinite(n)) return "$0";
  return `$${Math.round(n).toLocaleString()}`;
}
function toNum(value: string) {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

// Per-viewer persistence for tools that save (goals, invoice defaults, last
// scorecard). Seed mode has no backend, so we keep it in localStorage; every
// access is guarded because storage can be unavailable or throw.
function loadStored<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function saveStored<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage full or blocked — the tool still works in-session
  }
}

function ToolField({
  label,
  value,
  onChange,
  prefix,
  suffix,
  placeholder,
  step
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  prefix?: string;
  suffix?: string;
  placeholder?: string;
  step?: string;
}) {
  return (
    <label className="tool-field">
      <span>{label}</span>
      <span className="tool-input-wrap">
        {prefix && <span className="tool-affix">{prefix}</span>}
        <input
          type="number"
          inputMode="decimal"
          min="0"
          step={step ?? "any"}
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
        {suffix && <span className="tool-affix suffix">{suffix}</span>}
      </span>
    </label>
  );
}

function ReferralRoiTool({
  referrals,
  currentMemberId,
  memberById
}: {
  referrals: Referral[];
  currentMemberId: string;
  memberById: Map<string, Member>;
}) {
  const stats = useMemo(() => {
    const given = referrals.filter((r) => r.giverId === currentMemberId);
    const received = referrals.filter((r) => r.receiverId === currentMemberId);
    const givenWon = given.filter((r) => r.status === "closed_won");
    const receivedWon = received.filter((r) => r.status === "closed_won");
    const creditEarned = givenWon.reduce((sum, r) => sum + (r.closedValue ?? 0), 0);
    const businessWon = receivedWon.reduce((sum, r) => sum + (r.closedValue ?? 0), 0);
    const receivedDecided = received.filter(
      (r) => r.status === "closed_won" || r.status === "closed_lost"
    ).length;
    const winRate = receivedDecided > 0 ? Math.round((receivedWon.length / receivedDecided) * 100) : 0;
    const avgWon =
      receivedWon.length > 0 ? businessWon / receivedWon.length : givenWon.length > 0 ? creditEarned / givenWon.length : 0;
    return {
      givenCount: given.length,
      receivedCount: received.length,
      givenWonCount: givenWon.length,
      creditEarned,
      businessWon,
      winRate,
      avgWon
    };
  }, [referrals, currentMemberId]);

  const memberName = memberById.get(currentMemberId)?.name.split(" ")[0];

  // Projection inputs — seeded from the member's real activity where we can.
  const [perMonth, setPerMonth] = useState(String(Math.max(1, stats.givenCount)));
  const [avgValue, setAvgValue] = useState(String(Math.round(stats.avgWon) || 2500));
  const [closeRate, setCloseRate] = useState(String(stats.winRate || 30));
  const [dues, setDues] = useState("600");

  const projectedClosed = (toNum(perMonth) * 12 * toNum(closeRate)) / 100;
  const projectedValue = projectedClosed * toNum(avgValue);
  const duesNum = toNum(dues);
  const roiMultiple = duesNum > 0 ? projectedValue / duesNum : 0;

  return (
    <div className="tool-body">
      <article className="glass-panel tool-panel">
        <p className="section-label">Your club activity{memberName ? ` · ${memberName}` : ""}</p>
        <div className="tool-metric-grid">
          <div className="tool-metric"><strong>{stats.givenCount}</strong><span>Referrals given</span></div>
          <div className="tool-metric"><strong>{stats.receivedCount}</strong><span>Referrals received</span></div>
          <div className="tool-metric"><strong>{usd(stats.creditEarned)}</strong><span>Credit earned (given)</span></div>
          <div className="tool-metric"><strong>{usd(stats.businessWon)}</strong><span>Business you closed</span></div>
        </div>
        {stats.givenCount === 0 && stats.receivedCount === 0 && (
          <p className="tool-hint">No referral activity yet — the projection below shows what the club could be worth as you get active.</p>
        )}
      </article>

      <article className="glass-panel tool-panel">
        <p className="section-label">Project your annual ROI</p>
        <div className="tool-form">
          <ToolField label="Referrals you give / month" value={perMonth} onChange={setPerMonth} step="1" />
          <ToolField label="Average closed deal value" value={avgValue} onChange={setAvgValue} prefix="$" />
          <ToolField label="Close rate" value={closeRate} onChange={setCloseRate} suffix="%" />
          <ToolField label="Annual SBRA dues" value={dues} onChange={setDues} prefix="$" />
        </div>
        <div className="tool-results">
          <div className="result-tile"><span>Projected closed deals / yr</span><strong>{Math.round(projectedClosed).toLocaleString()}</strong></div>
          <div className="result-tile"><span>Projected annual value</span><strong>{usd(projectedValue)}</strong></div>
          <div className="result-tile accent"><span>Return on dues</span><strong>{roiMultiple > 0 ? `${roiMultiple.toFixed(1)}×` : "—"}</strong></div>
        </div>
        <p className="tool-hint">Estimates only — based on the assumptions above, not a guarantee. Tune the inputs to model your own year.</p>
      </article>
    </div>
  );
}

function PricingMarginTool() {
  const [cost, setCost] = useState("40");
  const [margin, setMargin] = useState("45");
  const [fixed, setFixed] = useState("");

  const costNum = toNum(cost);
  const marginNum = Math.min(toNum(margin), 99.9); // margin of 100% would divide by zero
  const price = marginNum > 0 ? costNum / (1 - marginNum / 100) : costNum;
  const profitPerUnit = price - costNum;
  const markup = costNum > 0 ? (profitPerUnit / costNum) * 100 : 0;
  const fixedNum = toNum(fixed);
  const breakEvenUnits = profitPerUnit > 0 ? Math.ceil(fixedNum / profitPerUnit) : 0;

  return (
    <div className="tool-body">
      <article className="glass-panel tool-panel">
        <p className="section-label">Your numbers</p>
        <div className="tool-form">
          <ToolField label="Unit cost" value={cost} onChange={setCost} prefix="$" />
          <ToolField label="Target margin" value={margin} onChange={setMargin} suffix="%" />
          <ToolField label="Fixed costs / month (optional)" value={fixed} onChange={setFixed} prefix="$" placeholder="e.g. 3000" />
        </div>
        <div className="tool-results">
          <div className="result-tile accent"><span>Sell at</span><strong>{usd(price)}</strong></div>
          <div className="result-tile"><span>Profit / unit</span><strong>{usd(profitPerUnit)}</strong></div>
          <div className="result-tile"><span>Markup</span><strong>{markup > 0 ? `${Math.round(markup)}%` : "—"}</strong></div>
          {fixedNum > 0 && (
            <div className="result-tile"><span>Break-even units / mo</span><strong>{profitPerUnit > 0 ? breakEvenUnits.toLocaleString() : "—"}</strong></div>
          )}
        </div>
        <p className="tool-hint">Price = cost ÷ (1 − margin). Break-even = fixed costs ÷ profit per unit.</p>
      </article>
    </div>
  );
}

function LoanCashFlowTool() {
  const [amount, setAmount] = useState("50000");
  const [rate, setRate] = useState("9");
  const [term, setTerm] = useState("60");
  const [cash, setCash] = useState("");
  const [revenue, setRevenue] = useState("");
  const [expenses, setExpenses] = useState("");

  const principal = toNum(amount);
  const months = Math.max(1, Math.round(toNum(term)));
  const monthlyRate = toNum(rate) / 100 / 12;
  const payment =
    monthlyRate > 0
      ? (principal * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -months))
      : principal / months;
  const totalRepaid = payment * months;
  const totalInterest = totalRepaid - principal;

  const revNum = toNum(revenue);
  const expNum = toNum(expenses);
  const showCashFlow = revNum > 0 || expNum > 0;
  const netMonthly = revNum - expNum - payment;
  const cashNum = toNum(cash);
  const runway = netMonthly < 0 && cashNum > 0 ? Math.floor(cashNum / -netMonthly) : 0;

  return (
    <div className="tool-body">
      <article className="glass-panel tool-panel">
        <p className="section-label">Loan terms</p>
        <div className="tool-form">
          <ToolField label="Loan amount" value={amount} onChange={setAmount} prefix="$" />
          <ToolField label="Annual interest rate" value={rate} onChange={setRate} suffix="%" />
          <ToolField label="Term" value={term} onChange={setTerm} suffix="mo" step="1" />
        </div>
        <div className="tool-results">
          <div className="result-tile accent"><span>Monthly payment</span><strong>{usd(payment)}</strong></div>
          <div className="result-tile"><span>Total interest</span><strong>{usd(totalInterest)}</strong></div>
          <div className="result-tile"><span>Total repaid</span><strong>{usd(totalRepaid)}</strong></div>
        </div>
      </article>

      <article className="glass-panel tool-panel">
        <p className="section-label">Cash-flow check (optional)</p>
        <div className="tool-form">
          <ToolField label="Cash on hand" value={cash} onChange={setCash} prefix="$" placeholder="e.g. 20000" />
          <ToolField label="Monthly revenue" value={revenue} onChange={setRevenue} prefix="$" placeholder="e.g. 18000" />
          <ToolField label="Monthly expenses" value={expenses} onChange={setExpenses} prefix="$" placeholder="e.g. 12000" />
        </div>
        {showCashFlow ? (
          <div className="tool-results">
            <div className={netMonthly >= 0 ? "result-tile positive" : "result-tile negative"}>
              <span>Monthly cash flow after payment</span>
              <strong>{netMonthly >= 0 ? "+" : "−"}{usd(Math.abs(netMonthly))}</strong>
            </div>
            <div className="result-tile">
              <span>Runway</span>
              <strong>{netMonthly >= 0 ? "Cash-flow positive" : runway > 0 ? `${runway} mo` : "—"}</strong>
            </div>
          </div>
        ) : (
          <p className="tool-hint">Add your revenue and expenses to see whether this loan is comfortable month to month.</p>
        )}
      </article>
    </div>
  );
}

// ---- Business Health Scorecard ----
const scorecardSections: { key: string; label: string; tip: string; items: string[] }[] = [
  {
    key: "marketing",
    label: "Marketing & Brand",
    tip: "Pick one channel and show up consistently for 90 days. Ask happy clients for a review or a Pitch spotlight at the next Mingle.",
    items: [
      "We have a clear, repeatable way to attract new customers.",
      "Our brand and message are consistent across our website and socials.",
      "We know which marketing brings the best return."
    ]
  },
  {
    key: "finance",
    label: "Finances & Cash",
    tip: "Build a simple 90-day cash forecast and review it monthly. Know your break-even number cold.",
    items: [
      "We track revenue, expenses, and profit every month.",
      "We have enough cash reserve to handle a slow month.",
      "Our pricing reliably covers costs and leaves healthy margin."
    ]
  },
  {
    key: "sales",
    label: "Sales & Referrals",
    tip: "Give referrals first — the club rewards givers. Set a weekly target for referrals given and follow-ups made.",
    items: [
      "We have a dependable pipeline of new leads.",
      "We follow up on every lead and referral promptly.",
      "We actively give and receive referrals through SBRA."
    ]
  },
  {
    key: "operations",
    label: "Operations & Team",
    tip: "Document your top 3 recurring tasks so the business runs without you in the room.",
    items: [
      "Our core processes are documented, not just in our heads.",
      "The business can run for a few days without the owner.",
      "We have the right tools and people for current demand."
    ]
  }
];

function HealthScorecardTool() {
  const STORE_KEY = "sbra.tool.scorecard";
  const [answers, setAnswers] = useState<Record<string, number>>(() => loadStored(STORE_KEY, {}));

  function setAnswer(id: string, value: number) {
    setAnswers((prev) => {
      const next = { ...prev, [id]: value };
      saveStored(STORE_KEY, next);
      return next;
    });
  }

  const sectionScores = scorecardSections.map((section) => {
    const values = section.items.map((_, i) => answers[`${section.key}-${i}`] ?? 3);
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    return { ...section, pct: Math.round((avg / 5) * 100) };
  });
  const overall = Math.round(sectionScores.reduce((sum, s) => sum + s.pct, 0) / sectionScores.length);
  const weakest = [...sectionScores].sort((a, b) => a.pct - b.pct)[0];
  const band = overall >= 80 ? "Thriving" : overall >= 60 ? "Solid, with room to grow" : overall >= 40 ? "Needs attention" : "At risk";

  return (
    <div className="tool-body">
      <article className="glass-panel tool-panel">
        <div className="scorecard-summary">
          <div className="scorecard-gauge" style={{ ["--pct" as string]: `${overall}%` }}>
            <span><strong>{overall}</strong><small>/100</small></span>
          </div>
          <div>
            <p className="section-label">Overall health</p>
            <h4 className="scorecard-band">{band}</h4>
            <p className="tool-hint">Rate each statement from 1 (strongly disagree) to 5 (strongly agree). Your answers save on this device.</p>
          </div>
        </div>
      </article>

      {scorecardSections.map((section, si) => {
        const score = sectionScores[si];
        return (
          <article className="glass-panel tool-panel" key={section.key}>
            <div className="scorecard-head">
              <p className="section-label">{section.label}</p>
              <span className="scorecard-pct">{score.pct}%</span>
            </div>
            <div className="scorecard-bar"><span style={{ width: `${score.pct}%` }} /></div>
            {section.items.map((item, i) => {
              const id = `${section.key}-${i}`;
              const current = answers[id] ?? 3;
              return (
                <div className="scorecard-item" key={id}>
                  <span>{item}</span>
                  <div className="rating" role="group" aria-label={item}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        className={current === n ? "rating-dot active" : "rating-dot"}
                        onClick={() => setAnswer(id, n)}
                        aria-label={`${n} of 5`}
                        aria-pressed={current === n}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </article>
        );
      })}

      <article className="glass-panel tool-panel">
        <p className="section-label">Your focus area</p>
        <h4 style={{ margin: "2px 0 4px" }}>{weakest.label} — {weakest.pct}%</h4>
        <p className="tool-hint">{weakest.tip}</p>
      </article>
    </div>
  );
}

// ---- Goal & KPI Tracker ----
type Goal = { id: string; label: string; unit: string; current: number; target: number };

function GoalKpiTool() {
  const STORE_KEY = "sbra.tool.goals";
  const [goals, setGoals] = useState<Goal[]>(() => loadStored<Goal[]>(STORE_KEY, []));
  const [label, setLabel] = useState("");
  const [target, setTarget] = useState("");
  const [unit, setUnit] = useState("");

  function persist(next: Goal[]) {
    setGoals(next);
    saveStored(STORE_KEY, next);
  }
  function addGoal() {
    if (!label.trim() || toNum(target) <= 0) return;
    persist([
      ...goals,
      { id: `goal-${Date.now()}`, label: label.trim(), unit: unit.trim(), current: 0, target: toNum(target) }
    ]);
    setLabel("");
    setTarget("");
    setUnit("");
  }
  function updateCurrent(id: string, value: string) {
    persist(goals.map((g) => (g.id === id ? { ...g, current: toNum(value) } : g)));
  }
  function removeGoal(id: string) {
    persist(goals.filter((g) => g.id !== id));
  }

  return (
    <div className="tool-body">
      <article className="glass-panel tool-panel">
        <p className="section-label">Add a goal or KPI</p>
        <div className="tool-form">
          <label className="tool-field">
            <span>Goal</span>
            <span className="tool-input-wrap">
              <input value={label} placeholder="e.g. New clients this quarter" onChange={(e) => setLabel(e.target.value)} />
            </span>
          </label>
          <ToolField label="Target" value={target} onChange={setTarget} placeholder="e.g. 20" />
          <label className="tool-field">
            <span>Unit (optional)</span>
            <span className="tool-input-wrap">
              <input value={unit} placeholder="clients, $, calls…" onChange={(e) => setUnit(e.target.value)} />
            </span>
          </label>
        </div>
        <div className="tool-detail-actions">
          <button className="primary-button" onClick={addGoal}>Add goal</button>
        </div>
      </article>

      {goals.length === 0 ? (
        <article className="glass-panel tool-panel">
          <p className="tool-hint">No goals yet. Add your first target above — it saves on this device so it's here when you come back.</p>
        </article>
      ) : (
        goals.map((goal) => {
          const pct = goal.target > 0 ? Math.min(100, Math.round((goal.current / goal.target) * 100)) : 0;
          return (
            <article className="glass-panel tool-panel goal-row" key={goal.id}>
              <div className="goal-head">
                <div>
                  <h4>{goal.label}</h4>
                  <span className="tool-hint">{goal.current.toLocaleString()} of {goal.target.toLocaleString()} {goal.unit}</span>
                </div>
                <span className={pct >= 100 ? "goal-pct done" : "goal-pct"}>{pct}%</span>
              </div>
              <div className="scorecard-bar"><span style={{ width: `${pct}%` }} /></div>
              <div className="goal-controls">
                <label className="tool-field goal-update">
                  <span>Update progress</span>
                  <span className="tool-input-wrap">
                    <input type="number" min="0" step="any" value={String(goal.current)} onChange={(e) => updateCurrent(goal.id, e.target.value)} />
                    {goal.unit && <span className="tool-affix suffix">{goal.unit}</span>}
                  </span>
                </label>
                <button className="secondary-button" onClick={() => removeGoal(goal.id)}>Remove</button>
              </div>
            </article>
          );
        })
      )}
    </div>
  );
}

// ---- Invoice & Quote Generator ----
type InvoiceItem = { id: string; desc: string; qty: string; rate: string };
type InvoiceProfile = { fromName: string; fromContact: string; number: string };

function InvoiceQuoteTool({ currentMember, currentBusiness }: { currentMember?: Member; currentBusiness?: Business }) {
  const STORE_KEY = "sbra.tool.invoice";
  const stored = loadStored<Partial<InvoiceProfile>>(STORE_KEY, {});
  const [docType, setDocType] = useState<"Invoice" | "Quote">("Invoice");
  const [fromName, setFromName] = useState(stored.fromName ?? currentBusiness?.name ?? "");
  const [fromContact, setFromContact] = useState(
    stored.fromContact ??
      [currentBusiness?.address, currentBusiness?.city, currentMember?.email, currentMember?.phone].filter(Boolean).join(" · ")
  );
  const [number, setNumber] = useState(stored.number ?? "1001");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [toName, setToName] = useState("");
  const [toContact, setToContact] = useState("");
  const [taxRate, setTaxRate] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<InvoiceItem[]>([{ id: "i1", desc: "", qty: "1", rate: "" }]);

  function saveProfile(next: Partial<InvoiceProfile>) {
    saveStored(STORE_KEY, { fromName, fromContact, number, ...next });
  }

  function updateItem(id: string, patch: Partial<InvoiceItem>) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }
  function addItem() {
    setItems((prev) => [...prev, { id: `i${Date.now()}`, desc: "", qty: "1", rate: "" }]);
  }
  function removeItem(id: string) {
    setItems((prev) => (prev.length > 1 ? prev.filter((it) => it.id !== id) : prev));
  }

  const subtotal = items.reduce((sum, it) => sum + toNum(it.qty) * toNum(it.rate), 0);
  const tax = subtotal * (toNum(taxRate) / 100);
  const total = subtotal + tax;

  return (
    <div className="tool-body">
      <article className="glass-panel tool-panel">
        <div className="scorecard-head">
          <p className="section-label">Details</p>
          <div className="doc-toggle" role="group" aria-label="Document type">
            {(["Invoice", "Quote"] as const).map((t) => (
              <button key={t} className={docType === t ? "doc-tab active" : "doc-tab"} onClick={() => setDocType(t)}>{t}</button>
            ))}
          </div>
        </div>
        <div className="tool-form">
          <label className="tool-field"><span>From (your business)</span><span className="tool-input-wrap"><input value={fromName} onChange={(e) => { setFromName(e.target.value); saveProfile({ fromName: e.target.value }); }} /></span></label>
          <label className="tool-field"><span>Your contact</span><span className="tool-input-wrap"><input value={fromContact} onChange={(e) => { setFromContact(e.target.value); saveProfile({ fromContact: e.target.value }); }} /></span></label>
          <label className="tool-field"><span>Bill to</span><span className="tool-input-wrap"><input value={toName} placeholder="Client name" onChange={(e) => setToName(e.target.value)} /></span></label>
          <label className="tool-field"><span>Client contact</span><span className="tool-input-wrap"><input value={toContact} placeholder="Email / address" onChange={(e) => setToContact(e.target.value)} /></span></label>
          <label className="tool-field"><span>{docType} #</span><span className="tool-input-wrap"><input value={number} onChange={(e) => { setNumber(e.target.value); saveProfile({ number: e.target.value }); }} /></span></label>
          <label className="tool-field"><span>Date</span><span className="tool-input-wrap"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></span></label>
        </div>
      </article>

      <article className="glass-panel tool-panel">
        <p className="section-label">Line items</p>
        <div className="invoice-items">
          {items.map((it) => (
            <div className="invoice-item-row" key={it.id}>
              <input className="ii-desc" value={it.desc} placeholder="Description" onChange={(e) => updateItem(it.id, { desc: e.target.value })} />
              <input className="ii-num" type="number" min="0" step="any" value={it.qty} placeholder="Qty" onChange={(e) => updateItem(it.id, { qty: e.target.value })} />
              <input className="ii-num" type="number" min="0" step="any" value={it.rate} placeholder="Rate" onChange={(e) => updateItem(it.id, { rate: e.target.value })} />
              <span className="ii-amt">{usd(toNum(it.qty) * toNum(it.rate))}</span>
              <button className="ii-remove" onClick={() => removeItem(it.id)} aria-label="Remove line">×</button>
            </div>
          ))}
        </div>
        <div className="tool-detail-actions">
          <button className="secondary-button" onClick={addItem}>+ Add line</button>
        </div>
        <div className="tool-form">
          <ToolField label="Tax rate (optional)" value={taxRate} onChange={setTaxRate} suffix="%" />
          <label className="tool-field"><span>Notes / terms</span><span className="tool-input-wrap"><input value={notes} placeholder="Payment due in 30 days…" onChange={(e) => setNotes(e.target.value)} /></span></label>
        </div>
      </article>

      <article className="glass-panel tool-panel tool-print" id="invoice-print">
        <div className="invoice-doc">
          <div className="invoice-doc-head">
            <div>
              <h3>{docType}</h3>
              <p>#{number} · {date}</p>
            </div>
            <div className="invoice-from">
              <strong>{fromName || "Your business"}</strong>
              <span>{fromContact}</span>
            </div>
          </div>
          <div className="invoice-billto">
            <small>BILL TO</small>
            <strong>{toName || "Client"}</strong>
            <span>{toContact}</span>
          </div>
          <table className="invoice-table">
            <thead><tr><th>Description</th><th>Qty</th><th>Rate</th><th>Amount</th></tr></thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id}>
                  <td>{it.desc || "—"}</td>
                  <td>{toNum(it.qty) || 0}</td>
                  <td>{usd(toNum(it.rate))}</td>
                  <td>{usd(toNum(it.qty) * toNum(it.rate))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="invoice-totals">
            <div><span>Subtotal</span><strong>{usd(subtotal)}</strong></div>
            {toNum(taxRate) > 0 && <div><span>Tax ({toNum(taxRate)}%)</span><strong>{usd(tax)}</strong></div>}
            <div className="invoice-grand"><span>Total</span><strong>{usd(total)}</strong></div>
          </div>
          {notes && <p className="invoice-notes">{notes}</p>}
        </div>
      </article>
      <div className="tool-detail-actions no-print">
        <button className="primary-button" onClick={() => window.print()}>Print / Save PDF</button>
      </div>
    </div>
  );
}

// ---- Break-even & Margin One-Pager ----
function BreakEvenTool({ currentBusiness }: { currentBusiness?: Business }) {
  const [fixed, setFixed] = useState("4000");
  const [price, setPrice] = useState("100");
  const [variable, setVariable] = useState("40");
  const [targetProfit, setTargetProfit] = useState("");

  const priceNum = toNum(price);
  const cm = priceNum - toNum(variable);
  const cmPct = priceNum > 0 ? (cm / priceNum) * 100 : 0;
  const beUnits = cm > 0 ? Math.ceil(toNum(fixed) / cm) : 0;
  const beRevenue = beUnits * priceNum;
  const targetUnits = cm > 0 ? Math.ceil((toNum(fixed) + toNum(targetProfit)) / cm) : 0;

  return (
    <div className="tool-body">
      <article className="glass-panel tool-panel">
        <p className="section-label">Your numbers</p>
        <div className="tool-form">
          <ToolField label="Fixed costs / month" value={fixed} onChange={setFixed} prefix="$" />
          <ToolField label="Price per unit" value={price} onChange={setPrice} prefix="$" />
          <ToolField label="Variable cost per unit" value={variable} onChange={setVariable} prefix="$" />
          <ToolField label="Target monthly profit (optional)" value={targetProfit} onChange={setTargetProfit} prefix="$" />
        </div>
      </article>

      <article className="glass-panel tool-panel tool-print" id="breakeven-print">
        <div className="invoice-doc-head">
          <div>
            <h3>Break-even one-pager</h3>
            <p>{currentBusiness?.name || "Your business"} · {new Date().toISOString().slice(0, 10)}</p>
          </div>
        </div>
        <div className="tool-results">
          <div className="result-tile accent"><span>Break-even units / mo</span><strong>{cm > 0 ? beUnits.toLocaleString() : "—"}</strong></div>
          <div className="result-tile"><span>Break-even revenue / mo</span><strong>{cm > 0 ? usd(beRevenue) : "—"}</strong></div>
          <div className="result-tile"><span>Contribution margin / unit</span><strong>{usd(cm)}</strong></div>
        </div>
        <div className="tool-results" style={{ marginTop: 12 }}>
          <div className="result-tile"><span>Contribution margin %</span><strong>{cm > 0 ? `${Math.round(cmPct)}%` : "—"}</strong></div>
          {toNum(targetProfit) > 0 && (
            <div className="result-tile positive"><span>Units for target profit</span><strong>{cm > 0 ? targetUnits.toLocaleString() : "—"}</strong></div>
          )}
        </div>
        <p className="tool-hint">Contribution margin = price − variable cost. Break-even units = fixed costs ÷ contribution margin. Below the break-even you run at a loss; above it, each unit adds {usd(cm)} of profit.</p>
      </article>
      <div className="tool-detail-actions no-print">
        <button className="primary-button" onClick={() => window.print()}>Print / Save PDF</button>
      </div>
    </div>
  );
}

// ---- Marketing Content Generator (template-only) ----
// NOTE (feature request): this is a template engine. The AI upgrade path is to
// swap buildDrafts() for a call to an LLM (e.g. Claude) using the same inputs
// as the prompt. The in-tool "Request AI drafts" button files that request via
// support so members can signal demand. See onRequestAi.
type ContentKind = "social" | "email" | "promo" | "event" | "referral";
const contentKinds: { key: ContentKind; label: string }[] = [
  { key: "social", label: "Social post" },
  { key: "email", label: "Email blurb" },
  { key: "promo", label: "Promo / offer" },
  { key: "event", label: "Event invite" },
  { key: "referral", label: "Referral ask" }
];

function buildDrafts(kind: ContentKind, biz: string, topic: string, tone: string): string[] {
  const b = biz.trim() || "our business";
  const t = topic.trim() || "what we do";
  const toneTag = tone.trim() ? ` (${tone.trim()} tone)` : "";
  switch (kind) {
    case "social":
      return [
        `📣 ${t} is what we do best at ${b}. Ready to see the difference? Send us a message today.${toneTag}`,
        `At ${b}, we help Berks County get more from ${t}. Here's one tip you can use this week 👇 — and if you want the full version, reach out.`,
        `Proud to serve our neighbors at ${b}. Whether it's ${t} or a question you've been sitting on, we're here. Comment or DM us.`
      ];
    case "email":
      return [
        `Subject: A quick note from ${b}\n\nHi there,\n\nWe wanted to share how ${b} can help with ${t}. If now's a good time to talk, just reply to this email and we'll set something up.\n\nTalk soon,\n${b}`,
        `Subject: Can we help with ${t}?\n\nHello,\n\nMany of our clients come to us for ${t} — and leave with one less thing to worry about. If that sounds useful, we'd love to help.\n\nBest,\n${b}`
      ];
    case "promo":
      return [
        `🎉 Limited-time offer from ${b}: ask us about ${t} this month and get our best rate of the season. Mention this post when you reach out!`,
        `New at ${b}: ${t}, done right. Book by the end of the month and we'll take care of the rest. Spots are limited — reach out today.`
      ];
    case "event":
      return [
        `You're invited! ${b} is hosting a get-together about ${t}. Come for the conversation, stay for the connections. RSVP and bring a fellow business owner.`,
        `Save the date 🗓️ — ${b} is putting on an event around ${t}. Great for anyone in Berks County looking to learn and network. Details and RSVP inside.`
      ];
    case "referral":
      return [
        `Quick ask for my SBRA network: if you know someone who needs ${t}, ${b} would love an introduction. I promise to take great care of them — and I'll return the favor.`,
        `The best compliment is a referral. If ${b} has helped you with ${t}, sending a friend our way means the world. Thank you for thinking of us!`
      ];
    default:
      return [];
  }
}

function MarketingContentTool({ currentBusiness, onRequestAi }: { currentBusiness?: Business; onRequestAi: () => void }) {
  const [kind, setKind] = useState<ContentKind>("social");
  const [biz, setBiz] = useState(currentBusiness?.name ?? "");
  const [topic, setTopic] = useState(currentBusiness?.servicesOffered?.split(",")[0]?.trim() ?? "");
  const [tone, setTone] = useState("");
  const [drafts, setDrafts] = useState<string[]>([]);
  const [copied, setCopied] = useState<number | null>(null);

  function generate() {
    setDrafts(buildDrafts(kind, biz, topic, tone));
    setCopied(null);
  }
  async function copy(text: string, index: number) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(index);
      window.setTimeout(() => setCopied((c) => (c === index ? null : c)), 1500);
    } catch {
      // clipboard blocked — the member can still select and copy manually
    }
  }

  return (
    <div className="tool-body">
      <article className="glass-panel tool-panel ai-request no-print">
        <div>
          <p className="section-label">Planned: AI-written drafts</p>
          <p className="tool-hint">These drafts come from proven templates today. Want AI to write them in your own voice from a sentence or two? Let us know and we'll prioritize it.</p>
        </div>
        <button className="secondary-button" onClick={onRequestAi}>Request AI drafts</button>
      </article>

      <article className="glass-panel tool-panel">
        <p className="section-label">What do you need?</p>
        <div className="tools-filters">
          {contentKinds.map((c) => (
            <button key={c.key} className={kind === c.key ? "tool-chip active" : "tool-chip"} onClick={() => setKind(c.key)}>{c.label}</button>
          ))}
        </div>
        <div className="tool-form">
          <label className="tool-field"><span>Your business</span><span className="tool-input-wrap"><input value={biz} onChange={(e) => setBiz(e.target.value)} /></span></label>
          <label className="tool-field"><span>Topic / offer</span><span className="tool-input-wrap"><input value={topic} placeholder="e.g. tax planning, spring tune-ups" onChange={(e) => setTopic(e.target.value)} /></span></label>
          <label className="tool-field"><span>Tone (optional)</span><span className="tool-input-wrap"><input value={tone} placeholder="friendly, professional, bold…" onChange={(e) => setTone(e.target.value)} /></span></label>
        </div>
        <div className="tool-detail-actions">
          <button className="primary-button" onClick={generate}>Generate drafts</button>
        </div>
      </article>

      {drafts.map((draft, i) => (
        <article className="glass-panel tool-panel draft-card" key={i}>
          <p className="draft-text">{draft}</p>
          <div className="tool-detail-actions">
            <button className="secondary-button" onClick={() => copy(draft, i)}>{copied === i ? "Copied ✓" : "Copy"}</button>
          </div>
        </article>
      ))}
      {drafts.length === 0 && (
        <article className="glass-panel tool-panel">
          <p className="tool-hint">Pick a content type, fill in a topic, and hit Generate to get a few ready-to-edit drafts.</p>
        </article>
      )}
    </div>
  );
}

// ---- Networking CRM Lite ----
type CrmContact = {
  id: string;
  name: string;
  company: string;
  metAt: string;
  note: string;
  followUp: string; // yyyy-mm-dd
  done: boolean;
};

function NetworkingCrmTool() {
  const STORE_KEY = "sbra.tool.crm";
  const [contacts, setContacts] = useState<CrmContact[]>(() => loadStored<CrmContact[]>(STORE_KEY, []));
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [metAt, setMetAt] = useState("");
  const [followUp, setFollowUp] = useState("");
  const [note, setNote] = useState("");

  function persist(next: CrmContact[]) {
    setContacts(next);
    saveStored(STORE_KEY, next);
  }
  function addContact() {
    if (!name.trim()) return;
    persist([
      ...contacts,
      { id: `c-${Date.now()}`, name: name.trim(), company: company.trim(), metAt: metAt.trim(), note: note.trim(), followUp, done: false }
    ]);
    setName("");
    setCompany("");
    setMetAt("");
    setFollowUp("");
    setNote("");
  }
  function toggleDone(id: string) {
    persist(contacts.map((c) => (c.id === id ? { ...c, done: !c.done } : c)));
  }
  function removeContact(id: string) {
    persist(contacts.filter((c) => c.id !== id));
  }

  const today = new Date().toISOString().slice(0, 10);
  const sorted = [...contacts].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    if (!a.followUp) return 1;
    if (!b.followUp) return -1;
    return a.followUp.localeCompare(b.followUp);
  });
  const pending = contacts.filter((c) => !c.done).length;
  const overdue = contacts.filter((c) => !c.done && c.followUp && c.followUp < today).length;

  return (
    <div className="tool-body">
      <article className="glass-panel tool-panel">
        <div className="tool-metric-grid">
          <div className="tool-metric"><strong>{contacts.length}</strong><span>Contacts</span></div>
          <div className="tool-metric"><strong>{pending}</strong><span>To follow up</span></div>
          <div className="tool-metric"><strong>{overdue}</strong><span>Overdue</span></div>
        </div>
      </article>

      <article className="glass-panel tool-panel">
        <p className="section-label">Add a contact</p>
        <div className="tool-form">
          <label className="tool-field"><span>Name</span><span className="tool-input-wrap"><input value={name} placeholder="Who did you meet?" onChange={(e) => setName(e.target.value)} /></span></label>
          <label className="tool-field"><span>Company</span><span className="tool-input-wrap"><input value={company} onChange={(e) => setCompany(e.target.value)} /></span></label>
          <label className="tool-field"><span>Met at</span><span className="tool-input-wrap"><input value={metAt} placeholder="Breakfast Club, Mingle…" onChange={(e) => setMetAt(e.target.value)} /></span></label>
          <label className="tool-field"><span>Follow up by</span><span className="tool-input-wrap"><input type="date" value={followUp} onChange={(e) => setFollowUp(e.target.value)} /></span></label>
          <label className="tool-field" style={{ gridColumn: "1 / -1" }}><span>Note</span><span className="tool-input-wrap"><input value={note} placeholder="What to remember / next step" onChange={(e) => setNote(e.target.value)} /></span></label>
        </div>
        <div className="tool-detail-actions">
          <button className="primary-button" onClick={addContact}>Add contact</button>
        </div>
      </article>

      {sorted.length === 0 ? (
        <article className="glass-panel tool-panel">
          <p className="tool-hint">No contacts yet. Add the people you meet at Breakfast Club and Mingles — this list saves on your device so follow-ups never slip.</p>
        </article>
      ) : (
        sorted.map((c) => {
          const isOverdue = !c.done && c.followUp && c.followUp < today;
          return (
            <article className={c.done ? "glass-panel tool-panel crm-card done" : "glass-panel tool-panel crm-card"} key={c.id}>
              <div className="crm-head">
                <div>
                  <h4>{c.name}{c.company && <span className="crm-company"> · {c.company}</span>}</h4>
                  {c.metAt && <span className="tool-hint">Met at {c.metAt}</span>}
                </div>
                {c.followUp && (
                  <span className={isOverdue ? "crm-followup overdue" : "crm-followup"}>
                    {c.done ? "Done" : isOverdue ? `Overdue · ${c.followUp}` : `Follow up ${c.followUp}`}
                  </span>
                )}
              </div>
              {c.note && <p className="crm-note">{c.note}</p>}
              <div className="tool-detail-actions">
                <button className="secondary-button" onClick={() => toggleDone(c.id)}>{c.done ? "Reopen" : "Mark followed up"}</button>
                <button className="secondary-button" onClick={() => removeContact(c.id)}>Remove</button>
              </div>
            </article>
          );
        })
      )}
    </div>
  );
}

// A reusable "this is sample content" banner for the stubbed tools.
function SampleBanner({ children }: { children: React.ReactNode }) {
  return (
    <div className="sample-banner no-print">
      <span className="sample-tag">Sample data</span>
      <span>{children}</span>
    </div>
  );
}

// ---- Tax & Compliance Calendar (SAMPLE DATA — verify before relying on it) ----
type TaxScope = "Federal" | "PA" | "Local";
const taxDeadlines: { date: string; title: string; detail: string; scope: TaxScope }[] = [
  { date: "2026-01-15", title: "Q4 2025 estimated tax", detail: "4th-quarter estimated income tax payment for 2025.", scope: "Federal" },
  { date: "2026-01-31", title: "W-2 & 1099-NEC to recipients", detail: "Furnish wage and contractor statements; file with SSA/IRS.", scope: "Federal" },
  { date: "2026-03-16", title: "S-corp & partnership returns", detail: "Form 1120-S / 1065 due (or file for extension).", scope: "Federal" },
  { date: "2026-04-15", title: "Individual & C-corp returns · Q1 estimate", detail: "Form 1040 / 1120 and 1st-quarter 2026 estimated tax.", scope: "Federal" },
  { date: "2026-04-15", title: "PA personal income tax", detail: "PA-40 return and any balance due.", scope: "PA" },
  { date: "2026-06-15", title: "Q2 estimated tax", detail: "2nd-quarter 2026 estimated income tax payment.", scope: "Federal" },
  { date: "2026-06-30", title: "PA annual report", detail: "Annual report for many PA business entities (staggered deadlines).", scope: "PA" },
  { date: "2026-09-15", title: "Q3 estimate · extended S-corp/partnership", detail: "3rd-quarter estimate and extended 1120-S / 1065.", scope: "Federal" },
  { date: "2026-10-15", title: "Extended individual & C-corp returns", detail: "Final deadline for returns on extension.", scope: "Federal" },
  { date: "2026-04-15", title: "Reading business privilege / mercantile tax", detail: "Local business tax filings vary by municipality — check with your township or the City of Reading.", scope: "Local" }
];

function TaxCalendarTool() {
  const [scope, setScope] = useState<"all" | TaxScope>("all");
  const today = new Date().toISOString().slice(0, 10);
  const shown = taxDeadlines
    .filter((d) => scope === "all" || d.scope === scope)
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date));

  function daysUntil(date: string) {
    const ms = new Date(date + "T00:00:00").getTime() - new Date(today + "T00:00:00").getTime();
    return Math.round(ms / 86400000);
  }
  const nextUp = taxDeadlines.filter((d) => d.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0];

  return (
    <div className="tool-body">
      <SampleBanner>Illustrative 2026 dates for planning only — not tax advice. Confirm exact deadlines with your accountant or the IRS/PA DOR.</SampleBanner>

      {nextUp && (
        <article className="glass-panel tool-panel">
          <p className="section-label">Next deadline</p>
          <h4 style={{ margin: "2px 0 2px" }}>{nextUp.title}</h4>
          <p className="tool-hint">{nextUp.date} · {daysUntil(nextUp.date)} days away · {nextUp.scope}</p>
        </article>
      )}

      <div className="tools-filters">
        {(["all", "Federal", "PA", "Local"] as const).map((s) => (
          <button key={s} className={scope === s ? "tool-chip active" : "tool-chip"} onClick={() => setScope(s)}>{s === "all" ? "All" : s}</button>
        ))}
      </div>

      <article className="glass-panel tool-panel">
        <div className="cal-list">
          {shown.map((d, i) => {
            const du = daysUntil(d.date);
            const past = du < 0;
            return (
              <div className={past ? "cal-row past" : "cal-row"} key={`${d.date}-${i}`}>
                <div className="cal-date">
                  <strong>{new Date(d.date + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })}</strong>
                  <small>{new Date(d.date + "T00:00:00").getFullYear()}</small>
                </div>
                <div className="cal-body">
                  <div className="cal-title">{d.title} <span className={`cal-scope scope-${d.scope.toLowerCase()}`}>{d.scope}</span></div>
                  <p>{d.detail}</p>
                </div>
                <span className="cal-when">{past ? "Passed" : du === 0 ? "Today" : `${du}d`}</span>
              </div>
            );
          })}
        </div>
      </article>
    </div>
  );
}

// ---- Grant & Local Resource Finder (SAMPLE DATA — verify links & eligibility) ----
type ResourceType = "Grant" | "Loan" | "Program" | "Mentorship";
const resources: { name: string; org: string; type: ResourceType; detail: string; url: string }[] = [
  { name: "Berks LaunchBox", org: "Penn State Berks", type: "Program", detail: "Free coworking, mentorship, and startup support for Berks County entrepreneurs.", url: "https://launchbox.psu.edu/" },
  { name: "Kutztown University SBDC", org: "PA SBDC network", type: "Mentorship", detail: "No-cost, confidential consulting and training for small businesses.", url: "https://www.kutztownsbdc.org/" },
  { name: "SCORE Northeastern PA", org: "SCORE / SBA", type: "Mentorship", detail: "Free volunteer business mentoring and workshops.", url: "https://www.score.org/" },
  { name: "SBA 7(a) Loan", org: "U.S. Small Business Administration", type: "Loan", detail: "Flexible, government-backed loans for working capital, equipment, and expansion.", url: "https://www.sba.gov/funding-programs/loans/7a-loans" },
  { name: "SBA Microloan", org: "U.S. Small Business Administration", type: "Loan", detail: "Loans up to $50,000 for startups and small businesses via local intermediaries.", url: "https://www.sba.gov/funding-programs/loans/microloans" },
  { name: "Berks County Community Foundation", org: "Berks County Community Foundation", type: "Grant", detail: "Local grant programs supporting community and economic development.", url: "https://bccf.org/" },
  { name: "Greater Reading Chamber Alliance", org: "GRCA", type: "Program", detail: "Business resources, advocacy, and economic-development programs for Greater Reading.", url: "https://greaterreading.org/" },
  { name: "PA DCED Funding & Programs", org: "PA Dept. of Community & Economic Development", type: "Grant", detail: "State grants, loans, and tax credits for Pennsylvania businesses.", url: "https://dced.pa.gov/programs-funding/" }
];

function GrantFinderTool() {
  const [type, setType] = useState<"all" | ResourceType>("all");
  const [query, setQuery] = useState("");
  const shown = resources.filter((r) => {
    if (type !== "all" && r.type !== type) return false;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return `${r.name} ${r.org} ${r.detail}`.toLowerCase().includes(q);
  });

  return (
    <div className="tool-body">
      <SampleBanner>A starter list of real Berks/PA/federal programs — verify current links, eligibility, and deadlines before applying.</SampleBanner>

      <article className="glass-panel tool-panel">
        <label className="tool-field">
          <span>Search resources</span>
          <span className="tool-input-wrap"><input value={query} placeholder="loan, mentorship, grant…" onChange={(e) => setQuery(e.target.value)} /></span>
        </label>
        <div className="tools-filters">
          {(["all", "Grant", "Loan", "Program", "Mentorship"] as const).map((t) => (
            <button key={t} className={type === t ? "tool-chip active" : "tool-chip"} onClick={() => setType(t)}>{t === "all" ? "All" : t}</button>
          ))}
        </div>
      </article>

      {shown.map((r) => (
        <article className="glass-panel tool-panel resource-card" key={r.name}>
          <div className="resource-head">
            <div>
              <h4>{r.name}</h4>
              <span className="tool-hint">{r.org}</span>
            </div>
            <span className={`cal-scope res-${r.type.toLowerCase()}`}>{r.type}</span>
          </div>
          <p className="crm-note">{r.detail}</p>
          <a className="secondary-button resource-link" href={r.url} target="_blank" rel="noreferrer">Visit ↗</a>
        </article>
      ))}
      {shown.length === 0 && (
        <article className="glass-panel tool-panel"><p className="tool-hint">No resources match that search.</p></article>
      )}
    </div>
  );
}

// ---- Document Template Library (SAMPLE templates — not legal advice) ----
const docTemplates: { id: string; name: string; category: string; body: string }[] = [
  {
    id: "nda",
    name: "Mutual NDA",
    category: "Agreements",
    body:
      "MUTUAL NON-DISCLOSURE AGREEMENT\n\nThis Agreement is made on [DATE] between [YOUR BUSINESS] and [OTHER PARTY].\n\n1. Purpose. The parties wish to explore [PURPOSE] and may share confidential information.\n2. Confidential Information. Any non-public business, technical, or financial information shared by either party.\n3. Obligations. Each party will keep the other's confidential information secret and use it only for the Purpose.\n4. Term. These obligations last for [NUMBER] years from the date above.\n\nSigned:\n[YOUR BUSINESS] ______________   [OTHER PARTY] ______________"
  },
  {
    id: "service-agreement",
    name: "Simple Service Agreement",
    category: "Agreements",
    body:
      "SERVICE AGREEMENT\n\nBetween [YOUR BUSINESS] (\"Provider\") and [CLIENT] (\"Client\"), dated [DATE].\n\n1. Services. Provider will deliver: [DESCRIBE SERVICES].\n2. Fees. Client will pay [AMOUNT], due [TERMS, e.g. 50% up front, balance on completion].\n3. Timeline. Work begins [START DATE] and is expected to finish by [END DATE].\n4. Cancellation. Either party may cancel with [NUMBER] days' written notice.\n\nSigned:\nProvider ______________   Client ______________"
  },
  {
    id: "proposal",
    name: "Project Proposal",
    category: "Sales",
    body:
      "PROJECT PROPOSAL\n\nPrepared for [CLIENT] by [YOUR BUSINESS] on [DATE].\n\nOverview\n[One paragraph on the client's goal and how you'll help.]\n\nScope of Work\n- [Deliverable 1]\n- [Deliverable 2]\n- [Deliverable 3]\n\nInvestment\n[AMOUNT] — [payment terms].\n\nTimeline\n[Start] to [finish], with milestones at [dates].\n\nNext Steps\nReply to approve and we'll send an agreement to get started."
  },
  {
    id: "onboarding",
    name: "Client Onboarding Letter",
    category: "Client",
    body:
      "Dear [CLIENT],\n\nWelcome to [YOUR BUSINESS] — we're glad to be working with you!\n\nHere's what happens next:\n1. [First step]\n2. [Second step]\n3. [Third step]\n\nYour main point of contact is [NAME] at [EMAIL / PHONE]. Please send over [ANY ITEMS YOU NEED] at your convenience.\n\nThanks again for choosing us.\n\nWarmly,\n[YOUR NAME], [YOUR BUSINESS]"
  },
  {
    id: "referral-thankyou",
    name: "Referral Thank-You",
    category: "Client",
    body:
      "Hi [NAME],\n\nThank you so much for referring [WHO] to [YOUR BUSINESS]. Referrals from people I respect mean everything, and I'll take great care of them.\n\nIf there's ever anyone I can introduce you to in the SBRA network, just say the word — I'm always happy to return the favor.\n\nGratefully,\n[YOUR NAME]"
  }
];

function DocTemplatesTool({ currentBusiness }: { currentBusiness?: Business }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const open = docTemplates.find((t) => t.id === openId) ?? null;
  const bizName = currentBusiness?.name ?? "[YOUR BUSINESS]";
  const filledBody = open ? open.body.replaceAll("[YOUR BUSINESS]", bizName) : "";

  async function copy() {
    try {
      await navigator.clipboard.writeText(filledBody);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard blocked — the member can still select the text manually
    }
  }

  if (open) {
    return (
      <div className="tool-body">
        <button className="tool-back no-print" onClick={() => setOpenId(null)}>← All templates</button>
        <SampleBanner>A simple starting template, not legal advice. Have important agreements reviewed by an attorney.</SampleBanner>
        <article className="glass-panel tool-panel tool-print" id="doc-print">
          <h3 style={{ margin: "0 0 4px" }}>{open.name}</h3>
          <p className="draft-text">{filledBody}</p>
        </article>
        <div className="tool-detail-actions no-print">
          <button className="secondary-button" onClick={copy}>{copied ? "Copied ✓" : "Copy"}</button>
          <button className="primary-button" onClick={() => window.print()}>Print / Save PDF</button>
        </div>
      </div>
    );
  }

  const categories = Array.from(new Set(docTemplates.map((t) => t.category)));
  return (
    <div className="tool-body">
      <SampleBanner>Starter templates with fill-in-the-blanks — not legal advice. Review important documents with an attorney.</SampleBanner>
      {categories.map((cat) => (
        <section className="tool-category" key={cat}>
          <div className="tool-category-head"><h4>{cat}</h4></div>
          <div className="tools-grid">
            {docTemplates.filter((t) => t.category === cat).map((t) => (
              <button className="glass-panel tool-card" key={t.id} onClick={() => { setOpenId(t.id); setCopied(false); }}>
                <span className="tool-card-icon" aria-hidden="true">📄</span>
                <h5>{t.name}</h5>
                <p>{t.category}</p>
                <span className="tool-card-open">Open →</span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function LearnView() {
  const [completed, setCompleted] = useState<Array<string | number>>([]);
  const progress = Math.round((completed.length / learningModules.length) * 100);
  const podcasts = [
    {
      title: "Roadmap to Referrals",
      creator: "Stacey Brown Randall",
      description: "Practical ways to build a business that earns consistent, natural referrals.",
      url: "https://podcasts.apple.com/us/podcast/roadmap-to-referrals/id1405302350",
      tone: "blue"
    },
    {
      title: "Business Networking & Referrals",
      creator: "Faithann Basore",
      description: "Approachable advice for better conversations, follow-up, and trusted connections.",
      url: "https://podcasts.apple.com/us/podcast/business-networking-referrals-with-faithann-basore/id1780213594",
      tone: "coral"
    },
    {
      title: "LatinX Business",
      creator: "Randy Gomez",
      description: "Stories and useful business lessons from entrepreneurs in the Latino community.",
      url: "https://podcasts.apple.com/us/podcast/latinx-business/id1539059232",
      tone: "violet"
    }
  ];
  return (
    <section className="learn-page">
      <div className="learning-grid">
        <article className="glass-panel learn-feature">
          <p className="section-label">Continue learning</p>
          <h3>Master the Referral Exchange</h3>
          <p>A short path from giving your first referral to closing the loop, built from the SBRA program.</p>
          <div className="learning-progress"><span style={{ width: `${progress}%` }} /></div>
          <p className="progress-copy">{completed.length} of {learningModules.length} complete</p>
          <button className="primary-button" onClick={() => setCompleted((items) => items.length === learningModules.length ? [] : [...items, learningModules.find((module) => !items.includes(module.number))!.number])}>{completed.length === learningModules.length ? "Restart learning path" : "Complete next module"}</button>
        </article>
        <div className="module-list">
          {learningModules.map((module) => (
            <article className={completed.includes(module.number) ? "glass-panel module complete" : "glass-panel module"} key={module.number}>
              <span>{completed.includes(module.number) ? "✓" : module.number}</span>
              <div>
                <h3>{module.title}</h3>
                <p>{module.description}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
      <section className="podcast-section" aria-labelledby="podcast-title">
        <div className="podcast-heading">
          <div>
            <p className="section-label">Recommended listening</p>
            <h3 id="podcast-title">Learn on the go</h3>
          </div>
          <span>Curated for Berks County business owners</span>
        </div>
        <div className="podcast-grid">
          {podcasts.map((podcast) => (
            <a className="glass-panel podcast-card" href={podcast.url} target="_blank" rel="noreferrer" key={podcast.title}>
              <span className={`podcast-art podcast-${podcast.tone}`} aria-hidden="true">▶</span>
              <div>
                <small>APPLE PODCASTS</small>
                <h4>{podcast.title}</h4>
                <p>{podcast.description}</p>
                <strong>{podcast.creator} <span>↗</span></strong>
              </div>
            </a>
          ))}
        </div>
      </section>
    </section>
  );
}

function SupportView({
  requests,
  selectedCategory,
  detail,
  onCategory,
  onDetail,
  onCreateRequest
}: {
  requests: SupportRequest[];
  selectedCategory: string;
  detail: string;
  onCategory: (value: string) => void;
  onDetail: (value: string) => void;
  onCreateRequest: () => void;
}) {
  return (
    <section className="support-layout">
      <section className="glass-panel support-card">
        <p className="section-label">Request support</p>
        <h3>Contact the SBRA team</h3>
        <p className="support-intro">Choose a topic and briefly describe what you need. Staff will follow up through your member email.</p>
        <div className="support-buttons">
          {!supportCategories.includes(selectedCategory) && <button className="active">{selectedCategory}</button>}
          {supportCategories.map((item) => (
            <button className={item === selectedCategory ? "active" : ""} key={item} onClick={() => onCategory(item)}>
              {item}
            </button>
          ))}
        </div>
        <textarea
          className="support-detail"
          aria-label="Support request detail"
          placeholder="Tell us what happened, what you expected, and any deadline we should know about..."
          value={detail}
          onChange={(event) => onDetail(event.target.value)}
        />
        <button className="primary-button request-submit" onClick={onCreateRequest}>
          Send to SBRA staff
        </button>
      </section>
      <section className="glass-panel support-card">
        <p className="section-label">Open requests</p>
        {requests.map((request) => (
          <div className="request-row" key={request.id}>
            <div>
              <strong>{request.title}</strong>
              <small>{request.detail}</small>
            </div>
            <span>{request.status}</span>
          </div>
        ))}
      </section>
    </section>
  );
}

function ProfileView({
  member,
  business,
  onEdit
}: {
  member?: Member;
  business?: Business;
  onEdit: (member: Member) => void;
}) {
  if (!member) {
    return (
      <section className="glass-panel profile-card standalone-profile">
        <p className="section-label">My profile</p>
        <h3>No profile yet</h3>
      </section>
    );
  }

  const profileFields = [member.name, member.title, member.email, member.phone, member.bio, business?.servicesOffered, business?.referralsWanted];
  const completeFields = profileFields.filter((field) => Boolean(field?.trim())).length;
  const completion = Math.round((completeFields / profileFields.length) * 100);

  return (
    <section className="glass-panel profile-card standalone-profile">
      <div className="profile-hero gradient-a" />
      <div className="avatar floating">{initials(member.name)}</div>
      <p className="section-label">My profile</p>
      <h3>{member.name}</h3>
      <p>
        {member.title}
        {business ? ` · ${business.name}` : ""}
      </p>
      <div className="tag-row">
        {member.isOwner && <span>Owner</span>}
        {business && <span>{business.category}</span>}
        {business && <span>{tierLabels[business.tier]}</span>}
      </div>
      <p>{member.bio}</p>
      <div className="profile-completion">
        <div><strong>Profile strength</strong><span>{completion}% complete</span></div>
        <div className="learning-progress"><span style={{ width: `${completion}%` }} /></div>
        {completion < 100 && <p>Add your phone, bio, services, and ideal referrals so members know when to contact you.</p>}
      </div>
      <div className="profile-contact">
        <span>{member.email}</span>
        <span>{member.phone}</span>
      </div>
      <button className="primary-button profile-edit" onClick={() => onEdit(member)}>
        Edit Profile
      </button>
    </section>
  );
}

function MemberModal({
  draft,
  business,
  onChange,
  onClose,
  onSave
}: {
  draft: Member;
  business?: Business;
  onChange: (member: Member) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <div className="modal-backdrop open" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="glass-panel profile-modal" role="dialog" aria-modal="true" aria-labelledby="modal-name">
        <button className="modal-close" onClick={onClose} aria-label="Close profile">
          Close
        </button>
        <div className="modal-head">
          <div className="avatar large">{initials(draft.name)}</div>
          <div>
            <p className="section-label">My profile</p>
            <h3 id="modal-name">{draft.name}</h3>
            <p>{business ? business.name : draft.title}</p>
          </div>
        </div>

        <form className="profile-form">
          {memberFields.map((field) => (
            <label key={field} className={field === "bio" ? "wide" : ""}>
              {field}
              {field === "bio" ? (
                <textarea value={draft[field]} onChange={(event) => onChange({ ...draft, [field]: event.target.value })} />
              ) : (
                <input value={draft[field]} onChange={(event) => onChange({ ...draft, [field]: event.target.value })} />
              )}
            </label>
          ))}
        </form>

        <div className="modal-actions">
          <button className="secondary-button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary-button" onClick={onSave}>
            Save Profile
          </button>
        </div>
      </section>
    </div>
  );
}

function referralAge(createdAt: number) {
  const days = Math.max(0, Math.round((Date.now() - createdAt) / 86400000));
  if (days === 0) return "today";
  return `${days}d ago`;
}

function memberLine(member: Member | undefined, businessById: Map<string, Business>) {
  if (!member) return "Unknown member";
  const business = businessById.get(member.businessId);
  return business ? `${member.name} · ${business.name}` : member.name;
}

function ReferralsView({
  referrals,
  memberById,
  businessById,
  currentMemberId,
  onGive,
  onMarkContacted,
  onMarkLost,
  onOpenClose
}: {
  referrals: Referral[];
  memberById: Map<string, Member>;
  businessById: Map<string, Business>;
  currentMemberId: string;
  onGive: () => void;
  onMarkContacted: (referral: Referral) => void;
  onMarkLost: (referral: Referral) => void;
  onOpenClose: (referral: Referral) => void;
}) {
  const given = referrals.filter((referral) => referral.giverId === currentMemberId);
  const received = referrals.filter((referral) => referral.receiverId === currentMemberId);
  const closedWonGiven = given.filter((referral) => referral.status === "closed_won");
  const creditedValue = closedWonGiven.reduce((total, referral) => total + (referral.closedValue ?? 0), 0);

  const now = Date.now();
  // Open referrals sent to you that have gone quiet — your move to advance them.
  const staleReceived = received.filter((referral) => isReferralStale(referral, now));

  // Top givers over a rolling window, ranked by referrals given (the behavior we
  // want to reward), then by dollars credited as a tiebreaker.
  const windowStart = now - LEADERBOARD_WINDOW_DAYS * REFERRAL_DAY_MS;
  const giverStats = new Map<string, { giverId: string; given: number; closedWon: number; credited: number }>();
  for (const referral of referrals) {
    if (referral.createdAt < windowStart) continue;
    const stats = giverStats.get(referral.giverId) ?? { giverId: referral.giverId, given: 0, closedWon: 0, credited: 0 };
    stats.given += 1;
    if (referral.status === "closed_won") {
      stats.closedWon += 1;
      stats.credited += referral.closedValue ?? 0;
    }
    giverStats.set(referral.giverId, stats);
  }
  const rankedGivers = [...giverStats.values()].sort((a, b) => b.given - a.given || b.credited - a.credited);
  const topGivers = rankedGivers.slice(0, 5);
  const myRankIndex = rankedGivers.findIndex((stats) => stats.giverId === currentMemberId);

  return (
    <section className="referrals-layout">
      <div className="glass-panel referral-header">
        <div>
          <p className="section-label">Referral exchange</p>
          <h3>Give a lead. Make an introduction. Close the loop.</h3>
          <p className="referral-sub">Connect a real opportunity with the right SBRA member, then keep the status current so everyone can see the impact.</p>
          <p className="impact-note">The people and businesses are sourced from SBRA’s public directory; all activity, referrals, and financial metrics in this demo are illustrative.</p>
          <ol className="referral-how" aria-label="How the referral program works">
            <li><span>1</span><p><strong>Send</strong><small>Share a qualified lead or warm member introduction.</small></p></li>
            <li><span>2</span><p><strong>Follow up</strong><small>The receiving member contacts them and updates the status.</small></p></li>
            <li><span>3</span><p><strong>Record the result</strong><small>Log wins and value so the connector gets credit.</small></p></li>
          </ol>
        </div>
        <button className="primary-button" onClick={onGive}>
          <span className="button-icon">+</span>
          Send a referral
        </button>
      </div>

      {staleReceived.length > 0 && (
        <div className="glass-panel referral-nudge" role="status">
          <span className="referral-nudge-icon" aria-hidden="true">!</span>
          <div className="referral-nudge-body">
            <strong>
              {staleReceived.length} referral{staleReceived.length > 1 ? "s" : ""} waiting on you
            </strong>
            <span>
              {staleReceived.length === 1 ? "A referral has" : "Referrals have"} sat for{" "}
              {STALE_REFERRAL_DAYS}+ days. Mark them contacted or closed so the giver gets their credit.
            </span>
          </div>
        </div>
      )}

      <div className="metric-grid">
        <article className="glass-panel metric">
          <span>Given</span>
          <strong>{given.length}</strong>
          <p>Referrals you sent</p>
        </article>
        <article className="glass-panel metric">
          <span>Received</span>
          <strong>{received.length}</strong>
          <p>Referrals to you</p>
        </article>
        <article className="glass-panel metric">
          <span>Closed won</span>
          <strong>{closedWonGiven.length}</strong>
          <p>Your referrals that closed</p>
        </article>
        <article className="glass-panel metric">
          <span>Business generated</span>
          <strong>${creditedValue.toLocaleString()}</strong>
          <p>Value from referrals you sent</p>
        </article>
      </div>

      <ReferralImpactBoard
        referrals={referrals}
        memberById={memberById}
        businessById={businessById}
        currentMemberId={currentMemberId}
      />

      {topGivers.length > 0 && (
        <div className="glass-panel leaderboard">
          <div className="leaderboard-head">
            <p className="section-label">Top givers · last {LEADERBOARD_WINDOW_DAYS} days</p>
            {myRankIndex >= 0 && <span className="leaderboard-you">You&apos;re #{myRankIndex + 1}</span>}
          </div>
          <ol className="leaderboard-list">
            {topGivers.map((stats, index) => {
              const member = memberById.get(stats.giverId);
              const isYou = stats.giverId === currentMemberId;
              return (
                <li key={stats.giverId} className={isYou ? "leaderboard-row you" : "leaderboard-row"}>
                  <span className="leaderboard-rank">{index + 1}</span>
                  <span className="leaderboard-name">
                    {member?.name ?? "SBRA member"}
                    {isYou && <span className="leaderboard-tag">You</span>}
                  </span>
                  <span className="leaderboard-stat">
                    {stats.given} given · {stats.closedWon} closed
                  </span>
                  <span className="leaderboard-credit">${stats.credited.toLocaleString()}</span>
                </li>
              );
            })}
          </ol>
          {myRankIndex >= topGivers.length && (
            <p className="leaderboard-selfnote">
              You&apos;re #{myRankIndex + 1} with {rankedGivers[myRankIndex].given} given — give another to climb.
            </p>
          )}
        </div>
      )}

      <div className="referral-columns">
        <section className="referral-column">
          <p className="section-label">Given by you ({given.length})</p>
          {given.map((referral) => (
            <ReferralCard
              key={referral.id}
              referral={referral}
              perspective="given"
              isStale={isReferralStale(referral, now)}
              memberById={memberById}
              businessById={businessById}
              onMarkContacted={onMarkContacted}
              onMarkLost={onMarkLost}
              onOpenClose={onOpenClose}
            />
          ))}
          {given.length === 0 && <div className="empty-state">You haven&apos;t given a referral yet.</div>}
        </section>

        <section className="referral-column">
          <p className="section-label">Received by you ({received.length})</p>
          {received.map((referral) => (
            <ReferralCard
              key={referral.id}
              referral={referral}
              perspective="received"
              isStale={isReferralStale(referral, now)}
              memberById={memberById}
              businessById={businessById}
              onMarkContacted={onMarkContacted}
              onMarkLost={onMarkLost}
              onOpenClose={onOpenClose}
            />
          ))}
          {received.length === 0 && <div className="empty-state">No referrals sent to you yet.</div>}
        </section>
      </div>
    </section>
  );
}

function ReferralImpactBoard({
  referrals,
  memberById,
  businessById,
  currentMemberId
}: {
  referrals: Referral[];
  memberById: Map<string, Member>;
  businessById: Map<string, Business>;
  currentMemberId: string;
}) {
  const revenueByMember = new Map<string, number>();
  referrals.forEach((referral) => {
    if (referral.status === "closed_won") {
      revenueByMember.set(
        referral.receiverId,
        (revenueByMember.get(referral.receiverId) ?? 0) + (referral.closedValue ?? 0)
      );
    }
  });

  const rows = Array.from(memberById.values())
    .map((member) => {
      const referralRevenue = revenueByMember.get(member.id) ?? 0;
      const savings = memberSavings[member.id]?.amount ?? 0;
      return {
        member,
        business: businessById.get(member.businessId),
        referralRevenue,
        savings,
        savingsDetail: memberSavings[member.id]?.detail ?? "No savings logged yet",
        totalImpact: referralRevenue + savings
      };
    })
    .filter((row) => row.totalImpact > 0)
    .sort((a, b) => b.totalImpact - a.totalImpact);

  const referralTotal = rows.reduce((sum, row) => sum + row.referralRevenue, 0);
  const savingsTotal = rows.reduce((sum, row) => sum + row.savings, 0);

  return (
    <section className="glass-panel impact-board" aria-labelledby="impact-board-title">
      <div className="impact-board-head">
        <div>
          <p className="section-label">Member impact board</p>
          <h3 id="impact-board-title">Value created across SBRA</h3>
          <p>Closed referral revenue plus estimated savings from member benefits.</p>
        </div>
        <div className="impact-totals" aria-label="Community impact totals">
          <span><small>Revenue generated</small><strong>${referralTotal.toLocaleString()}</strong></span>
          <span><small>Member savings</small><strong>${savingsTotal.toLocaleString()}</strong></span>
          <span className="impact-total"><small>Total impact</small><strong>${(referralTotal + savingsTotal).toLocaleString()}</strong></span>
        </div>
      </div>

      <div className="impact-table" role="table" aria-label="Member revenue and savings leaderboard">
        <div className="impact-table-header" role="row">
          <span role="columnheader">Member</span>
          <span role="columnheader">Referral revenue</span>
          <span role="columnheader">Member savings</span>
          <span role="columnheader">Total impact</span>
        </div>
        {rows.map((row, index) => (
          <div
            className={row.member.id === currentMemberId ? "impact-row current" : "impact-row"}
            role="row"
            key={row.member.id}
          >
            <div className="impact-member" role="cell">
              <span className={`impact-rank rank-${Math.min(index + 1, 4)}`}>{index + 1}</span>
              <span className="impact-avatar">{initials(row.member.name)}</span>
              <span>
                <strong>{row.member.name}{row.member.id === currentMemberId ? " (You)" : ""}</strong>
                <small>{row.business?.name ?? "SBRA member"}</small>
              </span>
            </div>
            <span className="impact-value" role="cell"><strong>${row.referralRevenue.toLocaleString()}</strong><small>Closed business</small></span>
            <span className="impact-value" role="cell"><strong>${row.savings.toLocaleString()}</strong><small>{row.savingsDetail}</small></span>
            <strong className="impact-grand-total" role="cell">${row.totalImpact.toLocaleString()}</strong>
          </div>
        ))}
      </div>
      <p className="impact-note">All referral activity, revenue, savings, rankings, and engagement shown here are illustrative demo data—not verified results attributed to these members.</p>
    </section>
  );
}

function ReferralCard({
  referral,
  perspective,
  isStale,
  memberById,
  businessById,
  onMarkContacted,
  onMarkLost,
  onOpenClose
}: {
  referral: Referral;
  perspective: "given" | "received";
  isStale: boolean;
  memberById: Map<string, Member>;
  businessById: Map<string, Business>;
  onMarkContacted: (referral: Referral) => void;
  onMarkLost: (referral: Referral) => void;
  onOpenClose: (referral: Referral) => void;
}) {
  const giver = memberById.get(referral.giverId);
  const receiver = memberById.get(referral.receiverId);
  const introduced = referral.introducedMemberId ? memberById.get(referral.introducedMemberId) : undefined;
  const isClosed = referral.status === "closed_won" || referral.status === "closed_lost";
  const counterpart = perspective === "given" ? receiver : giver;

  return (
    <article className={`glass-panel referral-card status-${referral.status}`}>
      <div className="referral-card-head">
        <span className={`ref-kind ${referral.kind}`}>{referral.kind === "lead" ? "Lead" : "Intro"}</span>
        <span className={`status-chip ref-status ${referral.status}`}>{referralStatusLabels[referral.status]}</span>
        <span className="referral-age">{referralAge(referral.createdAt)}</span>
      </div>

      <p className="referral-direction">
        {perspective === "given" ? "To " : "From "}
        <strong>{memberLine(counterpart, businessById)}</strong>
      </p>

      {referral.kind === "lead" ? (
        <p className="referral-prospect">
          <span className="section-label">Prospect</span>
          {referral.prospectName || "—"}
          {referral.prospectContact ? ` · ${referral.prospectContact}` : ""}
        </p>
      ) : (
        <p className="referral-prospect">
          <span className="section-label">Introduce</span>
          {memberLine(introduced, businessById)}
        </p>
      )}

      <p className="referral-need">{referral.need}</p>

      {isStale && !isClosed && (
        <p className="referral-stale-chip">
          {perspective === "received"
            ? "Your move — update this"
            : `Waiting on ${counterpart?.name?.split(" ")[0] ?? "them"}`}
        </p>
      )}

      {referral.status === "closed_won" && (
        <div className="referral-closed">
          <strong>Closed ${Number(referral.closedValue ?? 0).toLocaleString()}</strong>
          {referral.thankYou && <span>&ldquo;{referral.thankYou}&rdquo;</span>}
        </div>
      )}
      {referral.status === "closed_lost" && <div className="referral-closed lost">Closed — did not convert</div>}

      {perspective === "received" && !isClosed && (
        <div className="referral-actions">
          {referral.status === "given" && (
            <button className="secondary-button" onClick={() => onMarkContacted(referral)}>
              Mark contacted
            </button>
          )}
          <button className="primary-button" onClick={() => onOpenClose(referral)}>
            Close — won
          </button>
          <button className="secondary-button" onClick={() => onMarkLost(referral)}>
            Close — lost
          </button>
        </div>
      )}
    </article>
  );
}

function GiveReferralModal({
  draft,
  members,
  currentMemberId,
  businessById,
  onChange,
  onClose,
  onSubmit
}: {
  draft: ReferralDraft;
  members: Member[];
  currentMemberId: string;
  businessById: Map<string, Business>;
  onChange: (draft: ReferralDraft) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const others = members.filter((member) => member.id !== currentMemberId);
  const introOptions = others.filter((member) => member.id !== draft.receiverId);
  const canSubmit =
    Boolean(draft.receiverId) &&
    draft.need.trim().length > 0 &&
    (draft.kind === "lead" || Boolean(draft.introducedMemberId));

  return (
    <div className="modal-backdrop open" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="glass-panel profile-modal" role="dialog" aria-modal="true" aria-labelledby="give-referral">
        <button className="modal-close" onClick={onClose} aria-label="Close referral form">
          Close
        </button>
        <div className="modal-head">
          <div className="avatar large">+</div>
          <div>
            <p className="section-label">New referral</p>
            <h3 id="give-referral">Give a referral</h3>
            <p>Send a lead or make an introduction.</p>
          </div>
        </div>

        <div className="role-toggle referral-kind-toggle" aria-label="Referral kind">
          <button
            type="button"
            className={draft.kind === "lead" ? "active" : ""}
            onClick={() => onChange({ ...draft, kind: "lead" })}
          >
            Lead (external prospect)
          </button>
          <button
            type="button"
            className={draft.kind === "intro" ? "active" : ""}
            onClick={() => onChange({ ...draft, kind: "intro" })}
          >
            Intro (member to member)
          </button>
        </div>

        <form className="profile-form referral-form" onSubmit={(event) => event.preventDefault()}>
          <label className="wide">
            Refer to
            <select value={draft.receiverId} onChange={(event) => onChange({ ...draft, receiverId: event.target.value })}>
              <option value="">Choose a member…</option>
              {others.map((member) => (
                <option key={member.id} value={member.id}>
                  {memberLine(member, businessById)}
                </option>
              ))}
            </select>
          </label>

          {draft.kind === "lead" ? (
            <>
              <label>
                Prospect name
                <input
                  value={draft.prospectName}
                  onChange={(event) => onChange({ ...draft, prospectName: event.target.value })}
                />
              </label>
              <label>
                Prospect contact
                <input
                  value={draft.prospectContact}
                  onChange={(event) => onChange({ ...draft, prospectContact: event.target.value })}
                />
              </label>
              <label className="wide">
                What they need
                <textarea value={draft.need} onChange={(event) => onChange({ ...draft, need: event.target.value })} />
              </label>
            </>
          ) : (
            <>
              <label className="wide">
                Member to introduce
                <select
                  value={draft.introducedMemberId}
                  onChange={(event) => onChange({ ...draft, introducedMemberId: event.target.value })}
                >
                  <option value="">Choose a member…</option>
                  {introOptions.map((member) => (
                    <option key={member.id} value={member.id}>
                      {memberLine(member, businessById)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="wide">
                Why connect them
                <textarea value={draft.need} onChange={(event) => onChange({ ...draft, need: event.target.value })} />
              </label>
            </>
          )}
        </form>

        <div className="modal-actions">
          <button className="secondary-button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary-button" disabled={!canSubmit} onClick={onSubmit}>
            Send Referral
          </button>
        </div>
      </section>
    </div>
  );
}

function CloseReferralModal({
  referral,
  memberById,
  onClose,
  onConfirm
}: {
  referral: Referral;
  memberById: Map<string, Member>;
  onClose: () => void;
  onConfirm: (referral: Referral, closedValue: number, thankYou: string) => void;
}) {
  const [value, setValue] = useState("");
  const [thankYou, setThankYou] = useState("");
  const giver = memberById.get(referral.giverId);

  return (
    <div className="modal-backdrop open" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="glass-panel profile-modal close-referral-modal" role="dialog" aria-modal="true">
        <button className="modal-close" onClick={onClose} aria-label="Close">
          Close
        </button>
        <div className="modal-head">
          <div className="avatar large">$</div>
          <div>
            <p className="section-label">Close the loop</p>
            <h3>Mark referral as won</h3>
            <p>Credit the closed business to {giver ? giver.name : "the giver"}.</p>
          </div>
        </div>

        <form className="profile-form" onSubmit={(event) => event.preventDefault()}>
          <label>
            Closed value ($)
            <input
              type="number"
              min="0"
              inputMode="numeric"
              value={value}
              onChange={(event) => setValue(event.target.value)}
            />
          </label>
          <label className="wide">
            Thank-you note
            <textarea
              placeholder={`Thank ${giver ? giver.name.split(" ")[0] : "them"} for the referral…`}
              value={thankYou}
              onChange={(event) => setThankYou(event.target.value)}
            />
          </label>
        </form>

        <div className="modal-actions">
          <button className="secondary-button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary-button" onClick={() => onConfirm(referral, Number(value) || 0, thankYou)}>
            Confirm Won
          </button>
        </div>
      </section>
    </div>
  );
}

function formatEventTime(startsAt: number, endsAt?: number) {
  const start = new Date(startsAt);
  const datePart = start.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric"
  });
  const startTime = start.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const endTime = endsAt
    ? new Date(endsAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    : null;
  return `${datePart} · ${startTime}${endTime ? ` – ${endTime}` : ""}`;
}

function EventsView({
  events,
  rsvps,
  memberById,
  currentMemberId,
  onCreate,
  onRsvp,
  onToggleCheckIn,
  canCreate
}: {
  events: SbraEvent[];
  rsvps: Rsvp[];
  memberById: Map<string, Member>;
  currentMemberId: string;
  onCreate: () => void;
  onRsvp: (eventId: string, status: RsvpStatus) => void;
  onToggleCheckIn: (eventId: string) => void;
  canCreate: boolean;
}) {
  const sorted = [...events].sort((a, b) => a.startsAt - b.startsAt);

  return (
    <section className="events-layout">
      <div className="glass-panel referral-header">
        <div>
          <p className="section-label">Events &amp; Mingles</p>
          <h3>Show up and connect</h3>
          <p className="referral-sub">Breakfast Referral Club, Mingles, ribbon-cuttings, and workshops.</p>
        </div>
        <button className="primary-button" onClick={onCreate}>
          <span className="button-icon">+</span>
          {canCreate ? "Create event" : "Propose an event"}
        </button>
      </div>

      <div className="events-grid">
        {sorted.map((event) => {
          const eventRsvps = rsvps.filter((rsvp) => rsvp.eventId === event.id);
          const myRsvp = eventRsvps.find((rsvp) => rsvp.memberId === currentMemberId);
          return (
            <EventCard
              key={event.id}
              event={event}
              eventRsvps={eventRsvps}
              myRsvp={myRsvp}
              host={event.hostMemberId ? memberById.get(event.hostMemberId) : undefined}
              onRsvp={onRsvp}
              onToggleCheckIn={onToggleCheckIn}
            />
          );
        })}
        {events.length === 0 && <div className="empty-state">No upcoming events yet.</div>}
      </div>
    </section>
  );
}

function EventCard({
  event,
  eventRsvps,
  myRsvp,
  host,
  onRsvp,
  onToggleCheckIn
}: {
  event: SbraEvent;
  eventRsvps: Rsvp[];
  myRsvp?: Rsvp;
  host?: Member;
  onRsvp: (eventId: string, status: RsvpStatus) => void;
  onToggleCheckIn: (eventId: string) => void;
}) {
  const goingCount = eventRsvps.filter((rsvp) => rsvp.status === "going").length;
  const maybeCount = eventRsvps.filter((rsvp) => rsvp.status === "maybe").length;
  const statuses: RsvpStatus[] = ["going", "maybe", "declined"];
  const statusText: Record<RsvpStatus, string> = { going: "Going", maybe: "Maybe", declined: "Can't go" };

  return (
    <article className={`glass-panel event-card type-${event.type}`}>
      <div className="event-card-head">
        <span className={`event-type-badge ${event.type}`}>{eventTypeLabels[event.type]}</span>
        {event.recurrence !== "none" && <span className="event-recurrence">{event.recurrence}</span>}
        <span className="event-cost">{event.cost > 0 ? `$${event.cost}` : "Free"}</span>
      </div>

      <h3 className="event-title">{event.title}</h3>
      <p className="event-when">{formatEventTime(event.startsAt, event.endsAt)}</p>

      <p className="event-venue">
        <strong>{event.venueName}</strong>
        {event.venueAddress ? <span>{event.venueAddress}</span> : null}
      </p>

      {host && <p className="event-host">Hosted by {host.name}</p>}
      <p className="event-desc">{event.description}</p>

      <div className="event-meta">
        <span>
          <strong>{goingCount}</strong> going
        </span>
        <span>
          <strong>{maybeCount}</strong> maybe
        </span>
        {event.capacity ? <span>Cap {event.capacity}</span> : null}
      </div>

      <div className="event-rsvp">
        {statuses.map((status) => (
          <button
            key={status}
            className={myRsvp?.status === status ? "rsvp-button active" : "rsvp-button"}
            onClick={() => onRsvp(event.id, status)}
          >
            {statusText[status]}
          </button>
        ))}
      </div>

      {myRsvp?.status === "going" && (
        <button
          className={myRsvp.checkedIn ? "secondary-button checkin-button checked" : "secondary-button checkin-button"}
          onClick={() => onToggleCheckIn(event.id)}
        >
          {myRsvp.checkedIn ? "✓ Checked in" : "Check in"}
        </button>
      )}
    </article>
  );
}

function CreateEventModal({
  draft,
  onChange,
  onClose,
  onSubmit
}: {
  draft: EventDraft;
  onChange: (draft: EventDraft) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const canSubmit = draft.title.trim().length > 0 && Boolean(draft.startsAt) && draft.venueName.trim().length > 0;
  const eventTypes = Object.keys(eventTypeLabels) as EventType[];

  return (
    <div className="modal-backdrop open" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="glass-panel profile-modal" role="dialog" aria-modal="true" aria-labelledby="create-event">
        <button className="modal-close" onClick={onClose} aria-label="Close event form">
          Close
        </button>
        <div className="modal-head">
          <div className="avatar large">+</div>
          <div>
            <p className="section-label">New event</p>
            <h3 id="create-event">Create an event</h3>
            <p>Host a Mingle, workshop, or gathering.</p>
          </div>
        </div>

        <form className="profile-form" onSubmit={(event) => event.preventDefault()}>
          <label className="wide">
            Title
            <input value={draft.title} onChange={(event) => onChange({ ...draft, title: event.target.value })} />
          </label>
          <label>
            Type
            <select
              value={draft.type}
              onChange={(event) => onChange({ ...draft, type: event.target.value as EventType })}
            >
              {eventTypes.map((type) => (
                <option key={type} value={type}>
                  {eventTypeLabels[type]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Date &amp; time
            <input
              type="datetime-local"
              value={draft.startsAt}
              onChange={(event) => onChange({ ...draft, startsAt: event.target.value })}
            />
          </label>
          <label>
            Venue name
            <input value={draft.venueName} onChange={(event) => onChange({ ...draft, venueName: event.target.value })} />
          </label>
          <label>
            Venue address
            <input
              value={draft.venueAddress}
              onChange={(event) => onChange({ ...draft, venueAddress: event.target.value })}
            />
          </label>
          <label>
            Cost ($, 0 = free)
            <input
              type="number"
              min="0"
              value={draft.cost}
              onChange={(event) => onChange({ ...draft, cost: event.target.value })}
            />
          </label>
          <label>
            Capacity
            <input
              type="number"
              min="0"
              value={draft.capacity}
              onChange={(event) => onChange({ ...draft, capacity: event.target.value })}
            />
          </label>
          <label className="wide">
            Description
            <textarea
              value={draft.description}
              onChange={(event) => onChange({ ...draft, description: event.target.value })}
            />
          </label>
        </form>

        <div className="modal-actions">
          <button className="secondary-button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary-button" disabled={!canSubmit} onClick={onSubmit}>
            Create Event
          </button>
        </div>
      </section>
    </div>
  );
}

// Calls useSession() and relays the session up to SBRAApp. Rendered only in
// backend mode, so useSession() is always inside a SessionProvider and never
// runs (nor fetches /api/auth/session) in seed mode.
function SessionBridge({ onSession }: { onSession: (session: Session | null) => void }) {
  const { data } = useSession();
  useEffect(() => {
    onSession(data ?? null);
  }, [data, onSession]);
  return null;
}

function OnboardingWizard({
  draft,
  businesses,
  onChange,
  onClose,
  onFinish
}: {
  draft: OnboardingDraft;
  businesses: Business[];
  onChange: (draft: OnboardingDraft) => void;
  onClose: () => void;
  onFinish: () => void;
}) {
  const [step, setStep] = useState(1);
  const canContinue = draft.name.trim().length > 0 && draft.email.trim().length > 0;
  const canFinish =
    canContinue &&
    ((draft.mode === "create" && draft.businessName.trim().length > 0) ||
      (draft.mode === "join" && Boolean(draft.joinBusinessId)));

  return (
    <div className="modal-backdrop open" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="glass-panel profile-modal onboarding-modal" role="dialog" aria-modal="true" aria-labelledby="onboarding">
        <button className="modal-close" onClick={onClose} aria-label="Close">
          Close
        </button>
        <div className="modal-head">
          <div className="avatar large">SB</div>
          <div>
            <p className="section-label">Join SBRA · Step {step} of 2</p>
            <h3 id="onboarding">{step === 1 ? "About you" : "Your business"}</h3>
            <p>Be Better. Grow Faster.</p>
          </div>
        </div>

        {step === 1 ? (
          <form className="profile-form" onSubmit={(event) => event.preventDefault()}>
            <label>
              Full name
              <input value={draft.name} onChange={(event) => onChange({ ...draft, name: event.target.value })} />
            </label>
            <label>
              Email
              <input type="email" value={draft.email} onChange={(event) => onChange({ ...draft, email: event.target.value })} />
            </label>
            <label>
              Your title
              <input value={draft.title} onChange={(event) => onChange({ ...draft, title: event.target.value })} />
            </label>
            <label>
              Phone
              <input value={draft.phone} onChange={(event) => onChange({ ...draft, phone: event.target.value })} />
            </label>
            <label className="wide">
              Short bio
              <textarea value={draft.bio} onChange={(event) => onChange({ ...draft, bio: event.target.value })} />
            </label>
          </form>
        ) : (
          <>
            <div className="role-toggle onboarding-toggle" aria-label="Business option">
              <button
                type="button"
                className={draft.mode === "create" ? "active" : ""}
                onClick={() => onChange({ ...draft, mode: "create" })}
              >
                Create a new business
              </button>
              <button
                type="button"
                className={draft.mode === "join" ? "active" : ""}
                onClick={() => onChange({ ...draft, mode: "join" })}
              >
                Join an existing business
              </button>
            </div>

            {draft.mode === "create" ? (
              <form className="profile-form" onSubmit={(event) => event.preventDefault()}>
                <label className="wide">
                  Business name
                  <input value={draft.businessName} onChange={(event) => onChange({ ...draft, businessName: event.target.value })} />
                </label>
                <label>
                  Category
                  <input value={draft.category} onChange={(event) => onChange({ ...draft, category: event.target.value })} />
                </label>
                <label>
                  City
                  <input value={draft.city} onChange={(event) => onChange({ ...draft, city: event.target.value })} />
                </label>
                <label className="wide">
                  Services offered (comma-separated)
                  <input value={draft.servicesOffered} onChange={(event) => onChange({ ...draft, servicesOffered: event.target.value })} />
                </label>
                <label className="wide">
                  Referrals wanted
                  <textarea value={draft.referralsWanted} onChange={(event) => onChange({ ...draft, referralsWanted: event.target.value })} />
                </label>
                <p className="onboarding-note">You'll be the owner. Your membership tier is set by SBRA staff.</p>
              </form>
            ) : (
              <form className="profile-form" onSubmit={(event) => event.preventDefault()}>
                <label className="wide">
                  Choose your business
                  <select value={draft.joinBusinessId} onChange={(event) => onChange({ ...draft, joinBusinessId: event.target.value })}>
                    <option value="">Select a member business…</option>
                    {businesses.map((business) => (
                      <option key={business.id} value={business.id}>
                        {business.name} · {business.city}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="onboarding-note">You'll join as a team member. The owner can update your role.</p>
              </form>
            )}
          </>
        )}

        <div className="modal-actions">
          {step === 2 && (
            <button className="secondary-button" onClick={() => setStep(1)}>
              Back
            </button>
          )}
          {step === 1 ? (
            <button className="primary-button" disabled={!canContinue} onClick={() => setStep(2)}>
              Continue
            </button>
          ) : (
            <button className="primary-button" disabled={!canFinish} onClick={onFinish}>
              Join SBRA
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
