import type { Business, Member } from "@/lib/types";

type ImportedRow = Record<string, string | number | boolean | null | undefined>;

const normalize = (value: unknown) => String(value ?? "").trim();

const slugify = (value: string, fallback: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || fallback;

export type ImportedMember = { business: Business; member: Member };

// Maps a roster row into a Business + its owner Member.
export function rowToMember(row: ImportedRow, index: number): ImportedMember {
  const name = normalize(row.name) || normalize(row.fullName) || "Imported Member";
  const businessName = normalize(row.business) || normalize(row.company) || `${name}'s Business`;
  const suffix = `${Date.now()}-${index}`;
  const businessId = `imported-biz-${slugify(businessName, suffix)}-${index}`;

  const business: Business = {
    id: businessId,
    name: businessName,
    category: normalize(row.category) || normalize(row.industry) || "Uncategorized",
    description: normalize(row.description) || normalize(row.notes),
    servicesOffered: normalize(row.services) || normalize(row.servicesOffered),
    referralsWanted: normalize(row.referralsWanted) || normalize(row.idealReferral),
    website: normalize(row.website),
    address: normalize(row.address),
    city: normalize(row.city) || normalize(row.location),
    tier: "solo"
  };

  const member: Member = {
    id: `imported-${suffix}`,
    businessId,
    name,
    title: normalize(row.title) || "Owner",
    email: normalize(row.email),
    phone: normalize(row.phone),
    bio: normalize(row.bio) || normalize(row.notes),
    isOwner: true
  };

  return { business, member };
}

export async function parseRosterFile(file: File): Promise<ImportedMember[]> {
  const extension = file.name.split(".").pop()?.toLowerCase();

  if (extension === "csv") {
    return parseCsv(await file.text()).map(rowToMember);
  }

  if (extension === "xlsx" || extension === "xls") {
    throw new Error("Excel files are accepted by the UI, but a backend parser is needed before saving them.");
  }

  throw new Error("Please upload a CSV, XLS, or XLSX roster file.");
}

function parseCsv(text: string): ImportedRow[] {
  const rows = text
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map(parseCsvLine);

  const headers = rows.shift()?.map((header) => header.trim()) ?? [];
  if (headers.length === 0) return [];

  return rows.map((row) =>
    headers.reduce<ImportedRow>((record, header, index) => {
      record[header] = row[index] ?? "";
      return record;
    }, {})
  );
}

function parseCsvLine(line: string) {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  cells.push(current.trim());
  return cells;
}
