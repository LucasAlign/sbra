import type { Member, UserRole, ViewKey } from "@/lib/types";

export type DisplayPreferences = {
  communityDigest: boolean;
  referralAlerts: boolean;
  compactDirectoryCards: boolean;
};

export const defaultDisplayPreferences: DisplayPreferences = {
  communityDigest: true,
  referralAlerts: true,
  compactDirectoryCards: false
};

export function matchesSearch(haystack: string, rawQuery: string): boolean {
  const tokens = rawQuery.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  const normalizedHaystack = haystack.toLocaleLowerCase();
  const words = normalizedHaystack.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const serviceStem = (word: string) => word.replace(/(?:ing|ers?)$/, "");
  return tokens.every((token) =>
    normalizedHaystack.includes(token) || words.some((word) => serviceStem(word) === serviceStem(token))
  );
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function eligibleReferralMembers(members: Member[], currentMemberId: string): Member[] {
  return members.filter((member) => member.id !== currentMemberId && !member.pending);
}

export function supportAlertDestination(role: UserRole): { view: ViewKey; adminTab?: "support" } {
  return role === "admin" ? { view: "admin", adminTab: "support" } : { view: "support" };
}
