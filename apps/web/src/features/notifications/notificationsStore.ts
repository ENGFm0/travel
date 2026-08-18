import { create } from 'zustand';
import type { AppNotification } from './notificationsModel';
import type { NotificationsService } from './notificationsService';
import { createNotificationsService } from './notificationsService';

interface NotificationsStore {
  service: NotificationsService | null;
  items: AppNotification[] | null;
  loading: boolean;
  setService: (s: NotificationsService) => void;
  _set: (p: Partial<NotificationsStore>) => void;
}

export const useNotificationsStore = create<NotificationsStore>((set) => ({
  service: null,
  items: null,
  loading: false,
  setService: (service) => set({ service }),
  _set: (p) => set(p),
}));

export function initNotifications(): void {
  if (!useNotificationsStore.getState().service) {
    useNotificationsStore.getState().setService(createNotificationsService());
  }
}

export function useNotifications() {
  const items = useNotificationsStore((s) => s.items);
  const loading = useNotificationsStore((s) => s.loading);
  return { items, loading };
}

function svc(): NotificationsService {
  const s = useNotificationsStore.getState().service;
  if (!s) throw new Error('Notifications service not initialized');
  return s;
}

export const notificationsActions = {
  async load(): Promise<void> {
    useNotificationsStore.getState()._set({ loading: true });
    try {
      const items = await svc().list();
      useNotificationsStore.getState()._set({ items });
    } catch {
      /* keep prior items */
    } finally {
      useNotificationsStore.getState()._set({ loading: false });
    }
  },
  async markRead(id: string): Promise<void> {
    try { useNotificationsStore.getState()._set({ items: await svc().markRead(id) }); } catch { /* ignore */ }
  },
  async markAllRead(): Promise<void> {
    try { useNotificationsStore.getState()._set({ items: await svc().markAllRead() }); } catch { /* ignore */ }
  },
  /** Device token is removed on logout (BR-015-005, AC5); mock clears the list. */
  reset: () => useNotificationsStore.getState()._set({ items: null }),
};
