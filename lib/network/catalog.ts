import type { communities, networks, regions, organizations } from "../db/network-schema";

type Community = typeof communities.$inferInsert;
export const networkCatalog = [{ id: "collab", slug: "collab", name: "Collab" }] satisfies (typeof networks.$inferInsert)[];
export const regionCatalog = [{ id: "berks", networkId: "collab", slug: "berks-county", name: "Berks County" }] satisfies (typeof regions.$inferInsert)[];
export const operatorCatalog = [
  { id: "collab-operator", name: "Collab", kind: "other" },
  { id: "sbra-operator", name: "Small Business Resource Association", kind: "association" },
  { id: "latino-chamber-operator", name: "Berks County Latino Chamber of Commerce", kind: "chamber" },
] satisfies (typeof organizations.$inferInsert)[];
export const communityCatalog = [
  { id: "berks-community", networkId: "collab", operatorId: "collab-operator", slug: "berks-county", name: "Berks County Collab", shortName: "Berks", description: "Local business communities, connected.", kind: "geographic", status: "active", locale: "en" },
  { id: "sbra", networkId: "collab", operatorId: "sbra-operator", slug: "sbra", name: "Small Business Resource Association", shortName: "SBRA", description: "Be Better. Grow Faster.", kind: "organizational", status: "active", locale: "en" },
  { id: "berks-latino-chamber", networkId: "collab", operatorId: "latino-chamber-operator", slug: "berks-latino-chamber", name: "Berks County Latino Chamber of Commerce", shortName: "Cámara Latina", description: "Impulsando el éxito de los negocios latinos.", kind: "organizational", status: "active", locale: "es", logo: "https://res.cloudinary.com/joinit/image/upload/v1740507882/xysfksr9ui5axgnolixx.jpg" },
] satisfies Community[];
export const communityRegionCatalog = communityCatalog.map(c => ({ communityId: c.id, networkId: c.networkId, regionId: "berks" }));

export function getCommunity(id: string) {
  const community = communityCatalog.find(c => c.id === id);
  if (!community) throw new Error("Unknown community");
  return community;
}
