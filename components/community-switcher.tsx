"use client";

export function CommunitySwitcher({ communities, value, onChange, visitingCommunity }: {
  communities: { id: string; shortName: string }[];
  value: string;
  onChange: (id: string) => void;
  visitingCommunity?: { id: string; shortName: string };
}) {
  return <label className="organization-switcher"><span>You’re viewing</span>
    <select aria-label="You're viewing" value={value} onChange={event => onChange(event.target.value)}>
      {!value && <option value="" disabled>Choose a community</option>}
      <optgroup label="Your communities">{communities.map(community => <option key={community.id} value={community.id}>{community.shortName}</option>)}</optgroup>
      {visitingCommunity && <optgroup label="Visiting · membership required"><option value={visitingCommunity.id}>{visitingCommunity.shortName}</option></optgroup>}
      <optgroup label="Discover"><option value="network">Explore the network</option></optgroup>
    </select>
  </label>;
}
