import { loadJSON, persistAfter } from '@/shared/persist';
import { createApiClient } from '@boardingpass/core';
import {
  spotsLeft, statusOf, type BuddyCategory, type BuddyKind, type BuddyRequest,
} from './buddiesModel';

export interface CreateBuddyPayload {
  kind: BuddyKind;
  title: string;
  country?: string;
  city: string;
  cities?: string[];
  dateFrom: string;
  dateTo: string;
  category: BuddyCategory;
  perPerson?: number;
  currency?: string;
  destCurrency?: string;
  includes?: string;
  hotel?: string;
  activityType?: string;
  activityLocation?: string;
  meetingPoint?: string;
  capacity: number;
  description: string;
}

export type BuddiesErrorCode = 'FULL' | 'CLOSED' | 'NOT_OWNER' | 'NOT_FOUND' | 'GENERIC';
export class BuddiesError extends Error {
  code: BuddiesErrorCode;
  constructor(code: BuddiesErrorCode) { super(code); this.code = code; }
}

export interface BuddiesService {
  list(): Promise<BuddyRequest[]>;
  create(payload: CreateBuddyPayload, ownerUid: string): Promise<BuddyRequest[]>;
  join(id: string, uid: string): Promise<BuddyRequest[]>;
  leave(id: string, uid: string): Promise<BuddyRequest[]>;
  close(id: string, uid: string): Promise<BuddyRequest[]>;
  flag(id: string): Promise<void>;
}

const uid = (p: string) => `${p}-${crypto.randomUUID()}`;
export const CURRENT_UID = 'me';

/** In-memory buddies service for dev/tests. Capacity is enforced atomically here
 *  to mirror the server's race-safe join (BR-011-002). NOT a security boundary. */
export function createMockBuddiesService(seed?: BuddyRequest[], persistKey?: string): BuddiesService {
  const src = persistKey ? loadJSON<BuddyRequest[]>(persistKey, seed ?? []) : (seed ?? []);
  const reqs: BuddyRequest[] = src.map((r) => ({ ...r, participantUids: [...r.participantUids] }));
  const tick = () => new Promise<void>((r) => setTimeout(r, 0));
  const snap = () => reqs.map((r) => ({ ...r, participantUids: [...r.participantUids] }));
  const find = (id: string) => reqs.find((r) => r.id === id);

  const base: BuddiesService = {
    async list() { await tick(); return snap(); },
    async create(p, ownerUid) {
      await tick();
      reqs.unshift({
        id: uid('b'), kind: p.kind, title: p.title.trim(),
        country: p.country?.trim() || undefined, city: p.city.trim(),
        cities: p.cities?.map((c) => c.trim()).filter(Boolean),
        dateFrom: p.dateFrom, dateTo: p.dateTo, category: p.category,
        perPerson: p.perPerson, currency: p.currency, destCurrency: p.destCurrency,
        includes: p.includes?.trim() || undefined, hotel: p.hotel?.trim() || undefined,
        activityType: p.activityType?.trim() || undefined, activityLocation: p.activityLocation?.trim() || undefined,
        meetingPoint: p.meetingPoint?.trim() || undefined,
        capacity: Math.max(1, p.capacity), participantUids: [ownerUid], ownerUid, closed: false,
        description: p.description.trim(),
      });
      return snap();
    },
    async join(id, u) {
      await tick();
      const r = find(id); if (!r) throw new BuddiesError('NOT_FOUND');
      if (r.closed) throw new BuddiesError('CLOSED');
      if (!r.participantUids.includes(u)) {
        if (spotsLeft(r) <= 0) throw new BuddiesError('FULL'); // atomic capacity check
        r.participantUids.push(u);
      }
      return snap();
    },
    async leave(id, u) {
      await tick();
      const r = find(id); if (!r) throw new BuddiesError('NOT_FOUND');
      r.participantUids = r.participantUids.filter((x) => x !== u);
      return snap();
    },
    async close(id, u) {
      await tick();
      const r = find(id); if (!r) throw new BuddiesError('NOT_FOUND');
      if (r.ownerUid !== u) throw new BuddiesError('NOT_OWNER');
      r.closed = true;
      return snap();
    },
    async flag(id) {
      await tick();
      if (!find(id)) throw new BuddiesError('NOT_FOUND');
      // Enters moderation (US-016) server-side.
    },
  };
  return persistAfter(base, persistKey, snap);
}

export function createApiBuddiesService(getToken?: () => string | undefined): BuddiesService {
  const base = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api/v1';
  const client = createApiClient({ baseUrl: base, getToken });
  const list = () => client.apiFetch<BuddyRequest[]>('/buddies');
  return {
    list,
    create: (p) => client.apiFetch<BuddyRequest[]>('/buddies', { method: 'POST', body: JSON.stringify(p) }),
    join: (id) => client.apiFetch<BuddyRequest[]>(`/buddies/${id}/join`, { method: 'POST' }),
    leave: (id) => client.apiFetch<BuddyRequest[]>(`/buddies/${id}/leave`, { method: 'POST' }),
    close: (id) => client.apiFetch<BuddyRequest[]>(`/buddies/${id}`, { method: 'PATCH', body: JSON.stringify({ closed: true }) }),
    flag: async (id) => { await client.apiFetch<void>(`/buddies/${id}/flag`, { method: 'POST' }); },
  };
}

export function createBuddiesService(): BuddiesService {
  // Real listings only — created by users; no demo/seed data. (v2 key drops any
  // previously persisted demo entries.)
  return import.meta.env.VITE_API_BASE_URL ? createApiBuddiesService() : createMockBuddiesService([], 'bp.buddies.v2');
}

export { spotsLeft, statusOf };
