import { nationwideCommunities } from "./nationwide-demo";
import { communityCatalog } from "./network/catalog";

export type CommunityOrganization = {
  id: string; name: string; shortName: string; description: string; locale: string;
  status: "active" | "coming_soon"; isFoundingPartner?: boolean; logo?: string; directoryOnly: boolean;
};

// Compatibility projection for the prototype's organizational community switcher.
export const communityOrganizations: CommunityOrganization[] = [...communityCatalog
  .filter(c => c.kind === "organizational")
  .map<CommunityOrganization>(c => ({ ...c, locale: c.locale ?? "en", status: c.status === "active" ? "active" : "coming_soon", isFoundingPartner: c.id === "sbra", directoryOnly: c.id === "berks-latino-chamber" })), ...nationwideCommunities];

export function getCommunityOrganization(id: string): CommunityOrganization {
  const community = communityOrganizations.find(c => c.id === id);
  if (!community) throw new Error("Community is not available in this workspace");
  return community;
}
