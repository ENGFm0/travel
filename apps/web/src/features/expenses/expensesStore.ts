import { create } from 'zustand';
import type { Category, Finance } from './finance';
import type { ExpensesService, FinanceInit } from './expensesService';
import { createExpensesService, setMockCurrentUser } from './expensesService';

interface ExpensesStore {
  service: ExpensesService | null;
  finance: Finance | null;
  me: string;
  memberUids: string[];
  loading: boolean;
  error: string | null;
  setService: (s: ExpensesService) => void;
  _set: (p: Partial<ExpensesStore>) => void;
}

export const useExpensesStore = create<ExpensesStore>((set) => ({
  service: null,
  finance: null,
  me: 'me',
  memberUids: [],
  loading: false,
  error: null,
  setService: (service) => set({ service }),
  _set: (p) => set(p),
}));

export function initExpenses(): void {
  if (!useExpensesStore.getState().service) {
    useExpensesStore.getState().setService(createExpensesService());
  }
}

export function useFinance() {
  const finance = useExpensesStore((s) => s.finance);
  const loading = useExpensesStore((s) => s.loading);
  const error = useExpensesStore((s) => s.error);
  const me = useExpensesStore((s) => s.me);
  const memberUids = useExpensesStore((s) => s.memberUids);
  return { finance, loading, error, me, memberUids };
}

function svc(): ExpensesService {
  const s = useExpensesStore.getState().service;
  if (!s) throw new Error('Expenses service not initialized');
  return s;
}

async function apply(fn: (tripId: string, me: string) => Promise<Finance>): Promise<void> {
  const { tripId, me } = current();
  useExpensesStore.getState()._set({ error: null });
  try {
    const finance = await fn(tripId, me);
    useExpensesStore.getState()._set({ finance });
  } catch {
    useExpensesStore.getState()._set({ error: 'GENERIC' });
  }
}

let activeTripId = '';
function current() { return { tripId: activeTripId, me: useExpensesStore.getState().me }; }

export const expensesActions = {
  async load(tripId: string, init: FinanceInit, me: string): Promise<void> {
    activeTripId = tripId;
    setMockCurrentUser(tripId, me);
    useExpensesStore.getState()._set({ loading: true, error: null, me, memberUids: init.memberUids });
    try {
      const finance = await svc().getFinance(tripId, init, me);
      useExpensesStore.getState()._set({ finance });
    } catch {
      useExpensesStore.getState()._set({ error: 'GENERIC' });
    } finally {
      useExpensesStore.getState()._set({ loading: false });
    }
  },
  setKittyTotal: (total: number) => apply((t) => svc().setKittyTotal(t, total)),
  markPaid: (uid: string, paid: boolean) => apply((t) => svc().markPaid(t, uid, paid)),
  addGroup: (e: { desc: string; category: Category; amount: number; payerUid: string }) => apply((t) => svc().addGroup(t, e)),
  updateGroup: (id: string, e: { desc: string; category: Category; amount: number; payerUid: string }) => apply((t) => svc().updateGroup(t, id, e)),
  deleteGroup: (id: string) => apply((t) => svc().deleteGroup(t, id)),
  addSide: (s: { title: string; participantUids: string[]; total: number; payerUid: string }) => apply((t) => svc().addSide(t, s)),
  deleteSide: (id: string) => apply((t) => svc().deleteSide(t, id)),
  settleSide: (id: string) => apply((t) => svc().settleSide(t, id)),
  setPersonalBudget: (amount: number) => apply((t) => svc().setPersonalBudget(t, amount)),
  addPersonal: (e: { desc: string; amount: number }) => apply((t) => svc().addPersonal(t, e)),
  updatePersonal: (id: string, e: { desc: string; amount: number }) => apply((t) => svc().updatePersonal(t, id, e)),
  deletePersonal: (id: string) => apply((t) => svc().deletePersonal(t, id)),
  reset: () => { activeTripId = ''; useExpensesStore.getState()._set({ finance: null, error: null }); },
};
