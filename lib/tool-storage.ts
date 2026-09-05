// Persistence seam for the member Business Tools.
//
// Like `lib/data.ts`, this is the single place the Tools UI talks to for saving
// and loading its data. Today (seed-first, decision #6) everything lives in the
// browser's `localStorage`, private to each viewer's device. When we do "the
// swap" (Replit Postgres + Drizzle + Auth.js), only THIS file changes: point
// `loadTool` / `saveTool` at a per-user table keyed by `TOOL_KEYS` and the tools
// keep importing from `@/lib/tool-storage` unchanged.
//
// Reads are synchronous because the tools hydrate their React state from them in
// `useState` initializers. When wiring a real backend, keep reads synchronous by
// hydrating a client-side cache once at sign-in (recommended), or migrate the
// tools to async loaders — either way the change stays contained to this file
// plus its hydration entry point.

// The canonical list of every key the Tools own. Centralized so a future
// migration/export can enumerate them and so keys can't drift across tools.
export const TOOL_KEYS = {
  pricing: "sbra.tool.pricing",
  loan: "sbra.tool.loan",
  scorecard: "sbra.tool.scorecard",
  scorecardHistory: "sbra.tool.scorecard.history",
  goals: "sbra.tool.goals",
  invoice: "sbra.tool.invoice",
  marketing: "sbra.tool.marketing",
  crm: "sbra.tool.crm",
  tax: "sbra.tool.tax",
  grants: "sbra.tool.grants",
  docs: "sbra.tool.docs"
} as const;

export type ToolKey = (typeof TOOL_KEYS)[keyof typeof TOOL_KEYS];

// Read a tool's saved value, or `fallback` when nothing is stored. Guarded:
// storage can be unavailable (SSR, private mode) or throw, and stored JSON can
// be corrupt — in every failure case we return the fallback so the tool loads.
export function loadTool<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

// Persist a tool's value. Guarded so a full/blocked store never breaks the tool
// (it just stops persisting for the session).
export function saveTool<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage full or blocked — the tool still works in-session
  }
}

// Snapshot every tool's stored data (used for a future backend migration or a
// "download my data" affordance). Keys with nothing stored are omitted.
export function exportAllToolData(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.values(TOOL_KEYS)) {
    const value = loadTool<unknown>(key, undefined);
    if (value !== undefined) out[key] = value;
  }
  return out;
}

// Download every tool's stored data as a JSON file. Returns false if there was
// nothing to export (so the caller can tell the member) or if the download is
// blocked. Wrapped in a versioned envelope so a future importer can validate it.
export function downloadToolData(filename = "sbra-tools-data.json"): boolean {
  if (typeof window === "undefined") return false;
  const data = exportAllToolData();
  if (Object.keys(data).length === 0) return false;
  try {
    const payload = { app: "sbra-tools", version: 1, exportedAt: new Date().toISOString(), data };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    return true;
  } catch {
    return false;
  }
}

const KNOWN_KEYS: string[] = Object.values(TOOL_KEYS);

// Restore tool data from a payload produced by downloadToolData / exportAllToolData.
// Accepts either the versioned envelope ({ app, version, data }) or a bare
// key→value map. Only writes keys the tools actually own (KNOWN_KEYS), so a
// hand-edited or foreign file can't inject arbitrary localStorage entries.
// Overwrites existing values for the keys present; keys not in the file are left
// untouched. Returns how many tools were restored plus a message for the member.
export function importToolData(payload: unknown): { ok: boolean; imported: number; message: string } {
  if (typeof payload !== "object" || payload === null) {
    return { ok: false, imported: 0, message: "That file isn't a valid SBRA tools export." };
  }
  const envelope = payload as { app?: string; version?: number; data?: unknown };
  const data = (envelope.data && typeof envelope.data === "object" ? envelope.data : envelope) as Record<string, unknown>;
  if (typeof envelope.version === "number" && envelope.version > 1) {
    return { ok: false, imported: 0, message: "This file is from a newer version of the tools and can't be imported here." };
  }
  let imported = 0;
  for (const key of KNOWN_KEYS) {
    if (key in data && data[key] !== undefined) {
      saveTool(key, data[key]);
      imported += 1;
    }
  }
  if (imported === 0) return { ok: false, imported: 0, message: "No SBRA tool data was found in that file." };
  return { ok: true, imported, message: `Imported ${imported} ${imported === 1 ? "tool's" : "tools'"} data. Reopen a tool to see it.` };
}

// Wipe every tool's stored data on this device (e.g. a "reset my tools" action).
export function clearAllToolData(): void {
  if (typeof window === "undefined") return;
  for (const key of Object.values(TOOL_KEYS)) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // ignore — best effort
    }
  }
}
