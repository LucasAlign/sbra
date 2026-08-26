"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  createLivePost,
  createLiveSupportRequest,
  getLiveServices,
  loadOrCreateUserProfile,
  saveUserProfile,
  signInWithEmailPassword,
  signInForRole,
  watchPosts,
  watchSupportRequests,
  type LiveUserProfile
} from "@/lib/data";
import { parseRosterFile } from "@/lib/importers";
import {
  alumniSeed,
  communityPosts,
  initials,
  learningModules,
  supportCategories,
  supportRequests,
  viewTitles
} from "@/lib/seed-data";
import type { AlumniProfile, CommunityPost, PostAttachment, SupportRequest, UserRole, ViewKey } from "@/lib/types";

// Firebase removed (seed-first, decision #6). These stubs preserve the call
// sites; they never run while getLiveServices() returns null. When the backend
// is wired, real auth replaces them.
const onAuthStateChanged = (
  _auth: unknown,
  _next: (user: unknown) => void
): (() => void) => () => {};
const signOut = async (_auth: unknown): Promise<void> => {};

type ProfileTextField = Exclude<keyof AlumniProfile, "id" | "openToMentor">;
type DraftPostAttachment = PostAttachment & { file?: File };

type GlobalSearchResult = {
  id: string;
  label: string;
  detail: string;
  view: ViewKey;
  profile?: AlumniProfile;
};

const profileFields: ProfileTextField[] = [
  "name",
  "cohort",
  "school",
  "industry",
  "email",
  "phone",
  "city",
  "status",
  "business",
  "skills"
];

const navItems: Array<{ key: ViewKey; label: string; count: string; icon: ViewKey; adminOnly?: boolean }> = [
  { key: "community", label: "Home", count: "12", icon: "community" },
  { key: "directory", label: "Directory", count: "248", icon: "directory" },
  { key: "learn", label: "Learn", count: "36", icon: "learn" },
  { key: "support", label: "Support", count: "4", icon: "support" },
  { key: "profile", label: "Profile", count: "You", icon: "profile" },
  { key: "admin", label: "Admin", count: "Live", icon: "admin", adminOnly: true }
];

export function SBRAApp() {
  const liveServices = useMemo(() => getLiveServices(), []);
  const firebaseEnabled = Boolean(liveServices);
  const [role, setRole] = useState<UserRole | null>(null);
  const [liveProfile, setLiveProfile] = useState<LiveUserProfile | null>(null);
  const [authLoading, setAuthLoading] = useState(firebaseEnabled);
  const [liveNote, setLiveNote] = useState(
    firebaseEnabled ? "Firebase is connected. Sign in to load live data." : "Demo mode: add Firebase env vars to enable live auth, posts, support, and uploads."
  );
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginRole, setLoginRole] = useState<UserRole>("alumni");
  const [activeView, setActiveView] = useState<ViewKey>("community");
  const [alumni, setAlumni] = useState(alumniSeed);
  const [posts, setPosts] = useState(communityPosts);
  const [requests, setRequests] = useState(supportRequests);
  const [search, setSearch] = useState("");
  const [cohortFilter, setCohortFilter] = useState("all");
  const [mentorOnly, setMentorOnly] = useState(false);
  const [activeProfile, setActiveProfile] = useState<AlumniProfile | null>(null);
  const [draftProfile, setDraftProfile] = useState<AlumniProfile | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [postDraft, setPostDraft] = useState("");
  const [postAttachments, setPostAttachments] = useState<DraftPostAttachment[]>([]);
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [globalSearch, setGlobalSearch] = useState("");
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [supportCategory, setSupportCategory] = useState(supportCategories[0]);
  const [supportDetail, setSupportDetail] = useState("");
  const [adminNote, setAdminNote] = useState("Choose an admin tool to preview the next operational workflow.");
  const [importNote, setImportNote] = useState(
    "Upload CSV or Excel columns like name, cohort, school, industry, email, phone, business, status, city, skills."
  );

  useEffect(() => {
    if (!liveServices) {
      setAuthLoading(false);
      return;
    }

    let authSettled = false;
    const authFallback = window.setTimeout(() => {
      if (!authSettled) {
        setAuthLoading(false);
        setLiveNote("Firebase is connected. Sign in to load live data.");
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
        const profile = await loadOrCreateUserProfile(user, "alumni");
        if (!profile) return;
        setLiveProfile(profile);
        setRole(profile.role);
        setAlumni((records) => [profile, ...records.filter((person) => person.id !== profile.id)]);
        setActiveView("community");
        setLiveNote("Firebase profile loaded. Feed and support requests are live.");
      } catch (error) {
        setLiveNote(error instanceof Error ? error.message : "Unable to load Firebase profile.");
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

    return () => {
      stopPosts?.();
      stopRequests?.();
    };
  }, [liveServices, role]);

  const visibleNav = navItems.filter((item) => !item.adminOnly || role === "admin");
  const cohorts = useMemo(() => Array.from(new Set(alumni.map((person) => person.cohort))).sort().reverse(), [alumni]);
  const filteredAlumni = useMemo(() => {
    const query = search.trim().toLowerCase();
    return alumni.filter((person) => {
      const matchesQuery = !query || Object.values(person).join(" ").toLowerCase().includes(query);
      const matchesCohort = cohortFilter === "all" || person.cohort === cohortFilter;
      const matchesMentor = !mentorOnly || person.openToMentor;
      return matchesQuery && matchesCohort && matchesMentor;
    });
  }, [alumni, cohortFilter, mentorOnly, search]);

  const globalResults = useMemo<GlobalSearchResult[]>(() => {
    const query = globalSearch.trim().toLowerCase();
    if (!query) return [];

    const results: GlobalSearchResult[] = [];
    alumni.forEach((person) => {
      const haystack = [person.name, person.cohort, person.school, person.industry, person.business, person.city, person.skills]
        .join(" ")
        .toLowerCase();
      if (haystack.includes(query)) {
        results.push({
          id: `alumni-${person.id}`,
          label: person.name,
          detail: `${person.cohort} - ${person.industry} - ${person.business}`,
          view: "directory",
          profile: person
        });
      }
    });

    posts.forEach((post) => {
      const haystack = [post.author, post.category, post.body, post.business, ...(post.attachments ?? []).map((item) => item.name)]
        .join(" ")
        .toLowerCase();
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
        results.push({
          id: `module-${module.number}`,
          label: module.title,
          detail: module.description,
          view: "learn"
        });
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
  }, [alumni, globalSearch, posts, requests]);

  const alerts = useMemo(
    () => [
      {
        id: "support-alert",
        title: "Support queue updated",
        detail: `${requests.filter((request) => request.status !== "Resolved yesterday").length} requests need attention.`,
        view: "support" as ViewKey
      },
      {
        id: "mentor-alert",
        title: "Mentor matches ready",
        detail: `${alumni.filter((person) => person.openToMentor).length} alumni are open to mentoring.`,
        view: "directory" as ViewKey
      },
      {
        id: "event-alert",
        title: "Pitch Practice Night",
        detail: "32 RSVPs for Thursday at Penn State Berks.",
        view: "community" as ViewKey
      }
    ],
    [alumni, requests]
  );

  async function loginAs(nextRole: UserRole) {
    if (!liveServices) {
      setRole(nextRole);
      setActiveView("community");
      return;
    }

    setAuthLoading(true);
    setLiveNote("Opening Firebase sign-in...");
    try {
      const credential = await signInForRole(nextRole);
      if (!credential) return;
      const profile = await loadOrCreateUserProfile(credential.user, nextRole);
      if (!profile) return;
      setLiveProfile(profile);
      setRole(profile.role);
      setAlumni((records) => [profile, ...records.filter((person) => person.id !== profile.id)]);
      setActiveView("community");
      setLiveNote(`Signed in as ${profile.role}.`);
    } catch (error) {
      setLiveNote(error instanceof Error ? error.message : "Firebase sign-in failed.");
    } finally {
      setAuthLoading(false);
    }
  }

  async function loginWithEmailPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!liveServices) {
      setRole(loginRole);
      setActiveView("community");
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
      setAlumni((records) => [profile, ...records.filter((person) => person.id !== profile.id)]);
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

  function openProfile(person: AlumniProfile) {
    setActiveProfile(person);
    setDraftProfile({ ...person });
  }

  async function saveProfile() {
    if (!draftProfile) return;
    setAlumni((records) => records.map((person) => (person.id === draftProfile.id ? draftProfile : person)));
    if (liveProfile && draftProfile.id === liveProfile.id) {
      const updatedProfile = { ...liveProfile, ...draftProfile };
      setLiveProfile(updatedProfile);
      await saveUserProfile(updatedProfile);
      setLiveNote("Profile saved to Firebase.");
    }
    setActiveProfile(null);
    setDraftProfile(null);
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
        setLiveNote("Post saved to Firebase.");
      } catch (error) {
        setLiveNote(error instanceof Error ? error.message : "Unable to save this post.");
      }
      return;
    }

    const newPost: CommunityPost = {
      id: `post-${Date.now()}`,
      author: "Maya Chen",
      cohort: "2023 alumni",
      business: "digital media",
      timeAgo: "Just now",
      category: body.endsWith("?") ? "Community Ask" : "Update",
      tone: body.endsWith("?") ? "violet" : "green",
      body: body || "Shared new files with the community.",
      attachments: postAttachments,
      reactions: 0,
      comments: 0
    };
    setPosts((records) => [newPost, ...records]);
    setPostDraft("");
    setPostAttachments([]);
    setComposerOpen(false);
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
        setLiveNote("Support request saved to Firebase.");
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

  function openSearchResult(result: GlobalSearchResult) {
    setActiveView(result.view);
    setGlobalSearchOpen(false);
    setAlertsOpen(false);
    setSettingsOpen(false);
    setGlobalSearch("");
    if (result.profile) {
      openProfile(result.profile);
    }
  }

  async function handleImport(file: File | undefined) {
    if (!file || role !== "admin") return;

    try {
      const imported = await parseRosterFile(file);
      setAlumni((records) => [...imported, ...records]);
      setImportNote(`Imported ${imported.length} alumni record${imported.length === 1 ? "" : "s"} from ${file.name}.`);
      setActiveView("directory");
    } catch (error) {
      setImportNote(error instanceof Error ? error.message : "Unable to import this roster.");
    }
  }

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
        <section className="glass-panel login-card">
          <LogoBlock large />
          <p className="eyebrow">Small Business Resource Association</p>
          <h1>SBRA</h1>
          <p className="login-copy">{liveNote}</p>
          <form className="login-form" onSubmit={(event) => void loginWithEmailPassword(event)}>
            <div className="role-toggle" aria-label="Choose sign-in role">
              <button type="button" className={loginRole === "alumni" ? "active" : ""} onClick={() => setLoginRole("alumni")}>
                Alumni
              </button>
              <button type="button" className={loginRole === "admin" ? "active" : ""} onClick={() => setLoginRole("admin")}>
                Admin
              </button>
            </div>
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
          {firebaseEnabled && (
            <div className="login-actions compact">
              <button className="secondary-button" onClick={() => void loginAs(loginRole)}>
                Continue with Google
              </button>
            </div>
          )}
        </section>
      </main>
    );
  }

  return (
    <div className="app-shell">
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
          <p className="section-label">{firebaseEnabled ? "Phase 2 live" : "Phase 2 demo"}</p>
          <div className="role-grid compact">
            <div>
              <strong>{role === "admin" ? "Admin" : "Alumni"}</strong>
              <span>{liveProfile?.email || (role === "admin" ? "Reports, import, moderation" : "Community, learning, support")}</span>
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
            <p className="eyebrow">Welcome back, {liveProfile?.name.split(" ")[0] || "Maya"}</p>
            <h2>{viewTitles[activeView]}</h2>
          </div>
          <div className="top-actions">
            <span className="session-pill">{role === "admin" ? "Admin" : "Alumni"}</span>
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
                placeholder="Search people, posts, support, modules..."
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
                {!globalSearch.trim() && <p>Try a name, cohort, business, support topic, or module.</p>}
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
                  <span>Mentor match alerts</span>
                  <input type="checkbox" defaultChecked />
                </label>
                <label>
                  <span>Compact directory rows</span>
                  <input type="checkbox" />
                </label>
              </div>
            </div>
          )}
        </header>

        {activeView === "community" && (
          <CommunityView
            posts={posts}
            composerOpen={composerOpen}
            postDraft={postDraft}
            attachments={postAttachments}
            onOpenComposer={() => setComposerOpen(true)}
            onPostDraft={setPostDraft}
            onAddFiles={addPostFiles}
            onRemoveAttachment={removePostAttachment}
            onCreatePost={createPost}
            onCancelPost={() => {
              setComposerOpen(false);
              setPostDraft("");
              setPostAttachments([]);
            }}
          />
        )}
        {activeView === "directory" && (
          <DirectoryView
            alumni={filteredAlumni}
            cohorts={cohorts}
            cohortFilter={cohortFilter}
            mentorOnly={mentorOnly}
            search={search}
            onCohortFilter={setCohortFilter}
            onMentorOnly={setMentorOnly}
            onSearch={setSearch}
            onOpenProfile={openProfile}
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
        {activeView === "profile" && <ProfileView profile={liveProfile ?? alumni[0]} onEdit={openProfile} />}
        {activeView === "admin" && role === "admin" && (
          <AdminView
            alumniCount={alumni.length}
            importNote={importNote}
            adminNote={adminNote}
            onAdminAction={setAdminNote}
            onImport={handleImport}
          />
        )}
      </main>

      <nav className="glass-panel mobile-nav" aria-label="Mobile primary">
        {visibleNav.map((item) => {
          return (
            <button
              key={item.key}
              className={activeView === item.key ? "active" : ""}
              onClick={() => changeView(item.key)}
              aria-label={item.label}
            >
              <span className="mobile-icon">
                <NavIcon icon={item.icon} />
              </span>
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {activeProfile && draftProfile && (
        <ProfileModal
          draft={draftProfile}
          onChange={setDraftProfile}
          onClose={() => setActiveProfile(null)}
          onSave={saveProfile}
        />
      )}
    </div>
  );
}

function LogoBlock({ large = false }: { large?: boolean }) {
  return (
    <div className={large ? "brand-logo large-logo" : "brand-logo"} aria-label="SBRA">
      <span className="brand-wordmark">SBRA</span>
    </div>
  );
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
  composerOpen,
  postDraft,
  attachments,
  onOpenComposer,
  onPostDraft,
  onAddFiles,
  onRemoveAttachment,
  onCreatePost,
  onCancelPost
}: {
  posts: CommunityPost[];
  composerOpen: boolean;
  postDraft: string;
  attachments: PostAttachment[];
  onOpenComposer: () => void;
  onPostDraft: (value: string) => void;
  onAddFiles: (files: FileList | null) => void;
  onRemoveAttachment: (id: string) => void;
  onCreatePost: () => void;
  onCancelPost: () => void;
}) {
  return (
    <section className="content-grid">
      <div className="feed-column">
        <div className="glass-panel composer">
          <div className="avatar">MC</div>
          {composerOpen ? (
            <div className="composer-form">
              <textarea
                aria-label="New community post"
                autoFocus
                placeholder="Share a win, ask for help, or post an opportunity..."
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
                <button className="primary-button" onClick={onCreatePost}>
                  Post
                </button>
              </div>
            </div>
          ) : (
            <button className="composer-input" onClick={onOpenComposer}>
              Share a win, ask for help, or post an opportunity...
            </button>
          )}
        </div>

        {posts.map((post, index) => (
          <article className="glass-panel post-card" key={post.id}>
            <div className="post-head">
              <div className={`avatar ${post.tone}`}>{initials(post.author)}</div>
              <div>
                <h3>{post.author}</h3>
                <p>
                  {post.cohort} - {post.business} - {post.timeAgo}
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
                <strong>Coach note</strong>
                <span>{post.note}</span>
              </div>
            )}
            <div className="post-actions">
              <button>Celebrate {post.reactions > 0 ? post.reactions : ""}</button>
              <button>Comment {post.comments > 0 ? post.comments : ""}</button>
              <button>{post.category.includes("Ask") ? "Request Intro" : "Save"}</button>
            </div>
          </article>
        ))}
      </div>

      <aside className="right-rail">
        <section className="glass-panel rail-card">
          <p className="section-label">Upcoming</p>
          <h3>Pitch Practice Night</h3>
          <p>Thursday, 6:30 PM at Penn State Berks</p>
          <div className="mini-row">
            <span>RSVPs</span>
            <strong>32</strong>
          </div>
          <button className="secondary-button">RSVP</button>
        </section>

        <section className="glass-panel rail-card">
          <p className="section-label">Mentor matches</p>
          {["Sam Torres", "Nina Patel"].map((name, index) => (
            <div className="mentor" key={name}>
              <div className={index === 0 ? "avatar blue" : "avatar violet"}>{initials(name)}</div>
              <div>
                <strong>{name}</strong>
                <span>{index === 0 ? "Branding, websites, pricing" : "Finance, projections, grants"}</span>
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
  alumni,
  cohorts,
  cohortFilter,
  mentorOnly,
  search,
  onCohortFilter,
  onMentorOnly,
  onSearch,
  onOpenProfile
}: {
  alumni: AlumniProfile[];
  cohorts: string[];
  cohortFilter: string;
  mentorOnly: boolean;
  search: string;
  onCohortFilter: (value: string) => void;
  onMentorOnly: (value: boolean) => void;
  onSearch: (value: string) => void;
  onOpenProfile: (person: AlumniProfile) => void;
}) {
  return (
    <section>
      <div className="glass-panel toolbar">
        <input
          aria-label="Search alumni"
          placeholder="Search alumni by name, school, industry..."
          value={search}
          onChange={(event) => onSearch(event.target.value)}
        />
        <select
          aria-label="Filter by cohort"
          value={cohortFilter}
          onChange={(event) => onCohortFilter(event.target.value)}
        >
          <option value="all">All cohorts</option>
          {cohorts.map((cohort) => (
            <option value={cohort} key={cohort}>
              {cohort}
            </option>
          ))}
        </select>
        <label className={mentorOnly ? "toggle-chip active" : "toggle-chip"}>
          <input type="checkbox" checked={mentorOnly} onChange={(event) => onMentorOnly(event.target.checked)} />
          Open to mentor
        </label>
      </div>
      <div className="glass-panel directory-list">
        <div className="directory-header">
          <span>Alumni</span>
          <span>Cohort</span>
          <span>School</span>
          <span>Industry</span>
          <span>Business / Idea</span>
          <span>City</span>
          <span>Status</span>
        </div>
        {alumni.map((person, index) => (
          <button className="alumni-row" key={person.id} onClick={() => onOpenProfile(person)}>
            <span className="alumni-person">
              <span className={`mini-avatar ${index % 3 === 1 ? "coral" : index % 3 === 2 ? "green" : "blue"}`}>
                {initials(person.name)}
              </span>
              <span>
                <strong>{person.name}</strong>
                <small>{person.email}</small>
              </span>
            </span>
            <span className="desktop-alumni-field">{person.cohort}</span>
            <span className="desktop-alumni-field">{person.school}</span>
            <span className="desktop-alumni-field">{person.industry}</span>
            <span className="desktop-alumni-field">{person.business}</span>
            <span className="desktop-alumni-field">{person.city}</span>
            <span className="status-chip">{person.status}</span>
            <span className="mobile-alumni-meta">{person.industry} · {person.city}</span>
            <span className="mobile-alumni-business">{person.business}</span>
            <span className="mobile-alumni-cohort">{person.cohort}</span>
          </button>
        ))}
        {alumni.length === 0 && <div className="empty-state">No alumni match these filters yet.</div>}
      </div>
    </section>
  );
}

function LearnView() {
  return (
    <section className="learning-grid">
      <article className="glass-panel learn-feature">
        <p className="section-label">Continue learning</p>
        <h3>Build Your First Real Business Plan</h3>
        <p>A clean module path from idea validation to projections, built from the SBRA workshop flow.</p>
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

function ProfileView({ profile, onEdit }: { profile: AlumniProfile; onEdit: (person: AlumniProfile) => void }) {
  return (
    <section className="glass-panel profile-card standalone-profile">
      <div className="profile-hero gradient-a" />
      <div className="avatar floating">{initials(profile.name)}</div>
      <p className="section-label">Alumni profile</p>
      <h3>{profile.name}</h3>
      <p>
        {profile.cohort} - {profile.school} - {profile.industry}
      </p>
      <div className="tag-row">
        <span>{profile.status}</span>
        <span>{profile.city}</span>
        <span>{profile.openToMentor ? "Open to mentor" : "Building now"}</span>
      </div>
      <p>{profile.skills}</p>
      <button className="primary-button profile-edit" onClick={() => onEdit(profile)}>
        Edit Profile
      </button>
    </section>
  );
}

function AdminView({
  alumniCount,
  importNote,
  adminNote,
  onAdminAction,
  onImport
}: {
  alumniCount: number;
  importNote: string;
  adminNote: string;
  onAdminAction: (note: string) => void;
  onImport: (file: File | undefined) => void;
}) {
  return (
    <section>
      <div className="metric-grid">
        <article className="glass-panel metric">
          <span>Total alumni</span>
          <strong>{alumniCount}</strong>
          <p>Roster records ready</p>
        </article>
        <article className="glass-panel metric">
          <span>Active this month</span>
          <strong>71%</strong>
          <p>176 alumni engaged</p>
        </article>
        <article className="glass-panel metric">
          <span>Support resolved</span>
          <strong>42</strong>
          <p>8 open requests</p>
        </article>
        <article className="glass-panel metric">
          <span>Businesses launched</span>
          <strong>29</strong>
          <p>Tracked outcomes</p>
        </article>
      </div>

      <div className="admin-grid">
        <section className="glass-panel report-card admin-import-card">
          <p className="section-label">Access controlled</p>
          <h3>Admin Data Import</h3>
          <p className="admin-copy">
            Only Admin users can import rosters, approve accounts, edit alumni records, moderate posts, and export reports.
            Alumni users never see this navigation.
          </p>
          <div className="role-grid">
            <div>
              <strong>Admin</strong>
              <span>Import, edit, reports, moderation</span>
            </div>
            <div>
              <strong>Alumni</strong>
              <span>Directory, groups, support, learning</span>
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
          <p className="section-label">Engagement by cohort</p>
          {[["2025", "88%"], ["2024", "74%"], ["2023", "61%"], ["2022", "46%"]].map(([year, value]) => (
            <div className="bar-row" key={year}>
              <span>{year}</span>
              <div>
                <i style={{ width: value }} />
              </div>
              <strong>{value}</strong>
            </div>
          ))}
        </section>

        <section className="glass-panel report-card">
          <p className="section-label">Admin tools</p>
          {[
            ["Approve new alumni accounts", "A", "Account queue opened: 6 pending alumni need verification."],
            ["Review imported alumni data", "R", "Roster review opened: validate columns before writing to Firebase."],
            ["Export sponsor impact report", "E", "Impact report queued with engagement, launches, and support outcomes."],
            ["Manage resources and events", "M", "Resource manager opened: modules and events will be editable in Phase 2."],
            ["Review flagged content", "F", "Moderation queue opened: no high-priority flags in this seed demo."]
          ].map(([label, icon, note]) => {
            return (
              <button className="admin-action" key={label as string} onClick={() => onAdminAction(note as string)}>
                <span className="nav-icon">{icon as string}</span>
                {label as string}
              </button>
            );
          })}
          <div className="import-note admin-tool-note">{adminNote}</div>
        </section>
      </div>
    </section>
  );
}

function ProfileModal({
  draft,
  onChange,
  onClose,
  onSave
}: {
  draft: AlumniProfile;
  onChange: (profile: AlumniProfile) => void;
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
            <p className="section-label">Alumni profile</p>
            <h3 id="modal-name">{draft.name}</h3>
            <p>
              {draft.cohort} - {draft.school}
            </p>
          </div>
        </div>

        <form className="profile-form">
          {profileFields.map((field) => (
            <label key={field} className={field === "business" || field === "skills" ? "wide" : ""}>
              {field === "business" ? "Business / idea" : field}
              {field === "skills" ? (
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
            Save Changes
          </button>
        </div>
      </section>
    </div>
  );
}
