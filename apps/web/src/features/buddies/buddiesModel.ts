// Pure model + helpers for US-011 (travel buddies discovery).

export type BuddyKind = 'FULL_TRIP' | 'MEETUP';
export type BuddyCategory = 'GENERAL' | 'YOUTH' | 'WOMEN' | 'FAMILIES';
export type BuddyBudget = 'LOW' | 'MEDIUM' | 'HIGH';
export type BuddyStatus = 'OPEN' | 'FULL' | 'CLOSED';

export const KINDS: BuddyKind[] = ['FULL_TRIP', 'MEETUP'];
export const CATEGORIES: BuddyCategory[] = ['GENERAL', 'YOUTH', 'WOMEN', 'FAMILIES'];
export const BUDGETS: BuddyBudget[] = ['LOW', 'MEDIUM', 'HIGH'];

export interface BuddyRequest {
  id: string;
  kind: BuddyKind;
  title: string;
  city: string;
  dateFrom: string;
  dateTo: string;
  category: BuddyCategory;
  budget: BuddyBudget;
  capacity: number;
  participantUids: string[];
  ownerUid: string;
  closed: boolean;
  description: string;
}

export interface BuddyFilter {
  kind: BuddyKind;
  city: string;
  category: BuddyCategory | 'ALL';
  budget: BuddyBudget | 'ALL';
}

export function spotsLeft(r: BuddyRequest): number {
  return Math.max(0, r.capacity - r.participantUids.length);
}

export function statusOf(r: BuddyRequest): BuddyStatus {
  if (r.closed) return 'CLOSED';
  return spotsLeft(r) <= 0 ? 'FULL' : 'OPEN';
}

/** Only the request creator may edit/close/delete it (BR-011-001). */
export function canManage(r: BuddyRequest, uid: string): boolean {
  return r.ownerUid === uid;
}

export function isParticipant(r: BuddyRequest, uid: string): boolean {
  return r.participantUids.includes(uid);
}

/** Combine mode + city + category + budget facets (FR-011-003, AC1). */
export function applyFilters(list: BuddyRequest[], f: BuddyFilter): BuddyRequest[] {
  const city = f.city.trim().toLowerCase();
  return list.filter((r) =>
    r.kind === f.kind &&
    (!city || r.city.toLowerCase().includes(city)) &&
    (f.category === 'ALL' || r.category === f.category) &&
    (f.budget === 'ALL' || r.budget === f.budget),
  );
}
