import { createApiClient } from '@boardingpass/core';
import { loadJSON, persistAfter } from '@/shared/persist';
import { currentUid, db, firebaseEnabled, requireUid } from '@/shared/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
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
  updateGroup(tripId: string, id: string, e: { desc: string; category: Category; amount: number; payerUid: string }): Promise<Finance>;
  deleteGroup(tripId: string, id: string): Promise<Finance>;
  addSide(tripId: string, s: { title: string; participantUids: string[]; total: number; payerUid: string }): Promise<Finance>;
  deleteSide(tripId: string, id: string): Promise<Finance>;
  settleSide(tripId: string, id: string): Promise<Finance>;
  setPersonalBudget(tripId: string, amount: number): Promise<Finance>;
  addPersonal(tripId: string, e: { desc: string; amount: number }): Promise<Finance>;
  updatePersonal(tripId: string, id: string, e: { desc: string; amount: number }): Promise<Finance>;
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
export function createMockExpensesService(seed?: Record<string, Partial<Store>>, persistKey?: string): ExpensesService {
  const stores = new Map<string, Store>();
  if (persistKey) {
    const saved = loadJSON<Record<string, Store>>(persistKey, {});
    for (const [k, v] of Object.entries(saved)) stores.set(k, v);
  }
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

  const base: ExpensesService = {
    async getFinance(tripId, init, me) { await tick(); store(tripId, init); return view(tripId, me); },
    async setKittyTotal(tripId, total) { await tick(); store(tripId).kittyTotal = Math.max(0, total); return view(tripId, ME(tripId)); },
    async markPaid(tripId, u, paid) { await tick(); store(tripId).paid[u] = paid; return view(tripId, ME(tripId)); },
    async addGroup(tripId, e) {
      await tick();
      store(tripId).group.push({ id: uid('g'), desc: e.desc.trim(), category: e.category, amount: e.amount, payerUid: e.payerUid });
      return view(tripId, ME(tripId));
    },
    async updateGroup(tripId, id, e) {
      await tick();
      const g = store(tripId).group.find((x) => x.id === id);
      if (g) { g.desc = e.desc.trim(); g.category = e.category; g.amount = e.amount; g.payerUid = e.payerUid; }
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
    async updatePersonal(tripId, id, e) {
      await tick();
      const me = ME(tripId);
      const p = (store(tripId).personal[me] ?? []).find((x) => x.id === id);
      if (p) { p.desc = e.desc.trim(); p.amount = e.amount; }
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

  return persistAfter(base, persistKey, () => Object.fromEntries(stores));
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
    updateGroup: (tripId, id, e) => client.apiFetch<Finance>(`/trips/${tripId}/expenses/${id}`, { method: 'PATCH', body: JSON.stringify({ kind: 'GROUP', ...e }) }),
    deleteGroup: async (tripId, id) => { await client.apiFetch<void>(`/trips/${tripId}/expenses/${id}`, { method: 'DELETE' }); return fin(tripId); },
    addSide: (tripId, s) => client.apiFetch<Finance>(`/trips/${tripId}/expenses`, { method: 'POST', body: JSON.stringify({ kind: 'SIDE', ...s }) }),
    deleteSide: async (tripId, id) => { await client.apiFetch<void>(`/trips/${tripId}/expenses/${id}`, { method: 'DELETE' }); return fin(tripId); },
    settleSide: (tripId, id) => client.apiFetch<Finance>(`/trips/${tripId}/expenses/${id}/settle`, { method: 'POST' }),
    setPersonalBudget: (tripId, amount) => client.apiFetch<Finance>(`/trips/${tripId}/personal/budget`, { method: 'PUT', body: JSON.stringify({ amount }) }),
    addPersonal: (tripId, e) => client.apiFetch<Finance>(`/trips/${tripId}/expenses`, { method: 'POST', body: JSON.stringify({ kind: 'PERSONAL', ...e }) }),
    updatePersonal: (tripId, id, e) => client.apiFetch<Finance>(`/trips/${tripId}/expenses/${id}`, { method: 'PATCH', body: JSON.stringify({ kind: 'PERSONAL', ...e }) }),
    deletePersonal: async (tripId, id) => { await client.apiFetch<void>(`/trips/${tripId}/expenses/${id}`, { method: 'DELETE' }); return fin(tripId); },
  };
}

/** Firestore-backed expenses. Shared finance (kitty + group/side) lives in one
 *  member-writable doc (trips/{tripId}/finance/shared); each user's personal
 *  budget + spend is self-scoped in trips/{tripId}/finance/personal_<uid>. */
interface SharedFinance {
  base: string; dest: string; rate: number;
  kittyTotal: number; paid: Record<string, boolean>;
  group: GroupExpense[]; sides: SideKitty[];
}
interface PersonalDoc { budget: number; items: PersonalExpense[] }

export function createFirestoreExpensesService(): ExpensesService {
  const sharedRef = (tripId: string) => doc(db(), 'trips', tripId, 'finance', 'shared');
  const personalRef = (tripId: string, uid: string) => doc(db(), 'trips', tripId, 'finance', `personal_${uid}`);

  async function readShared(tripId: string, init?: FinanceInit): Promise<SharedFinance> {
    const s = await getDoc(sharedRef(tripId));
    if (s.exists()) return s.data() as SharedFinance;
    const fresh: SharedFinance = {
      base: init?.base ?? 'SAR', dest: init?.dest ?? 'GBP', rate: init?.rate ?? 0.2122,
      kittyTotal: 0, paid: {}, group: [], sides: [],
    };
    await setDoc(sharedRef(tripId), fresh);
    return fresh;
  }
  async function readPersonal(tripId: string, uid: string): Promise<PersonalDoc> {
    const s = await getDoc(personalRef(tripId, uid));
    return s.exists() ? (s.data() as PersonalDoc) : { budget: 0, items: [] };
  }
  const view = (sh: SharedFinance, p: PersonalDoc): Finance => ({
    base: sh.base, dest: sh.dest, rate: sh.rate,
    kittyTotal: sh.kittyTotal, paid: { ...sh.paid },
    group: sh.group.map((g) => ({ ...g })),
    sides: sh.sides.map((x) => ({ ...x, participantUids: [...x.participantUids] })),
    personalBudget: p.budget, personal: p.items.map((i) => ({ ...i })),
  });
  async function withShared(tripId: string, mutate: (sh: SharedFinance) => void): Promise<Finance> {
    const uid = requireUid();
    const sh = await readShared(tripId);
    mutate(sh);
    await setDoc(sharedRef(tripId), sh);
    return view(sh, await readPersonal(tripId, uid));
  }
  async function withPersonal(tripId: string, mutate: (p: PersonalDoc) => void): Promise<Finance> {
    const uid = requireUid();
    const p = await readPersonal(tripId, uid);
    mutate(p);
    await setDoc(personalRef(tripId, uid), p);
    return view(await readShared(tripId), p);
  }

  return {
    async getFinance(tripId, init, me) {
      const sh = await readShared(tripId, init);
      const p = await readPersonal(tripId, me);
      return view(sh, p);
    },
    setKittyTotal: (tripId, total) => withShared(tripId, (sh) => { sh.kittyTotal = Math.max(0, total); }),
    markPaid: (tripId, u, paid) => withShared(tripId, (sh) => { sh.paid[u] = paid; }),
    addGroup: (tripId, e) => withShared(tripId, (sh) => { sh.group.push({ id: uid('g'), desc: e.desc.trim(), category: e.category, amount: e.amount, payerUid: e.payerUid }); }),
    updateGroup: (tripId, id, e) => withShared(tripId, (sh) => { const g = sh.group.find((x) => x.id === id); if (g) { g.desc = e.desc.trim(); g.category = e.category; g.amount = e.amount; g.payerUid = e.payerUid; } }),
    deleteGroup: (tripId, id) => withShared(tripId, (sh) => { sh.group = sh.group.filter((g) => g.id !== id); }),
    addSide: (tripId, x) => withShared(tripId, (sh) => { sh.sides.push({ id: uid('s'), title: x.title.trim(), participantUids: [...x.participantUids], total: x.total, payerUid: x.payerUid, settled: false }); }),
    deleteSide: (tripId, id) => withShared(tripId, (sh) => { sh.sides = sh.sides.filter((x) => x.id !== id); }),
    settleSide: (tripId, id) => withShared(tripId, (sh) => { const x = sh.sides.find((y) => y.id === id); if (x) x.settled = true; }),
    setPersonalBudget: (tripId, amount) => withPersonal(tripId, (p) => { p.budget = Math.max(0, amount); }),
    addPersonal: (tripId, e) => withPersonal(tripId, (p) => { p.items.push({ id: uid('p'), desc: e.desc.trim(), amount: e.amount }); }),
    updatePersonal: (tripId, id, e) => withPersonal(tripId, (p) => { const it = p.items.find((x) => x.id === id); if (it) { it.desc = e.desc.trim(); it.amount = e.amount; } }),
    deletePersonal: (tripId, id) => withPersonal(tripId, (p) => { p.items = p.items.filter((x) => x.id !== id); }),
  };
}

export function createExpensesService(): ExpensesService {
  if (firebaseEnabled()) return createFirestoreExpensesService();
  return import.meta.env.VITE_API_BASE_URL ? createApiExpensesService() : createMockExpensesService(undefined, 'bp.expenses.v1');
}

/** Record a shared (group) expense from outside the Expenses tab — e.g. a flight
 *  or activity cost added in the itinerary. Best-effort; no-op for zero amounts. */
export async function recordTripExpense(
  tripId: string, e: { desc: string; category: Category; amount: number },
): Promise<void> {
  if (!e.amount || e.amount <= 0) return;
  const payerUid = currentUid() ?? 'me';
  await createExpensesService().addGroup(tripId, { desc: e.desc.trim() || '—', category: e.category, amount: e.amount, payerUid });
}

/** Set the shared kitty total from outside the Expenses tab (e.g. the wizard). */
export async function setTripKitty(tripId: string, total: number): Promise<void> {
  await createExpensesService().setKittyTotal(tripId, Math.max(0, total));
}
