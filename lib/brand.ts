// Language controls copy, never capabilities. Limited demo experiences must
// opt in explicitly, independently of the community's locale.

export type BrandProfile = { locale: string; spanish: boolean; directoryOnly: boolean };

export function brandFor(locale: string | null | undefined, options: { directoryOnly?: boolean } = {}): BrandProfile {
  const resolved = locale || "en";
  const spanish = resolved === "es";
  return { locale: resolved, spanish, directoryOnly: options.directoryOnly ?? false };
}
