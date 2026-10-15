import { createApiClient } from '@boardingpass/core';
import { db, storage, firebaseEnabled, requireUid } from '@/shared/firebase';
import { collection, doc, getDocs, setDoc, deleteDoc, query, orderBy, serverTimestamp } from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import type { Media, MediaType } from './memoriesModel';

export interface UploadMeta {
  type: MediaType;
  src: string;
  name: string;
  day: string;
  place: string;
  file?: File; // the actual bytes — required for real (Storage) uploads
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

/** Firestore + Storage memories: files live in Storage under
 *  memories/{tripId}/{mediaId}; metadata docs at trips/{tripId}/memories/{id}.
 *  Membership-scoped by the Firestore + Storage rules. */
export function createFirestoreMemoriesService(): MemoriesService {
  const col = (tripId: string) => collection(db(), 'trips', tripId, 'memories');
  const toMedia = (id: string, d: Record<string, unknown>): Media => ({
    id,
    type: (d.type as MediaType) ?? 'image',
    src: (d.src as string) ?? '',
    name: (d.name as string) ?? '',
    uploaderUid: (d.uploaderUid as string) ?? '',
    day: (d.day as string) ?? '',
    place: (d.place as string) ?? '',
  });
  async function list(tripId: string): Promise<Media[]> {
    const snap = await getDocs(query(col(tripId), orderBy('createdAt', 'asc')));
    return snap.docs.map((s) => toMedia(s.id, s.data() as Record<string, unknown>));
  }
  return {
    list,
    async upload(tripId, meta) {
      const uid = requireUid();
      const id = `m-${crypto.randomUUID()}`;
      let src = meta.src;
      if (meta.file) {
        const path = `memories/${tripId}/${id}`;
        const sref = storageRef(storage(), path);
        await uploadBytes(sref, meta.file, { contentType: meta.file.type });
        src = await getDownloadURL(sref);
      }
      await setDoc(doc(col(tripId), id), {
        type: meta.type, src, name: meta.name, uploaderUid: uid,
        day: meta.day, place: meta.place, createdAt: serverTimestamp(),
      });
      return list(tripId);
    },
    async remove(tripId, id) {
      // Storage object deletion is denied to clients (rules); removing the
      // metadata doc hides it. The orphaned object is reaped server-side.
      await deleteDoc(doc(col(tripId), id)).catch(() => { /* already gone */ });
      return list(tripId);
    },
    async shareLink(tripId) {
      try { return `${globalThis.location?.origin ?? 'https://boardingpass.app'}/shared/${tripId}`; }
      catch { return `https://boardingpass.app/shared/${tripId}`; }
    },
  };
}

export function createMemoriesService(): MemoriesService {
  if (firebaseEnabled()) return createFirestoreMemoriesService();
  return import.meta.env.VITE_API_BASE_URL ? createApiMemoriesService() : createMockMemoriesService();
}
