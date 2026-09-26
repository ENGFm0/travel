// Pure model + helpers for US-011 (travel buddies discovery).

export type BuddyKind = 'FULL_TRIP' | 'MEETUP';
export type BuddyCategory = 'GENERAL' | 'YOUTH' | 'WOMEN' | 'FAMILIES';
export type BuddyStatus = 'OPEN' | 'FULL' | 'CLOSED';

export const KINDS: BuddyKind[] = ['FULL_TRIP', 'MEETUP'];
export const CATEGORIES: BuddyCategory[] = ['GENERAL', 'YOUTH', 'WOMEN', 'FAMILIES'];

export interface BuddyRequest {
  id: string;
  kind: BuddyKind;
  title: string;
  country?: string;         // destination country
  city: string;             // primary city (used for search/filter)
  cities?: string[];        // extra cities for a multi-city trip
  dateFrom: string;
  dateTo: string;
  category: BuddyCategory;
  perPerson?: number;       // real budget per person (replaces LOW/MED/HIGH)
  currency?: string;        // currency of perPerson (home, or destination)
  destCurrency?: string;    // second currency for international trips
  includes?: string;        // what the budget covers
  hotel?: string;           // hotel(s) + details
  activityType?: string;    // for a meetup / activity
  activityLocation?: string;
  meetingPoint?: string;    // where the group gathers
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

/** Combine mode + city/country + category facets. City search also matches the
 *  country and any extra cities of a multi-city trip. */
export function applyFilters(list: BuddyRequest[], f: BuddyFilter): BuddyRequest[] {
  const q = f.city.trim().toLowerCase();
  const matchesPlace = (r: BuddyRequest) =>
    !q ||
    r.city.toLowerCase().includes(q) ||
    (r.country ?? '').toLowerCase().includes(q) ||
    (r.cities ?? []).some((c) => c.toLowerCase().includes(q));
  return list.filter((r) =>
    r.kind === f.kind &&
    matchesPlace(r) &&
    (f.category === 'ALL' || r.category === f.category),
  );
}
