/** Server callers must load these facts from trusted storage, never request bodies. */
export type Grant = {
  personId: string;
  role: "platform_admin" | "regional_admin" | "community_admin" | "business_admin";
  regionId?: string | null; communityId?: string | null; organizationId?: string | null;
  expiresAt?: Date | null; revokedAt?: Date | null;
};
export type AccessFacts = {
  personId: string | null;
  grants: readonly Grant[];
  memberships: readonly { personId: string; communityId: string; status: string }[];
  affiliations: readonly { personId: string; organizationId: string; status: string }[];
};
export type AccessRequest =
  | { action: "public.read" }
  | { action: "platform.manage" }
  | { action: "region.manage"; regionId: string }
  | { action: "community.read" | "community.manage"; communityId: string; status: string }
  | { action: "organization.manage"; organizationId: string }
  | { action: "relationship.read"; participantIds: readonly string[] };

export function canAccess(facts: AccessFacts, request: AccessRequest, now = new Date()): boolean {
  if (request.action === "public.read") return true;
  const personId = facts.personId;
  if (!personId) return false;
  const grants = facts.grants.filter(g => g.personId === personId && !g.revokedAt &&
    (!g.expiresAt || g.expiresAt.getTime() > now.getTime()));
  switch (request.action) {
    case "platform.manage": return grants.some(g => g.role === "platform_admin");
    case "region.manage": return grants.some(g => g.role === "regional_admin" && g.regionId === request.regionId);
    case "community.read":
    case "community.manage": {
      if (request.status !== "active") return false;
      const membership = facts.memberships.find(m => m.personId === personId && m.communityId === request.communityId);
      if (membership?.status !== "active") return false;
      return request.action === "community.read" || grants.some(g => g.role === "community_admin" && g.communityId === request.communityId);
    }
    case "organization.manage": return facts.affiliations.some(a => a.personId === personId &&
      a.organizationId === request.organizationId && a.status === "active") &&
      grants.some(g => g.role === "business_admin" && g.organizationId === request.organizationId);
    case "relationship.read": return request.participantIds.includes(personId);
  }
}
