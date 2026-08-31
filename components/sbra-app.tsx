"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
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
import type { Session } from "next-auth";
import { signIn as authSignIn, signOut as authSignOut, useSession } from "next-auth/react";
import * as backendActions from "@/app/actions";
import { isBackendEnabled } from "@/lib/backend";
import { parseRosterFile } from "@/lib/importers";
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
// admin — and are surfaced on the login screen so anyone can try the demo.
// They carry no security: seed mode has no real backend or private data.
type DemoAccount = { email: string; password: string; role: UserRole; label: string };
const DEMO_ACCOUNTS: DemoAccount[] = [
  { email: "member@sbra.demo", password: "sbrademo", role: "member", label: "Member" },
  { email: "admin@sbra.demo", password: "sbrademo", role: "admin", label: "Admin" }
];

type MemberTextField = "name" | "title" | "email" | "phone" | "bio";
type DraftPostAttachment = PostAttachment & { file?: File };

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

const navItems: Array<{ key: ViewKey; label: string; count: string; icon: ViewKey; adminOnly?: boolean }> = [
  { key: "community", label: "Home", count: "12", icon: "community" },
  { key: "directory", label: "Directory", count: "Members", icon: "directory" },
  { key: "referrals", label: "Referrals", count: "Core", icon: "referrals" },
  { key: "events", label: "Events", count: "Mingles", icon: "events" },
  { key: "learn", label: "Learn", count: "3", icon: "learn" },
  { key: "support", label: "Support", count: "4", icon: "support" },
  { key: "profile", label: "Profile", count: "You", icon: "profile" },
  { key: "admin", label: "Admin", count: "Live", icon: "admin", adminOnly: true }
];

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

  const visibleNav = navItems.filter((item) => !item.adminOnly || role === "admin");

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
        detail: "Friday 7:30 AM at B2 Bistro — Tom Alvarez is the feature speaker.",
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
        setLiveNote("Invalid demo credentials. Use one of the demo logins below.");
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
    void patchReferral(referral.id, { status: "contacted" });
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

  if (authLoading) {
    return (
      <main className="login-screen">
        <section className="glass-panel login-card">
          <LogoBlock large />
          <p className="eyebrow">Small Business Resource Association</p>
          <h1>SBRA</h1>
          <p className="login-copy">Loading your SBRA session...</p>
        </section>
      </main>
    );
  }

  if (!role) {
    return (
      <main className="login-screen">
        {dbEnabled && <SessionBridge onSession={setSession} />}
        <section className="glass-panel login-card">
          <LogoBlock large />
          <p className="eyebrow">Small Business Resource Association</p>
          <h1>SBRA</h1>
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
          {!dbEnabled && !backendEnabled && (
            <div className="demo-credentials">
              <p className="demo-credentials-title">Demo logins</p>
              {DEMO_ACCOUNTS.map((account) => (
                <button
                  key={account.email}
                  type="button"
                  className="demo-credential-chip"
                  onClick={() => {
                    setLoginRole(account.role);
                    setLoginEmail(account.email);
                    setLoginPassword(account.password);
                  }}
                >
                  <span className="demo-credential-label">{account.label}</span>
                  <span className="demo-credential-detail">
                    {account.email} · {account.password}
                  </span>
                </button>
              ))}
            </div>
          )}
          <p className="login-signup">
            New to SBRA?{" "}
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
          <LogoBlock />
          <div>
            <p className="eyebrow">Small Business Resource Association</p>
            <h1>SBRA</h1>
          </div>
        </div>

        <nav className="nav-list" aria-label="Primary">
          {visibleNav.map((item) => (
            <NavButton key={item.key} item={item} active={activeView === item.key} onClick={() => changeView(item.key)} />
          ))}
        </nav>

        <section className="theme-card">
          <p className="section-label">Signed in</p>
          <div className="role-grid compact">
            <div>
              <strong>{roleLabel}</strong>
              <span>
                {liveProfile?.email ||
                  (role === "admin" ? "Reports, import, moderation" : currentBusiness?.name || "Member")}
              </span>
            </div>
          </div>
          <div className="live-note">{liveNote}</div>
          <button className="secondary-button logout-button" onClick={() => void signOutCurrentUser()}>
            <span className="button-icon">O</span>
            Sign out
          </button>
        </section>
      </aside>

      <main className="main-panel">
        <header className="glass-panel topbar">
          <div>
            <p className="eyebrow">Welcome back, {currentMember?.name.split(" ")[0] || "there"}</p>
            <h2>{viewTitles[activeView]}</h2>
          </div>
          <div className="top-actions">
            <span className="session-pill">{roleLabel}</span>
            <button
              className={globalSearchOpen ? "icon-button active" : "icon-button"}
              aria-label="Search"
              onClick={() => {
                setGlobalSearchOpen((open) => !open);
                setAlertsOpen(false);
              }}
            >
              Search
            </button>
            <button
              className={alertsOpen ? "icon-button active" : "icon-button"}
              aria-label="Notifications"
              onClick={() => {
                setAlertsOpen((open) => !open);
                setGlobalSearchOpen(false);
              }}
            >
              <UtilityIcon icon="bell" />
            </button>
            <button
              className={settingsOpen ? "icon-button active" : "icon-button"}
              aria-label="Settings"
              onClick={() => {
                setSettingsOpen((open) => !open);
                setAlertsOpen(false);
                setGlobalSearchOpen(false);
              }}
            >
              <UtilityIcon icon="settings" />
            </button>
            <button className="primary-button" onClick={() => setComposerOpen(true)}>
              <span className="button-icon">+</span>
              New Post
            </button>
          </div>
          {globalSearchOpen && (
            <div className="top-popover search-popover">
              <input
                aria-label="Search SBRA"
                autoFocus
                placeholder="Search businesses, members, posts, support..."
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
                {globalSearch.trim() && globalResults.length === 0 && <p>No matches yet.</p>}
                {!globalSearch.trim() && <p>Try a business, member, service, support topic, or module.</p>}
              </div>
            </div>
          )}
          {alertsOpen && (
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
          {settingsOpen && (
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

        {activeView === "community" && (
          <CommunityView
            posts={posts}
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
            onCreate={openEventComposer}
            onRsvp={setEventRsvp}
            onToggleCheckIn={toggleCheckIn}
          />
        )}
        {activeView === "learn" && <LearnView />}
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
            businessCount={businesses.length}
            memberCount={members.length}
            categories={categories}
            businesses={businesses}
            importNote={importNote}
            adminNote={adminNote}
            onAdminAction={setAdminNote}
            onImport={handleImport}
          />
        )}
      </main>

      <nav className="glass-panel mobile-nav" aria-label="Mobile primary">
        {visibleNav.map((item) => (
          <button
            key={item.key}
            ref={activeView === item.key ? activeNavRef : null}
            className={activeView === item.key ? "active" : ""}
            onClick={() => changeView(item.key)}
            aria-label={item.label}
          >
            <span className="mobile-icon">
              <NavIcon icon={item.icon} />
            </span>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      {activeBusiness && (
        <BusinessModal
          business={activeBusiness}
          members={membersByBusiness.get(activeBusiness.id) ?? []}
          onClose={() => setActiveBusiness(null)}
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
  item: (typeof navItems)[number];
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
  onCancelPost
}: {
  posts: CommunityPost[];
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
}) {
  return (
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
                <div>
                  <h3>{post.author}</h3>
                  <p>
                    {post.businessName ? `${post.businessName} · ` : ""}
                    {post.timeAgo}
                  </p>
                </div>
                <span className={`pill ${post.tone === "violet" ? "violet" : ""}`}>{post.category}</span>
              </div>
              <p className="post-copy">{post.body}</p>
              {post.attachments && post.attachments.length > 0 && (
                <div className={post.attachments.some((attachment) => attachment.kind === "image") ? "post-attachments media-grid" : "post-attachments"}>
                  {post.attachments.map((attachment) => (
                    <AttachmentPreview attachment={attachment} key={attachment.id} />
                  ))}
                </div>
              )}
              {post.note && (
                <div className="reply-box">
                  <strong>SBRA note</strong>
                  <span>{post.note}</span>
                </div>
              )}
              <div className="post-actions">
                <button className={iReacted ? "post-action active" : "post-action"} onClick={() => onToggleReaction(post.id)}>
                  {iReacted ? "★ Celebrated" : "Celebrate"} {reactionCount > 0 ? reactionCount : ""}
                </button>
                <button className={threadOpen ? "post-action active" : "post-action"} onClick={() => onToggleCommentThread(post.id)}>
                  Comment {commentCount > 0 ? commentCount : ""}
                </button>
                <button className="post-action">{post.category.includes("Question") ? "Give Referral" : "Save"}</button>
              </div>
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
          {["Grace Whitfield", "Tom Alvarez"].map((name, index) => (
            <div className="mentor" key={name}>
              <div className={index === 0 ? "avatar blue" : "avatar violet"}>{initials(name)}</div>
              <div>
                <strong>{name}</strong>
                <span>{index === 0 ? "Vantage Insurance Group" : "Cornerstone Bookkeeping"}</span>
              </div>
            </div>
          ))}
        </section>
      </aside>
    </section>
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
  onOpenBusiness
}: {
  businesses: Business[];
  membersByBusiness: Map<string, Member[]>;
  categories: string[];
  categoryFilter: string;
  search: string;
  onCategoryFilter: (value: string) => void;
  onSearch: (value: string) => void;
  onOpenBusiness: (business: Business) => void;
}) {
  return (
    <section>
      <div className="glass-panel toolbar">
        <input
          aria-label="Search member businesses"
          placeholder="Search by business, service, or referral need..."
          value={search}
          onChange={(event) => onSearch(event.target.value)}
        />
        <select aria-label="Filter by category" value={categoryFilter} onChange={(event) => onCategoryFilter(event.target.value)}>
          <option value="all">All categories</option>
          {categories.map((category) => (
            <option value={category} key={category}>
              {category}
            </option>
          ))}
        </select>
      </div>
      <div className="biz-grid">
        {businesses.map((business, index) => {
          const owner = (membersByBusiness.get(business.id) ?? []).find((member) => member.isOwner);
          const teamSize = membersByBusiness.get(business.id)?.length ?? 0;
          return (
            <button className="glass-panel biz-card" key={business.id} onClick={() => onOpenBusiness(business)}>
              <div className="biz-card-head">
                <span className={`mini-avatar ${index % 3 === 1 ? "coral" : index % 3 === 2 ? "green" : "blue"}`}>
                  {initials(business.name)}
                </span>
                <div>
                  <strong>{business.name}</strong>
                  <small>{business.category} · {business.city}</small>
                </div>
                <TierBadge tier={business.tier} />
              </div>
              <p className="biz-desc">{business.description}</p>
              <div className="biz-services">
                {splitList(business.servicesOffered).slice(0, 4).map((service) => (
                  <span className="service-chip" key={service}>
                    {service}
                  </span>
                ))}
              </div>
              <div className="biz-referral">
                <span className="section-label">Referrals wanted</span>
                <p>{business.referralsWanted || "Open to all introductions."}</p>
              </div>
              <div className="biz-card-foot">
                <span>{owner ? owner.name : "Member"}</span>
                <span>{teamSize} member{teamSize === 1 ? "" : "s"}</span>
              </div>
            </button>
          );
        })}
        {businesses.length === 0 && <div className="empty-state">No member businesses match these filters yet.</div>}
      </div>
    </section>
  );
}

function BusinessModal({
  business,
  members,
  onClose
}: {
  business: Business;
  members: Member[];
  onClose: () => void;
}) {
  return (
    <div className="modal-backdrop open" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="glass-panel profile-modal" role="dialog" aria-modal="true" aria-labelledby="business-name">
        <button className="modal-close" onClick={onClose} aria-label="Close business profile">
          Close
        </button>
        <div className="modal-head">
          <div className="avatar large">{initials(business.name)}</div>
          <div>
            <p className="section-label">Member business</p>
            <h3 id="business-name">{business.name}</h3>
            <p>{business.category} · {business.city}</p>
          </div>
          <TierBadge tier={business.tier} />
        </div>

        <p className="post-copy">{business.description}</p>

        <div className="biz-detail-grid">
          <div>
            <span className="section-label">Services offered</span>
            <div className="biz-services">
              {splitList(business.servicesOffered).map((service) => (
                <span className="service-chip" key={service}>
                  {service}
                </span>
              ))}
            </div>
          </div>
          <div>
            <span className="section-label">Referrals wanted</span>
            <p>{business.referralsWanted || "Open to all introductions."}</p>
          </div>
          <div>
            <span className="section-label">Contact</span>
            <p>
              {business.website && (
                <>
                  {business.website}
                  <br />
                </>
              )}
              {business.address}
              {business.address && business.city ? ", " : ""}
              {business.city}
            </p>
          </div>
        </div>

        <div className="member-list">
          <span className="section-label">Team ({members.length})</span>
          {members.map((member) => (
            <div className="member-row" key={member.id}>
              <div className="mini-avatar blue">{initials(member.name)}</div>
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
          {members.length === 0 && <p>No members listed yet.</p>}
        </div>
      </section>
    </div>
  );
}

function LearnView() {
  return (
    <section className="learning-grid">
      <article className="glass-panel learn-feature">
        <p className="section-label">Continue learning</p>
        <h3>Master the Referral Exchange</h3>
        <p>A short path from giving your first referral to closing the loop, built from the SBRA program.</p>
        <button className="primary-button">Resume Module</button>
      </article>
      <div className="module-list">
        {learningModules.map((module) => (
          <article className="glass-panel module" key={module.number}>
            <span>{module.number}</span>
            <div>
              <h3>{module.title}</h3>
              <p>{module.description}</p>
            </div>
          </article>
        ))}
      </div>
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
        <h3>What do you need help with?</h3>
        <div className="support-buttons">
          {supportCategories.map((item) => (
            <button className={item === selectedCategory ? "active" : ""} key={item} onClick={() => onCategory(item)}>
              {item}
            </button>
          ))}
        </div>
        <textarea
          className="support-detail"
          aria-label="Support request detail"
          placeholder="Add the context SBRA staff should know..."
          value={detail}
          onChange={(event) => onDetail(event.target.value)}
        />
        <button className="primary-button request-submit" onClick={onCreateRequest}>
          Submit Request
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

function AdminView({
  businessCount,
  memberCount,
  categories,
  businesses,
  importNote,
  adminNote,
  onAdminAction,
  onImport
}: {
  businessCount: number;
  memberCount: number;
  categories: string[];
  businesses: Business[];
  importNote: string;
  adminNote: string;
  onAdminAction: (note: string) => void;
  onImport: (file: File | undefined) => void;
}) {
  const topCategories = categories
    .map((category) => ({
      category,
      count: businesses.filter((business) => business.category === category).length
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 4);
  const maxCount = Math.max(1, ...topCategories.map((entry) => entry.count));

  return (
    <section>
      <div className="metric-grid">
        <article className="glass-panel metric">
          <span>Member businesses</span>
          <strong>{businessCount}</strong>
          <p>Directory records</p>
        </article>
        <article className="glass-panel metric">
          <span>People</span>
          <strong>{memberCount}</strong>
          <p>Member logins</p>
        </article>
        <article className="glass-panel metric">
          <span>Support resolved</span>
          <strong>42</strong>
          <p>8 open requests</p>
        </article>
        <article className="glass-panel metric">
          <span>Referrals this month</span>
          <strong>63</strong>
          <p>Tracked outcomes</p>
        </article>
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
          <p className="section-label">Businesses by category</p>
          {topCategories.map(({ category, count }) => (
            <div className="bar-row" key={category}>
              <span>{category}</span>
              <div>
                <i style={{ width: `${Math.round((count / maxCount) * 100)}%` }} />
              </div>
              <strong>{count}</strong>
            </div>
          ))}
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

  return (
    <section className="referrals-layout">
      <div className="glass-panel referral-header">
        <div>
          <p className="section-label">Referral exchange</p>
          <h3>Give and track referrals</h3>
          <p className="referral-sub">Closed business is credited to whoever gave the referral — SBRA&apos;s closed loop.</p>
        </div>
        <button className="primary-button" onClick={onGive}>
          <span className="button-icon">+</span>
          Give a Referral
        </button>
      </div>

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
          <span>Credited to you</span>
          <strong>${creditedValue.toLocaleString()}</strong>
          <p>Closed business you drove</p>
        </article>
      </div>

      <div className="referral-columns">
        <section className="referral-column">
          <p className="section-label">Given by you ({given.length})</p>
          {given.map((referral) => (
            <ReferralCard
              key={referral.id}
              referral={referral}
              perspective="given"
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

function ReferralCard({
  referral,
  perspective,
  memberById,
  businessById,
  onMarkContacted,
  onMarkLost,
  onOpenClose
}: {
  referral: Referral;
  perspective: "given" | "received";
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
  onToggleCheckIn
}: {
  events: SbraEvent[];
  rsvps: Rsvp[];
  memberById: Map<string, Member>;
  currentMemberId: string;
  onCreate: () => void;
  onRsvp: (eventId: string, status: RsvpStatus) => void;
  onToggleCheckIn: (eventId: string) => void;
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
          Create Event
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
