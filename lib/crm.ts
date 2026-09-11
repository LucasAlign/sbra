import type { Referral } from "@/lib/types";

export type CrmContactStage = "new" | "connected" | "nurturing" | "active" | "dormant";
export type CrmActivityType = "note" | "call" | "email" | "meeting" | "referral";
export type CrmOpportunityStage = "new" | "contacted" | "proposal" | "won" | "lost";

export type CrmActivity = {
  id: string;
  type: CrmActivityType;
  date: string;
  text: string;
};

export type CrmContact = {
  id: string;
  name: string;
  company: string;
  title: string;
  email: string;
  phone: string;
  metAt: string;
  tags: string[];
  stage: CrmContactStage;
  priority: boolean;
  note: string;
  activities: CrmActivity[];
  createdAt: number;
};

export type CrmOpportunity = {
  id: string;
  contactId: string;
  title: string;
  stage: CrmOpportunityStage;
  value: number | null;
  expectedClose: string;
  source: "manual" | "referral";
  referralId?: string;
  note: string;
  archivedAt?: string;
  stageHistory: CrmOpportunityStageChange[];
  createdAt: number;
  updatedAt: number;
};

export type CrmOpportunityStageChange = {
  id: string;
  from: CrmOpportunityStage;
  to: CrmOpportunityStage;
  changedAt: string;
};

export type CrmTask = {
  id: string;
  title: string;
  dueDate: string;
  contactId?: string;
  opportunityId?: string;
  completedAt?: string;
  createdAt: number;
};

export type CrmWorkspace = {
  businessId: string;
  contacts: CrmContact[];
  opportunities: CrmOpportunity[];
  tasks: CrmTask[];
};

export type CrmStore = {
  version: 2;
  workspaces: Record<string, CrmWorkspace>;
};

type LegacyContact = Partial<CrmContact> & { done?: boolean; followUp?: string };

export const crmContactStages: { key: CrmContactStage; label: string }[] = [
  { key: "new", label: "New" },
  { key: "connected", label: "Connected" },
  { key: "nurturing", label: "Nurturing" },
  { key: "active", label: "Active" },
  { key: "dormant", label: "Dormant" }
];

export const crmOpportunityStages: { key: CrmOpportunityStage; label: string }[] = [
  { key: "new", label: "New" },
  { key: "contacted", label: "Contacted" },
  { key: "proposal", label: "Proposal" },
  { key: "won", label: "Won" },
  { key: "lost", label: "Lost" }
];

export function crmContactStageLabel(stage: CrmContactStage) {
  return crmContactStages.find(item => item.key === stage)?.label ?? stage;
}

export function crmOpportunityStageLabel(stage: CrmOpportunityStage) {
  return crmOpportunityStages.find(item => item.key === stage)?.label ?? stage;
}

export function createCrmId(prefix: string) {
  const suffix = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  return `${prefix}-${suffix}`;
}

export function normalizeCrmContact(raw: LegacyContact): CrmContact {
  const stage = crmContactStages.some(item => item.key === raw.stage)
    ? raw.stage as CrmContactStage
    : raw.done ? "connected" : "new";
  return {
    id: raw.id ?? createCrmId("contact"),
    name: raw.name ?? "",
    company: raw.company ?? "",
    title: raw.title ?? "",
    email: raw.email ?? "",
    phone: raw.phone ?? "",
    metAt: raw.metAt ?? "",
    tags: Array.isArray(raw.tags) ? raw.tags.filter((tag): tag is string => typeof tag === "string") : [],
    stage,
    priority: Boolean(raw.priority),
    note: raw.note ?? "",
    activities: Array.isArray(raw.activities) ? raw.activities.filter(activity => Boolean(activity?.id)) : [],
    createdAt: typeof raw.createdAt === "number" ? raw.createdAt : Date.now()
  };
}

function emptyWorkspace(businessId: string): CrmWorkspace {
  return { businessId, contacts: [], opportunities: [], tasks: [] };
}

export function normalizeCrmWorkspace(raw: Partial<CrmWorkspace> | undefined, businessId: string): CrmWorkspace {
  return {
    businessId,
    contacts: Array.isArray(raw?.contacts) ? raw.contacts.map(normalizeCrmContact) : [],
    opportunities: Array.isArray(raw?.opportunities) ? raw.opportunities.map(item => ({
      ...item,
      note: typeof item.note === "string" ? item.note : "",
      stageHistory: Array.isArray(item.stageHistory) ? item.stageHistory : []
    })) : [],
    tasks: Array.isArray(raw?.tasks) ? raw.tasks : []
  };
}

// Version 1 stored one bare contact array and allowed only one follow-up date per
// contact. Version 2 keeps one workspace per member business and migrates each
// old follow-up into an open task.
export function normalizeCrmStore(raw: unknown, businessId: string): CrmStore {
  if (Array.isArray(raw)) {
    const legacy = raw as LegacyContact[];
    const contacts = legacy.map(normalizeCrmContact);
    const tasks = legacy.flatMap((contact, index) => contact.followUp ? [{
      id: createCrmId("task"),
      title: `Follow up with ${contacts[index].name || "contact"}`,
      dueDate: contact.followUp,
      contactId: contacts[index].id,
      createdAt: contacts[index].createdAt
    }] : []);
    return { version: 2, workspaces: { [businessId]: { businessId, contacts, opportunities: [], tasks } } };
  }

  if (raw && typeof raw === "object" && "workspaces" in raw) {
    const candidate = raw as { workspaces?: Record<string, Partial<CrmWorkspace>> };
    const workspaces = Object.fromEntries(Object.entries(candidate.workspaces ?? {}).map(([id, workspace]) => [id, normalizeCrmWorkspace(workspace, id)]));
    if (!workspaces[businessId]) workspaces[businessId] = emptyWorkspace(businessId);
    return { version: 2, workspaces };
  }

  return { version: 2, workspaces: { [businessId]: emptyWorkspace(businessId) } };
}

export function crmWorkspace(store: CrmStore, businessId: string): CrmWorkspace {
  return store.workspaces[businessId] ?? emptyWorkspace(businessId);
}

export function updateCrmWorkspace(store: CrmStore, workspace: CrmWorkspace): CrmStore {
  return { ...store, workspaces: { ...store.workspaces, [workspace.businessId]: workspace } };
}

export function crmDaysUntil(date: string, today: string) {
  const milliseconds = new Date(`${date}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime();
  return Math.round(milliseconds / 86_400_000);
}

export function crmDashboard(workspace: CrmWorkspace, today: string) {
  const openTasks = workspace.tasks.filter(task => !task.completedAt);
  return {
    contacts: workspace.contacts.length,
    dueToday: openTasks.filter(task => task.dueDate === today).length,
    overdue: openTasks.filter(task => task.dueDate < today).length,
    openOpportunities: workspace.opportunities.filter(opportunity => !opportunity.archivedAt && opportunity.stage !== "won" && opportunity.stage !== "lost").length,
    wonOpportunities: workspace.opportunities.filter(opportunity => !opportunity.archivedAt && opportunity.stage === "won").length
  };
}

export type CrmCsvPreviewRow = {
  row: number;
  contact: Partial<CrmContact>;
  status: "ready" | "duplicate" | "invalid";
  reason: string;
};

function csvRows(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"' && quoted && text[index + 1] === '"') { cell += '"'; index += 1; }
    else if (character === '"') quoted = !quoted;
    else if (character === "," && !quoted) { row.push(cell); cell = ""; }
    else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell); if (row.some(value => value.trim())) rows.push(row); row = []; cell = "";
    } else cell += character;
  }
  row.push(cell); if (row.some(value => value.trim())) rows.push(row);
  return rows;
}

function normalizedPhone(value: string) { return value.replace(/\D/g, ""); }

export function previewCrmCsv(text: string, existing: CrmContact[]): CrmCsvPreviewRow[] {
  const rows = csvRows(text.replace(/^\uFEFF/, ""));
  if (rows.length < 2) return [];
  const aliases: Record<string, keyof CrmContact> = { name: "name", company: "company", organization: "company", title: "title", email: "email", phone: "phone", tags: "tags", "met at": "metAt", metat: "metAt", note: "note" };
  const headers = rows[0].map(value => aliases[value.trim().toLowerCase()]);
  const knownEmails = new Set(existing.map(item => item.email.trim().toLowerCase()).filter(Boolean));
  const knownPhones = new Set(existing.map(item => normalizedPhone(item.phone)).filter(Boolean));
  return rows.slice(1, 501).map((values, index) => {
    const contact: Partial<CrmContact> = {};
    headers.forEach((header, column) => {
      if (!header) return;
      const value = (values[column] ?? "").trim();
      if (header === "tags") contact.tags = value.split(/[;,]/).map(tag => tag.trim()).filter(Boolean);
      else (contact as Record<string, unknown>)[header] = value;
    });
    const email = contact.email?.trim().toLowerCase() ?? "";
    const phone = normalizedPhone(contact.phone ?? "");
    if (!contact.name?.trim()) return { row: index + 2, contact, status: "invalid" as const, reason: "Name is required" };
    if (email && !/^\S+@\S+\.\S+$/.test(email)) return { row: index + 2, contact, status: "invalid" as const, reason: "Email is not valid" };
    if ((email && knownEmails.has(email)) || (phone && knownPhones.has(phone))) return { row: index + 2, contact, status: "duplicate" as const, reason: email && knownEmails.has(email) ? "Email already exists" : "Phone already exists" };
    if (email) knownEmails.add(email); if (phone) knownPhones.add(phone);
    return { row: index + 2, contact, status: "ready" as const, reason: "Ready to import" };
  });
}

export function validateCrmWorkspace(workspace: CrmWorkspace) {
  if (!workspace.businessId || workspace.businessId.length > 200) throw new Error("Invalid CRM business.");
  if (!Array.isArray(workspace.contacts) || !Array.isArray(workspace.opportunities) || !Array.isArray(workspace.tasks)) throw new Error("Invalid CRM workspace.");
  if (workspace.contacts.length > 10_000 || workspace.opportunities.length > 10_000 || workspace.tasks.length > 20_000) throw new Error("CRM workspace is too large.");
  const strings = (values: unknown[]) => values.every(value => typeof value === "string" && value.length <= 10_000);
  if (!workspace.contacts.every(contact => contact && strings([contact.id, contact.name, contact.company, contact.title, contact.email, contact.phone, contact.metAt, contact.note]) && Array.isArray(contact.tags) && Array.isArray(contact.activities))) throw new Error("Invalid CRM contact.");
  if (!workspace.opportunities.every(opportunity => opportunity && strings([opportunity.id, opportunity.contactId, opportunity.title, opportunity.expectedClose, opportunity.note]) && crmOpportunityStages.some(stage => stage.key === opportunity.stage) && Array.isArray(opportunity.stageHistory))) throw new Error("Invalid CRM opportunity.");
  if (!workspace.tasks.every(task => task && strings([task.id, task.title, task.dueDate]) && (!task.contactId || typeof task.contactId === "string") && (!task.opportunityId || typeof task.opportunityId === "string"))) throw new Error("Invalid CRM task.");
  const payload = JSON.stringify(workspace);
  if (payload.length > 2_000_000) throw new Error("CRM workspace is too large.");
  return payload;
}

export function receivedReferralCandidates(referrals: Referral[], memberId: string, workspace: CrmWorkspace) {
  const converted = new Set(workspace.opportunities.map(opportunity => opportunity.referralId).filter(Boolean));
  return referrals.filter(referral => referral.receiverId === memberId && referral.status === "sent" && !converted.has(referral.id));
}
