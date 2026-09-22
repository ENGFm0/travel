import { create } from 'zustand';
import type { Partner } from './partnersModel';
import type { PartnersService } from './partnersService';
import { createPartnersService } from './partnersService';

interface PartnersStore {
  service: PartnersService | null;
  partners: Partner[] | null;
  loading: boolean;
  error: string | null;
  setService: (s: PartnersService) => void;
  _set: (p: Partial<PartnersStore>) => void;
}

export const usePartnersStore = create<PartnersStore>((set) => ({
  service: null,
  partners: null,
  loading: false,
  error: null,
  setService: (service) => set({ service }),
  _set: (p) => set(p),
}));

export function initPartners(): void {
  if (!usePartnersStore.getState().service) {
    usePartnersStore.getState().setService(createPartnersService());
  }
}

export function usePartners() {
  const partners = usePartnersStore((s) => s.partners);
  const loading = usePartnersStore((s) => s.loading);
  const error = usePartnersStore((s) => s.error);
  return { partners, loading, error };
}

function svc(): PartnersService {
  const s = usePartnersStore.getState().service;
  if (!s) throw new Error('Partners service not initialized');
  return s;
}

export const partnersActions = {
  async load(): Promise<void> {
    if (usePartnersStore.getState().partners !== null) return; // directory rarely changes
    usePartnersStore.getState()._set({ loading: true, error: null });
    try {
      const partners = await svc().list();
      usePartnersStore.getState()._set({ partners });
    } catch {
      usePartnersStore.getState()._set({ error: 'GENERIC' });
    } finally {
      usePartnersStore.getState()._set({ loading: false });
    }
  },
};
