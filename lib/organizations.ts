export type CommunityOrganization = {
  id: string;
  name: string;
  shortName: string;
  description: string;
  status: "active" | "coming_soon";
  isFoundingPartner?: boolean;
  logo?: string;
};

// Organization catalog for Berks County Collab. Adding a partner starts here;
// member and content scoping can use the same organization id when connected.
export const communityOrganizations: CommunityOrganization[] = [
  {
    id: "sbra",
    name: "Small Business Resource Association",
    shortName: "SBRA",
    description: "Be Better. Grow Faster.",
    status: "active",
    isFoundingPartner: true
  },
  {
    id: "berks-latino-chamber",
    name: "Berks County Latino Chamber of Commerce",
    shortName: "Cámara Latina",
    description: "Impulsando el éxito de los negocios latinos.",
    status: "active",
    logo: "https://res.cloudinary.com/joinit/image/upload/v1740507882/xysfksr9ui5axgnolixx.jpg"
  }
];

export function getCommunityOrganization(id: string) {
  return communityOrganizations.find((organization) => organization.id === id) ?? communityOrganizations[0];
}
