export function hasLeadContact(name: string, contact: string): boolean {
  return Boolean(name.trim() && contact.trim());
}

type InvoiceFields = {
  fromName: string; toName: string; number: string; date: string; dueDate: string; taxRate: string;
  items: { desc: string; qty: string; rate: string }[];
};

export function invoiceReadinessError(doc: InvoiceFields): string | null {
  if (!doc.fromName.trim() || !doc.toName.trim() || !doc.number.trim() || !doc.date) return "Add your business, a client, a document number, and a date before marking this document sent or paid.";
  if (doc.dueDate && doc.dueDate < doc.date) return "The due date cannot be before the document date.";
  if (!Number.isFinite(Number(doc.taxRate)) || Number(doc.taxRate) < 0) return "Tax rate must be zero or greater.";
  if (!doc.items.length || doc.items.some((item) => !item.desc.trim() || !Number.isFinite(Number(item.qty)) || Number(item.qty) <= 0 || !item.rate.trim() || !Number.isFinite(Number(item.rate)) || Number(item.rate) < 0)) return "Give every line a description, a quantity greater than zero, and a rate of zero or more.";
  const total = doc.items.reduce((sum, item) => sum + Number(item.qty) * Number(item.rate), 0) * (1 + Number(doc.taxRate) / 100);
  if (!Number.isFinite(total) || total <= 0) return "The document total must be greater than zero before marking it sent or paid.";
  return null;
}
