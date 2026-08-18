import { createApiClient } from '@boardingpass/core';
import {
  spotsLeft, statusOf, type BuddyBudget, type BuddyCategory, type BuddyKind, type BuddyRequest,
} from './buddiesModel';

export interface CreateBuddyPayload {
  kind: BuddyKind;
  title: string;
  city: string;
  dateFrom: string;
  dateTo: string;
  category: BuddyCategory;
  budget: BuddyBudget;
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
export function createMockBuddiesService(seed?: BuddyRequest[]): BuddiesService {
  const reqs: BuddyRequest[] = seed ? seed.map((r) => ({ ...r, participantUids: [...r.participantUids] })) : [];
  const tick = () => new Promise<void>((r) => setTimeout(r, 0));
  const snap = () => reqs.map((r) => ({ ...r, participantUids: [...r.participantUids] }));
  const find = (id: string) => reqs.find((r) => r.id === id);

  return {
    async list() { await tick(); return snap(); },
    async create(p, ownerUid) {
      await tick();
      reqs.unshift({
        id: uid('b'), kind: p.kind, title: p.title.trim(), city: p.city.trim(),
        dateFrom: p.dateFrom, dateTo: p.dateTo, category: p.category, budget: p.budget,
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

/** Demo buddy requests for dev (mock only). */
export function demoBuddies(): BuddyRequest[] {
  return [
    { id: 'b1', kind: 'FULL_TRIP', title: 'رحلة شمال السعودية', city: 'العلا', dateFrom: '2026-10-01', dateTo: '2026-10-06', category: 'FAMILIES', budget: 'MEDIUM', capacity: 6, participantUids: ['u9', 'u8'], ownerUid: 'u9', closed: false, description: 'رحلة عائلية لاستكشاف العلا.' },
    { id: 'b2', kind: 'MEETUP', title: 'هايكنق في السودة', city: 'أبها', dateFrom: '2026-09-12', dateTo: '2026-09-12', category: 'YOUTH', budget: 'LOW', capacity: 3, participantUids: ['u7', 'u6', 'u5'], ownerUid: 'u7', closed: false, description: 'طلعة صباحية.' },
    { id: 'b3', kind: 'FULL_TRIP', title: 'أوروبا للشباب', city: 'براغ', dateFrom: '2026-12-20', dateTo: '2027-01-02', category: 'YOUTH', budget: 'HIGH', capacity: 8, participantUids: ['u4'], ownerUid: 'u4', closed: false, description: 'جولة أوروبية.' },
  ];
}

export function createBuddiesService(): BuddiesService {
  return import.meta.env.VITE_API_BASE_URL ? createApiBuddiesService() : createMockBuddiesService(demoBuddies());
}

export { spotsLeft, statusOf };
