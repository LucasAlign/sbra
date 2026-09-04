import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const DIRECTORY_URL = "https://www.sbrassociation.com/directory/pa/berks-county";
const OUTPUT = resolve("lib/sbra-directory.generated.ts");

const legacyBusinessIds = {
  "Power Marketing International": "keystone-web",
  "Studio 413 Photo": "berks-apparel",
  "B2 Bistro": "sweet-laurel",
  "Security Service Company": "greenedge-lawn",
  "Kinya Ramen": "polished-nails",
  "Diamond Credit Union": "vantage-insurance",
  "A Mazzo Accounting": "cornerstone-books",
  "Reading Dermatology Associates": "reading-dermatology",
  "Precision Hearing Aid Center": "precision-hearing"
};

const legacyMemberIds = {
  "Alan Robezzoli": "maya-chen",
  "Yvans Pochron": "devin-brooks",
  "Don Carrick": "ari-rivera",
  "Tony Mazzo": "jada-lee",
  "Jim Long": "noah-patel",
  "Yomaira Polanco": "marisol-ortiz",
  "Jevan Chen": "sofia-martinez",
  "Yamile Zabala": "grace-whitfield",
  "Adam Wentling": "tom-alvarez"
};

function slug(value) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "member";
}

function cleanEmail(value = "") {
  return value.replace(/<mailto:[^>]+>/gi, "").trim();
}

function normalizeWebsite(value = "") {
  if (!value) return "";
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

function websiteIcon(website) {
  if (!website) return "/sbra-mark.png";
  try {
    const domain = new URL(website).hostname;
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=256`;
  } catch {
    return "/sbra-mark.png";
  }
}

function usableImage(value = "") {
  if (!/^https?:\/\//i.test(value) || !/\.(?:avif|gif|jpe?g|png|svg|webp)(?:\?|$)/i.test(value)) return "";
  try {
    const url = new URL(value);
    const expires = Number(url.searchParams.get("Expires"));
    if (expires && expires * 1000 < Date.now()) return "";
    return value;
  } catch {
    return "";
  }
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: { "user-agent": "Berks County Collab directory sync" }
  });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.text();
}

async function mapConcurrent(values, concurrency, mapper) {
  const results = new Array(values.length);
  let cursor = 0;
  async function worker() {
    while (cursor < values.length) {
      const index = cursor++;
      results[index] = await mapper(values[index], index);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return results;
}

const directoryHtml = await fetchText(DIRECTORY_URL);
const paths = Array.from(
  new Set(
    Array.from(directoryHtml.matchAll(/href=(["'])(.*?)\1/gi), (match) => match[2]).filter((href) =>
      href.includes("member-details/")
    )
  )
);

const records = await mapConcurrent(paths, 8, async (path) => {
  const memberName = path.slice(path.lastIndexOf("/") + 1);
  const url = `${DIRECTORY_URL}/member-details/${encodeURIComponent(memberName)}`;
  const html = await fetchText(url);
  const match = html.match(/base64JsonRowData:\s*'([^']+)'/i);
  if (!match) throw new Error(`No member record found at ${url}`);
  return JSON.parse(Buffer.from(match[1], "base64").toString("utf8"));
});

const businesses = records
  .map((record) => {
    const name = String(record.Member || "").trim();
    const category = String(record["Business Type"] || "Professional Services").trim();
    const website = normalizeWebsite(String(record.Website || "").trim());
    return {
      id: legacyBusinessIds[name] || slug(name),
      name,
      category,
      description: String(record["What We Do"] || `${name} is an SBRA member serving the Berks County business community.`).trim(),
      servicesOffered: category,
      referralsWanted: "Open to relevant community introductions.",
      website,
      address: "",
      city: "Berks County, PA",
      tier: "small",
      logo: usableImage(String(record.Logo || "").trim()) || websiteIcon(website),
      memberOffer: String(record["Member Offer"] || "").trim()
    };
  })
  .sort((a, b) => a.name.localeCompare(b.name));

const members = records
  .map((record) => {
    const businessName = String(record.Member || "").trim();
    const name = String(record["Contact Name"] || businessName).trim();
    return {
      id: legacyMemberIds[name] || slug(`${name}-${businessName}`),
      businessId: legacyBusinessIds[businessName] || slug(businessName),
      name,
      title: "SBRA Member",
      email: cleanEmail(String(record.Email || "")),
      phone: String(record.Phone || "").trim(),
      bio: String(record["What We Do"] || "").trim(),
      isOwner: false,
      photo: usableImage(String(record.Photo || "").trim())
    };
  })
  .sort((a, b) => a.name.localeCompare(b.name));

const source = `// Generated from ${DIRECTORY_URL}\n// Run: node scripts/sync-sbra-directory.mjs\n\nimport type { Business, Member } from "@/lib/types";\n\nexport const sbraBusinessSeed = ${JSON.stringify(businesses, null, 2)} satisfies Business[];\n\nexport const sbraMemberSeed = ${JSON.stringify(members, null, 2)} satisfies Member[];\n`;

await writeFile(OUTPUT, source, "utf8");
console.log(`Wrote ${businesses.length} businesses and ${members.length} members to ${OUTPUT}.`);
