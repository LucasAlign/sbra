"use client";
import { useEffect, useState } from "react";
import { loadManagedOrganizations, updateOrganizationProfile, updateCommunityListing, requestBusinessClaim } from "@/app/network-actions";
import { ActionForm } from "./community-tools";
import styles from "./network-workspace.module.css";
export function BusinessProfiles({ communityId, onChanged }: { communityId: string; onChanged?: () => void }) {
  const [organizations, setOrganizations] = useState<Awaited<ReturnType<typeof loadManagedOrganizations>>>();
  const [error, setError] = useState(false);
  useEffect(() => { let active = true; void loadManagedOrganizations().then(data => { if (active) setOrganizations(data); }).catch(() => { if (active) setError(true); }); return () => { active = false; }; }, []);
  return <section className={styles.panel}><h2>Your business profiles</h2>{error && <p role="alert">Unable to load your businesses.</p>}{!organizations && !error && <p>Loading businesses…</p>}
    {organizations?.length === 0 && <p>Claim a business in the directory to request permission to manage it.</p>}
    {organizations?.map(org => <details key={org.id}><summary>{org.name}</summary><ActionForm label="Save business profile" fields={[{ name: "name", label: "Business name", value: org.name, max: 200 }, { name: "description", label: "Description", value: org.description, optional: true }, { name: "website", label: "Website", type: "url", value: org.website, optional: true }, { name: "locations", label: "Locations", value: org.locations, optional: true }, { name: "serviceAreas", label: "Service areas", value: org.serviceAreas, optional: true }]} submit={d => updateOrganizationProfile(org.id, { name: String(d.get("name")), description: String(d.get("description")), website: String(d.get("website")), locations: String(d.get("locations")), serviceAreas: String(d.get("serviceAreas")) })} done={onChanged} />
      <ActionForm label="Save community offer" fields={[{ name: "localOffer", label: "Offer for this community", optional: true }]} submit={d => updateCommunityListing(org.id, communityId, { localOffer: String(d.get("localOffer")) })} done={onChanged} />
    </details>)}
  </section>;
}
export function BusinessClaim({ organizationId, communityId }: { organizationId: string; communityId: string }) {
  return <details><summary>Claim this business</summary><ActionForm label="Request administrator review" fields={[{ name: "evidence", label: "Explain your role and how the administrator can verify it" }]} submit={d => requestBusinessClaim(organizationId, communityId, String(d.get("evidence")))} /></details>;
}
