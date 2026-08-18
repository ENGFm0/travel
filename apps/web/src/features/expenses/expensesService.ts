import { createApiClient } from '@boardingpass/core';
import type { Category, Finance, GroupExpense, PersonalExpense, SideKitty } from './finance';

export interface FinanceInit {
  memberUids: string[];
  base: string;
  dest: string;
  rate: number;
}

export interface ExpensesService {
  getFinance(tripId: string, init: FinanceInit, me: string): Promise<Finance>;
  setKittyTotal(tripId: string, total: number): Promise<Finance>;
  markPaid(tripId: string, uid: string, paid: boolean): Promise<Finance>;
  addGroup(tripId: string, e: { desc: string; category: Category; amount: number; payerUid: string }): Promise<Finance>;
  deleteGroup(tripId: string, id: string): Promise<Finance>;
  addSide(tripId: string, s: { title: string; participantUids: string[]; total: number; payerUid: string }): Promise<Finance>;
  deleteSide(tripId: string, id: string): Promise<Finance>;
  settleSide(tripId: string, id: string): Promise<Finance>;
  setPersonalBudget(tripId: string, amount: number): Promise<Finance>;
  addPersonal(tripId: string, e: { desc: string; amount: number }): Promise<Finance>;
  deletePersonal(tripId: string, id: string): Promise<Finance>;
}

const uid = (p: string) => `${p}-${crypto.randomUUID()}`;

interface Store {
  base: string; dest: string; rate: number;
  kittyTotal: number;
  paid: Record<string, boolean>;
  group: GroupExpense[];
  sides: SideKitty[];
  personalBudget: Record<string, number>;         // per user (self-scoped)
  personal: Record<string, PersonalExpense[]>;     // per user (self-scoped)
}

/** In-memory expenses service for dev/tests. Personal spend is strictly
 *  self-scoped (BR-007-003). NOT a security boundary — the server recomputes all
 *  totals and enforces owner-only confirmations. */
export function createMockExpensesService(seed?: Record<string, Partial<Store>>): ExpensesService {
  const stores = new Map<string, Store>();
  const tick = () => new Promise<void>((r) => setTimeout(r, 0));

  function store(tripId: string, init?: FinanceInit): Store {
    let s = stores.get(tripId);
    if (!s) {
      const seeded = seed?.[tripId];
      s = {
        base: init?.base ?? 'SAR', dest: init?.dest ?? 'GBP', rate: init?.rate ?? 0.2122,
        kittyTotal: 0, paid: {}, group: [], sides: [], personalBudget: {}, personal: {},
        ...seeded,
      };
      stores.set(tripId, s);
    }
    return s;
  }

  function view(tripId: string, me: string): Finance {
    const s = stores.get(tripId)!;
    return {
      base: s.base, dest: s.dest, rate: s.rate,
      kittyTotal: s.kittyTotal, paid: { ...s.paid },
      group: s.group.map((g) => ({ ...g })),
      sides: s.sides.map((x) => ({ ...x, participantUids: [...x.participantUids] })),
      personalBudget: s.personalBudget[me] ?? 0,
      personal: (s.personal[me] ?? []).map((p) => ({ ...p })),
    };
  }

  return {
    async getFinance(tripId, init, me) { await tick(); store(tripId, init); return view(tripId, me); },
    async setKittyTotal(tripId, total) { await tick(); store(tripId).kittyTotal = Math.max(0, total); return view(tripId, ME(tripId)); },
    async markPaid(tripId, u, paid) { await tick(); store(tripId).paid[u] = paid; return view(tripId, ME(tripId)); },
    async addGroup(tripId, e) {
      await tick();
      store(tripId).group.push({ id: uid('g'), desc: e.desc.trim(), category: e.category, amount: e.amount, payerUid: e.payerUid });
      return view(tripId, ME(tripId));
    },
    async deleteGroup(tripId, id) { await tick(); const s = store(tripId); s.group = s.group.filter((g) => g.id !== id); return view(tripId, ME(tripId)); },
    async addSide(tripId, x) {
      await tick();
      store(tripId).sides.push({ id: uid('s'), title: x.title.trim(), participantUids: [...x.participantUids], total: x.total, payerUid: x.payerUid, settled: false });
      return view(tripId, ME(tripId));
    },
    async deleteSide(tripId, id) { await tick(); const s = store(tripId); s.sides = s.sides.filter((x) => x.id !== id); return view(tripId, ME(tripId)); },
    async settleSide(tripId, id) { await tick(); const x = store(tripId).sides.find((y) => y.id === id); if (x) x.settled = true; return view(tripId, ME(tripId)); },
    async setPersonalBudget(tripId, amount) { await tick(); store(tripId).personalBudget[ME(tripId)] = Math.max(0, amount); return view(tripId, ME(tripId)); },
    async addPersonal(tripId, e) {
      await tick();
      const s = store(tripId); const me = ME(tripId);
      (s.personal[me] ??= []).push({ id: uid('p'), desc: e.desc.trim(), amount: e.amount });
      return view(tripId, me);
    },
    async deletePersonal(tripId, id) {
      await tick();
      const s = store(tripId); const me = ME(tripId);
      s.personal[me] = (s.personal[me] ?? []).filter((p) => p.id !== id);
      return view(tripId, me);
    },
  };

  // The mock has a single "current user" per session; the app passes it via
  // getFinance and the store remembers it for subsequent self-scoped writes.
  function ME(tripId: string): string { return currentUser.get(tripId) ?? 'me'; }
}

// Records the "me" uid per trip for the mock's self-scoped personal writes.
const currentUser = new Map<string, string>();
export function setMockCurrentUser(tripId: string, me: string): void { currentUser.set(tripId, me); }

export function createApiExpensesService(getToken?: () => string | undefined): ExpensesService {
  const base = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api/v1';
  const client = createApiClient({ baseUrl: base, getToken });
  const fin = (tripId: string) => client.apiFetch<Finance>(`/trips/${tripId}/finance/summary`);
  return {
    getFinance: (tripId) => fin(tripId),
    setKittyTotal: (tripId, total) => client.apiFetch<Finance>(`/trips/${tripId}/kitty`, { method: 'PUT', body: JSON.stringify({ total }) }),
    markPaid: (tripId, u, paid) => client.apiFetch<Finance>(`/trips/${tripId}/kitty/mark-paid`, { method: 'POST', body: JSON.stringify({ memberUid: u, paid }) }),
    addGroup: (tripId, e) => client.apiFetch<Finance>(`/trips/${tripId}/expenses`, { method: 'POST', body: JSON.stringify({ kind: 'GROUP', ...e }) }),
    deleteGroup: async (tripId, id) => { await client.apiFetch<void>(`/trips/${tripId}/expenses/${id}`, { method: 'DELETE' }); return fin(tripId); },
    addSide: (tripId, s) => client.apiFetch<Finance>(`/trips/${tripId}/expenses`, { method: 'POST', body: JSON.stringify({ kind: 'SIDE', ...s }) }),
    deleteSide: async (tripId, id) => { await client.apiFetch<void>(`/trips/${tripId}/expenses/${id}`, { method: 'DELETE' }); return fin(tripId); },
    settleSide: (tripId, id) => client.apiFetch<Finance>(`/trips/${tripId}/expenses/${id}/settle`, { method: 'POST' }),
    setPersonalBudget: (tripId, amount) => client.apiFetch<Finance>(`/trips/${tripId}/personal/budget`, { method: 'PUT', body: JSON.stringify({ amount }) }),
    addPersonal: (tripId, e) => client.apiFetch<Finance>(`/trips/${tripId}/expenses`, { method: 'POST', body: JSON.stringify({ kind: 'PERSONAL', ...e }) }),
    deletePersonal: async (tripId, id) => { await client.apiFetch<void>(`/trips/${tripId}/expenses/${id}`, { method: 'DELETE' }); return fin(tripId); },
  };
}

export function createExpensesService(): ExpensesService {
  return import.meta.env.VITE_API_BASE_URL ? createApiExpensesService() : createMockExpensesService();
}
