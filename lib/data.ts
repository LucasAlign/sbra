// Data-access seam for the SBRA app.
//
// Build order is "seed-first" (see decision #6): the app runs entirely on the
// local seed data in `lib/seed-data.ts`, and this module is the single seam
// that the UI talks to for anything that will later become a real backend call.
//
// Today every "live" function is a no-op stub and `getLiveServices()` returns
// null, so the UI stays in demo mode and reads seed data directly. When we do
// "the swap" (wire Replit Postgres + Drizzle + Auth.js), only this file changes:
// `getLiveServices()` starts returning a real session and the stubs below get
// real implementations. The UI keeps importing from `@/lib/data` unchanged.

import type {
  CommunityPost,
  Member,
  PostAttachment,
  Referral,
  ReferralKind,
  Rsvp,
  RsvpStatus,
  SbraEvent,
  SupportRequest,
  UserRole
} from "@/lib/types";

export type LiveUserProfile = Member & {
  uid: string;
  role: UserRole;
};

export type LiveServices = { auth: unknown; db: unknown; storage: unknown };
export type CredentialLike = { user: unknown };
export type DataError = { message: string };

// Returns a live session/services handle, or null when running on seed data.
// Null today → the UI runs in demo mode against seed data.
export function getLiveServices(): LiveServices | null {
  return null;
}

export async function signInForRole(_role: UserRole): Promise<CredentialLike | null> {
  return null;
}

export async function signInWithEmailPassword(
  _email: string,
  _password: string
): Promise<CredentialLike | null> {
  return null;
}

export async function loadOrCreateUserProfile(
  _user: unknown,
  _selectedRole: UserRole
): Promise<LiveUserProfile | null> {
  return null;
}

export async function saveUserProfile(_profile: Member): Promise<void> {
  // no-op in seed mode
}

export function watchPosts(
  _onPosts: (posts: CommunityPost[]) => void,
  _onError: (error: DataError) => void
): () => void {
  return () => {};
}

export function watchSupportRequests(
  _onRequests: (requests: SupportRequest[]) => void,
  _onError: (error: DataError) => void
): () => void {
  return () => {};
}

export async function createLivePost(_input: {
  body: string;
  files?: File[];
  profile: LiveUserProfile;
}): Promise<CommunityPost | null> {
  return null;
}

export async function createLiveSupportRequest(_input: {
  category: string;
  detail: string;
  profile: LiveUserProfile;
}): Promise<SupportRequest | null> {
  return null;
}

export function watchReferrals(
  _onReferrals: (referrals: Referral[]) => void,
  _onError: (error: DataError) => void
): () => void {
  return () => {};
}

export async function createLiveReferral(_input: {
  kind: ReferralKind;
  giverId: string;
  receiverId: string;
  introducedMemberId?: string;
  prospectName?: string;
  prospectContact?: string;
  need: string;
}): Promise<Referral | null> {
  return null;
}

export async function updateLiveReferral(
  _id: string,
  _changes: Partial<Referral>
): Promise<Referral | null> {
  return null;
}

export function watchEvents(
  _onEvents: (events: SbraEvent[]) => void,
  _onError: (error: DataError) => void
): () => void {
  return () => {};
}

export async function createLiveEvent(_input: Omit<SbraEvent, "id">): Promise<SbraEvent | null> {
  return null;
}

export async function setLiveRsvp(
  _eventId: string,
  _memberId: string,
  _status: RsvpStatus
): Promise<Rsvp | null> {
  return null;
}

export async function setLiveCheckIn(
  _eventId: string,
  _memberId: string,
  _checkedIn: boolean
): Promise<Rsvp | null> {
  return null;
}

// Retained for parity with the previous Firebase surface; unused in seed mode.
export type PostAttachmentDraft = PostAttachment & { file?: File };
