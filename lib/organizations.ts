import { communityCatalog, getCommunity } from "./network/catalog";

export type CommunityOrganization = {
  id: string; name: string; shortName: string; description: string;
  status: "active" | "coming_soon"; isFoundingPartner?: boolean; logo?: string;
};

// Compatibility projection for the prototype's organizational community switcher.
export const communityOrganizations: CommunityOrganization[] = communityCatalog
  .filter(c => c.kind === "organizational")
  .map(c => ({ ...c, status: c.status === "active" ? "active" : "coming_soon", isFoundingPartner: c.id === "sbra" }));

export function getCommunityOrganization(id: string): CommunityOrganization {
  getCommunity(id);
  const community = communityOrganizations.find(c => c.id === id);
  if (!community) throw new Error("Community is not available in this workspace");
  return community;
}
