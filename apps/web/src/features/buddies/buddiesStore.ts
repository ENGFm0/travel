import { create } from 'zustand';
import type { BuddyRequest } from './buddiesModel';
import type { BuddiesErrorCode, BuddiesService, CreateBuddyPayload } from './buddiesService';
import { BuddiesError, CURRENT_UID, createBuddiesService } from './buddiesService';

interface BuddiesStore {
  service: BuddiesService | null;
  requests: BuddyRequest[] | null;
  loading: boolean;
  error: BuddiesErrorCode | null;
  flagged: string | null; // id of the last flagged request (for confirmation)
  setService: (s: BuddiesService) => void;
  _set: (p: Partial<BuddiesStore>) => void;
}

export const useBuddiesStore = create<BuddiesStore>((set) => ({
  service: null,
  requests: null,
  loading: false,
  error: null,
  flagged: null,
  setService: (service) => set({ service }),
  _set: (p) => set(p),
}));

export function initBuddies(): void {
  if (!useBuddiesStore.getState().service) {
    useBuddiesStore.getState().setService(createBuddiesService());
  }
}

export function useBuddies() {
  const requests = useBuddiesStore((s) => s.requests);
  const loading = useBuddiesStore((s) => s.loading);
  const error = useBuddiesStore((s) => s.error);
  const flagged = useBuddiesStore((s) => s.flagged);
  return { requests, loading, error, flagged };
}

function svc(): BuddiesService {
  const s = useBuddiesStore.getState().service;
  if (!s) throw new Error('Buddies service not initialized');
  return s;
}

async function apply(fn: () => Promise<BuddyRequest[]>): Promise<boolean> {
  useBuddiesStore.getState()._set({ error: null });
  try {
    const requests = await fn();
    useBuddiesStore.getState()._set({ requests });
    return true;
  } catch (e) {
    useBuddiesStore.getState()._set({ error: e instanceof BuddiesError ? e.code : 'GENERIC' });
    return false;
  }
}

export const buddiesActions = {
  async load(): Promise<void> {
    useBuddiesStore.getState()._set({ loading: true, error: null });
    try {
      const requests = await svc().list();
      useBuddiesStore.getState()._set({ requests });
    } catch {
      useBuddiesStore.getState()._set({ error: 'GENERIC' });
    } finally {
      useBuddiesStore.getState()._set({ loading: false });
    }
  },
  create: (p: CreateBuddyPayload) => apply(() => svc().create(p, CURRENT_UID)),
  join: (id: string) => apply(() => svc().join(id, CURRENT_UID)),
  leave: (id: string) => apply(() => svc().leave(id, CURRENT_UID)),
  close: (id: string) => apply(() => svc().close(id, CURRENT_UID)),
  async flag(id: string): Promise<void> {
    try { await svc().flag(id); useBuddiesStore.getState()._set({ flagged: id }); } catch { /* ignore */ }
  },
  clearError: () => useBuddiesStore.getState()._set({ error: null }),
  clearFlagged: () => useBuddiesStore.getState()._set({ flagged: null }),
};
