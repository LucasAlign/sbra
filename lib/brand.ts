// Brand / experience derived from community configuration (M3).
//
// The prototype used to branch on a hardcoded tenant id (`isLatino`). Brand and
// experience are now a function of the community's own config — its locale —
// so a new community gets the right treatment from its record, with no
// per-tenant code. `spanish` drives copy; `directoryOnly` launches non-English
// communities as a curated directory experience (the full toolkit is added as
// each community is ready).

export type BrandProfile = { locale: string; spanish: boolean; directoryOnly: boolean };

export function brandFor(locale: string | null | undefined): BrandProfile {
  const resolved = locale || "en";
  const spanish = resolved === "es";
  return { locale: resolved, spanish, directoryOnly: resolved !== "en" };
}
