export const memberNavigation = [
  { key: "community", label: "Home" },
  { key: "directory", label: "Directory" },
  { key: "opportunities", label: "Opportunities" },
  { key: "events", label: "Events" },
  { key: "referrals", label: "Connections" },
] as const;

export type WorkspaceView = typeof memberNavigation[number]["key"] | "profile" | "admin" | "tools" | "explore";

export function readWorkspaceLocation(hash: string): { view: WorkspaceView; communityId: string } {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const candidate = params.get("view");
  const views: WorkspaceView[] = [...memberNavigation.map(item => item.key), "profile", "admin", "tools", "explore"];
  return { view: views.find(view => view === candidate) ?? "community", communityId: params.get("community") ?? "" };
}

export function workspaceHash(view: WorkspaceView, communityId: string) {
  return `#${new URLSearchParams({ view, community: communityId })}`;
}
