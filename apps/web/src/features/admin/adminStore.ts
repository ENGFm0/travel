import { create } from 'zustand';
import type { GlobalRole } from '@boardingpass/types';
import type { AdminData } from './adminService';
import { createAdminService, type AdminService } from './adminService';

interface AdminStore {
  service: AdminService | null;
  data: AdminData | null;
  loading: boolean;
  setService: (s: AdminService) => void;
  _set: (p: Partial<AdminStore>) => void;
}

export const useAdminStore = create<AdminStore>((set) => ({
  service: null,
  data: null,
  loading: false,
  setService: (service) => set({ service }),
  _set: (p) => set(p),
}));

export function initAdmin(): void {
  if (!useAdminStore.getState().service) {
    useAdminStore.getState().setService(createAdminService());
  }
}

export function useAdmin() {
  const data = useAdminStore((s) => s.data);
  const loading = useAdminStore((s) => s.loading);
  return { data, loading };
}

function svc(): AdminService {
  const s = useAdminStore.getState().service;
  if (!s) throw new Error('Admin service not initialized');
  return s;
}

async function apply(fn: () => Promise<AdminData>): Promise<void> {
  try { useAdminStore.getState()._set({ data: await fn() }); } catch { /* ignore */ }
}

export const adminActions = {
  async load(): Promise<void> {
    useAdminStore.getState()._set({ loading: true });
    try { useAdminStore.getState()._set({ data: await svc().load() }); }
    catch { /* ignore */ }
    finally { useAdminStore.getState()._set({ loading: false }); }
  },
  suspend: (uid: string, reason: string) => apply(() => svc().suspend(uid, reason)),
  reactivate: (uid: string) => apply(() => svc().reactivate(uid)),
  moderate: (flagId: string, action: 'REMOVE' | 'APPROVE', reason: string) => apply(() => svc().moderate(flagId, action, reason)),
  assignRole: (uid: string, role: GlobalRole) => apply(() => svc().assignRole(uid, role)),
};
