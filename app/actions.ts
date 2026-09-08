"use server";

import type { Business, Comment, CommunityPost, Member, Referral, RsvpStatus, SbraEvent } from "@/lib/types";

// Compatibility exports for the seed-only prototype. Legacy records have no
// trustworthy ownership scope. Never expose their old persistence paths.
function unavailable(): never {
  throw new Error("This legacy operation is unavailable. Use the Collab workspace.");
}
export async function bootstrap(): Promise<never> { return unavailable(); }
export async function persistPost(_post: CommunityPost): Promise<void> { unavailable(); }
export async function persistComment(_comment: Comment): Promise<void> { unavailable(); }
export async function toggleReaction(_postId: string, _memberId: string): Promise<void> { unavailable(); }
export async function insertReferral(_referral: Referral): Promise<void> { unavailable(); }
export async function updateReferral(_id: string, _changes: Partial<Referral>): Promise<void> { unavailable(); }
export async function setRsvp(_eventId: string, _memberId: string, _status: RsvpStatus): Promise<void> { unavailable(); }
export async function setCheckIn(_eventId: string, _memberId: string, _checkedIn: boolean): Promise<void> { unavailable(); }
export async function persistEvent(_event: SbraEvent): Promise<void> { unavailable(); }
export async function persistMember(_member: Member): Promise<void> { unavailable(); }
export async function insertMember(_member: Member): Promise<void> { unavailable(); }
export async function insertBusinessWithOwner(_business: Business, _member: Member): Promise<void> { unavailable(); }
export async function persistImportedMembers(_rows: { business: Business; member: Member }[]): Promise<void> { unavailable(); }
