// Pure model + helpers for US-008 (tasks & packing). Kept framework-free so the
// template-dedupe and progress logic can be unit-tested directly.

export interface Task {
  id: string;
  title: string;
  assigneeUid: string | null;
  done: boolean;
}

export type PackCategory = 'CLOTHES' | 'ELECTRONICS' | 'MEDS' | 'DOCS';
export const PACK_CATEGORIES: PackCategory[] = ['CLOTHES', 'ELECTRONICS', 'MEDS', 'DOCS'];

export interface PackItem {
  id: string;
  label: string;
  category: PackCategory;
  checked: boolean;
}

export type BookingGroup = 'BOOKINGS' | 'DOCUMENTS' | 'MONEY';
export const BOOKING_GROUPS: BookingGroup[] = ['BOOKINGS', 'DOCUMENTS', 'MONEY'];

export interface BookingItem {
  id: string; // stable key, e.g. 'flight'
  group: BookingGroup;
  done: boolean;
}

export interface TasksBoard {
  tasks: Task[];
  packing: PackItem[];
  bookings: BookingItem[];
}

export type TemplateKey = 'essentials' | 'beach' | 'cold';
export const TEMPLATE_KEYS: TemplateKey[] = ['essentials', 'beach', 'cold'];

/** Template catalog by i18n label key + category. Labels are resolved in the UI
 *  (i18n) before hitting the service, so dedupe compares final labels. */
export const TEMPLATES: Record<TemplateKey, { labelKey: string; category: PackCategory }[]> = {
  essentials: [
    { labelKey: 'packing.items.passport', category: 'DOCS' },
    { labelKey: 'packing.items.tickets', category: 'DOCS' },
    { labelKey: 'packing.items.charger', category: 'ELECTRONICS' },
    { labelKey: 'packing.items.meds', category: 'MEDS' },
    { labelKey: 'packing.items.toiletries', category: 'CLOTHES' },
  ],
  beach: [
    { labelKey: 'packing.items.swimwear', category: 'CLOTHES' },
    { labelKey: 'packing.items.sunscreen', category: 'MEDS' },
    { labelKey: 'packing.items.sunglasses', category: 'CLOTHES' },
    { labelKey: 'packing.items.sandals', category: 'CLOTHES' },
  ],
  cold: [
    { labelKey: 'packing.items.jacket', category: 'CLOTHES' },
    { labelKey: 'packing.items.gloves', category: 'CLOTHES' },
    { labelKey: 'packing.items.thermal', category: 'CLOTHES' },
  ],
};

/** Bookings/documents/money preset checklist (FR-008-004). */
export const BOOKING_ITEMS: { id: string; group: BookingGroup }[] = [
  { id: 'flight', group: 'BOOKINGS' },
  { id: 'hotel', group: 'BOOKINGS' },
  { id: 'car', group: 'BOOKINGS' },
  { id: 'passport', group: 'DOCUMENTS' },
  { id: 'visa', group: 'DOCUMENTS' },
  { id: 'insurance', group: 'DOCUMENTS' },
  { id: 'currency', group: 'MONEY' },
  { id: 'sim', group: 'MONEY' },
];

/** Append incoming packing items, skipping any that duplicate an existing
 *  (label, category) pair (BR-008-002). Returns only the NEW items to add. */
export function dedupeAppend(
  existing: Pick<PackItem, 'label' | 'category'>[],
  incoming: { label: string; category: PackCategory }[],
): { label: string; category: PackCategory }[] {
  const seen = new Set(existing.map((e) => `${e.category}::${e.label}`));
  const out: { label: string; category: PackCategory }[] = [];
  for (const i of incoming) {
    const key = `${i.category}::${i.label}`;
    if (!seen.has(key)) { seen.add(key); out.push(i); }
  }
  return out;
}

export function progress(total: number, done: number): number {
  return total > 0 ? Math.round((done / total) * 100) : 0;
}

/** Assignee integrity (BR-008-001): a task assigned to someone no longer in the
 *  active member set reads as unassigned (the record is not deleted). */
export function effectiveAssignee(task: Task, activeUids: string[]): string | null {
  return task.assigneeUid && activeUids.includes(task.assigneeUid) ? task.assigneeUid : null;
}
