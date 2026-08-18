import { createApiClient } from '@boardingpass/core';
import type { AppNotification } from './notificationsModel';

export interface NotificationsService {
  list(): Promise<AppNotification[]>;
  markRead(id: string): Promise<AppNotification[]>;
  markAllRead(): Promise<AppNotification[]>;
}

/** In-memory notifications service for dev/tests. The real service reads
 *  recipient-scoped `notifications/{uid}` and FCM delivery is server-side. NOT a
 *  security boundary. */
export function createMockNotificationsService(seed?: AppNotification[]): NotificationsService {
  let items: AppNotification[] = (seed ?? demoNotifications()).map((n) => ({ ...n }));
  const tick = () => new Promise<void>((r) => setTimeout(r, 0));
  const snap = () => items.map((n) => ({ ...n }));
  return {
    async list() { await tick(); return snap(); },
    async markRead(id) { await tick(); items = items.map((n) => (n.id === id ? { ...n, read: true } : n)); return snap(); },
    async markAllRead() { await tick(); items = items.map((n) => ({ ...n, read: true })); return snap(); },
  };
}

export function createApiNotificationsService(getToken?: () => string | undefined): NotificationsService {
  const base = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api/v1';
  const client = createApiClient({ baseUrl: base, getToken });
  const list = () => client.apiFetch<AppNotification[]>('/notifications');
  return {
    list,
    markRead: async (id) => { await client.apiFetch<void>(`/notifications/${id}`, { method: 'PATCH', body: JSON.stringify({ read: true }) }); return list(); },
    markAllRead: async () => { await client.apiFetch<void>('/notifications/read-all', { method: 'PATCH' }); return list(); },
  };
}

export function demoNotifications(): AppNotification[] {
  return [
    { id: 'n1', type: 'TRIP_INVITE', read: false, ts: '2026-08-18T09:00:00', actor: 'سالم', tripId: 'trip-demo-1' },
    { id: 'n2', type: 'FRIEND_REQUEST', read: false, ts: '2026-08-17T18:30:00', actor: 'نورة' },
    { id: 'n3', type: 'PAYMENT_REMINDER', read: true, ts: '2026-08-16T12:00:00', tripId: 'trip-demo-1' },
  ];
}

export function createNotificationsService(): NotificationsService {
  return import.meta.env.VITE_API_BASE_URL ? createApiNotificationsService() : createMockNotificationsService();
}
