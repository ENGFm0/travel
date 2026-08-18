import { createApiClient } from '@boardingpass/core';
import type { Media, MediaType } from './memoriesModel';

export interface UploadMeta {
  type: MediaType;
  src: string;
  name: string;
  day: string;
  place: string;
}

export interface MemoriesService {
  list(tripId: string): Promise<Media[]>;
  upload(tripId: string, meta: UploadMeta, uploaderUid: string): Promise<Media[]>;
  remove(tripId: string, id: string): Promise<Media[]>;
  shareLink(tripId: string): Promise<string>;
}

const uid = (p: string) => `${p}-${crypto.randomUUID()}`;

/** In-memory memories service for dev/tests. Real uploads go through a signed-URL
 *  flow to Firebase Storage with type/size/scan validation and membership-scoped
 *  Storage Rules (BR-013-001/004). NOT a security boundary. */
export function createMockMemoriesService(seed?: Record<string, Media[]>): MemoriesService {
  const byTrip = new Map<string, Media[]>();
  if (seed) for (const [k, v] of Object.entries(seed)) byTrip.set(k, v.map((m) => ({ ...m })));
  const tick = () => new Promise<void>((r) => setTimeout(r, 0));
  const ensure = (tripId: string) => { let l = byTrip.get(tripId); if (!l) { l = []; byTrip.set(tripId, l); } return l; };
  const snap = (tripId: string) => ensure(tripId).map((m) => ({ ...m }));

  return {
    async list(tripId) { await tick(); return snap(tripId); },
    async upload(tripId, meta, uploaderUid) {
      await tick();
      ensure(tripId).push({ id: uid('m'), type: meta.type, src: meta.src, name: meta.name, uploaderUid, day: meta.day, place: meta.place });
      return snap(tripId);
    },
    async remove(tripId, id) {
      await tick();
      byTrip.set(tripId, ensure(tripId).filter((m) => m.id !== id));
      return snap(tripId);
    },
    async shareLink(tripId) {
      await tick();
      try { return `${globalThis.location?.origin ?? 'https://boardingpass.app'}/shared/${tripId}`; }
      catch { return `https://boardingpass.app/shared/${tripId}`; }
    },
  };
}

export function createApiMemoriesService(getToken?: () => string | undefined): MemoriesService {
  const base = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api/v1';
  const client = createApiClient({ baseUrl: base, getToken });
  const list = (tripId: string) => client.apiFetch<Media[]>(`/trips/${tripId}/memories`);
  return {
    list,
    // Real flow: request a signed URL, PUT the bytes to Storage, then confirm
    // metadata. Simplified to a single metadata call here.
    upload: (tripId, meta) => client.apiFetch<Media[]>(`/trips/${tripId}/memories`, { method: 'POST', body: JSON.stringify(meta) }),
    remove: async (tripId, id) => { await client.apiFetch<void>(`/trips/${tripId}/memories/${id}`, { method: 'DELETE' }); return list(tripId); },
    shareLink: async (tripId) => {
      const r = await client.apiFetch<{ url: string }>(`/trips/${tripId}/share`, { method: 'POST' });
      return r.url;
    },
  };
}

export function createMemoriesService(): MemoriesService {
  return import.meta.env.VITE_API_BASE_URL ? createApiMemoriesService() : createMockMemoriesService();
}
