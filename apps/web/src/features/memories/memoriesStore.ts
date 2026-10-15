import { create } from 'zustand';
import type { Media } from './memoriesModel';
import type { MemoriesService, UploadMeta } from './memoriesService';
import { createMemoriesService } from './memoriesService';

interface MemoriesStore {
  service: MemoriesService | null;
  media: Media[] | null;
  loading: boolean;
  error: string | null;
  setService: (s: MemoriesService) => void;
  _set: (p: Partial<MemoriesStore>) => void;
}

export const useMemoriesStore = create<MemoriesStore>((set) => ({
  service: null,
  media: null,
  loading: false,
  error: null,
  setService: (service) => set({ service }),
  _set: (p) => set(p),
}));

export function initMemories(): void {
  if (!useMemoriesStore.getState().service) {
    useMemoriesStore.getState().setService(createMemoriesService());
  }
}

export function useMemories() {
  const media = useMemoriesStore((s) => s.media);
  const loading = useMemoriesStore((s) => s.loading);
  const error = useMemoriesStore((s) => s.error);
  return { media, loading, error };
}

function svc(): MemoriesService {
  const s = useMemoriesStore.getState().service;
  if (!s) throw new Error('Memories service not initialized');
  return s;
}

let activeTripId = '';
function errText(e: unknown): string {
  const anyE = e as { code?: string; message?: string };
  return anyE?.code || anyE?.message || 'GENERIC';
}

async function apply(fn: (tripId: string) => Promise<Media[]>): Promise<void> {
  useMemoriesStore.getState()._set({ error: null });
  try {
    const media = await fn(activeTripId);
    useMemoriesStore.getState()._set({ media });
  } catch (e) {
    useMemoriesStore.getState()._set({ error: errText(e) });
  }
}

export const memoriesActions = {
  async load(tripId: string): Promise<void> {
    activeTripId = tripId;
    useMemoriesStore.getState()._set({ loading: true, error: null });
    try {
      const media = await svc().list(tripId);
      useMemoriesStore.getState()._set({ media });
    } catch (e) {
      useMemoriesStore.getState()._set({ error: errText(e) });
    } finally {
      useMemoriesStore.getState()._set({ loading: false });
    }
  },
  upload: (meta: UploadMeta, uploaderUid: string) => apply((t) => svc().upload(t, meta, uploaderUid)),
  remove: (id: string) => apply((t) => svc().remove(t, id)),
  shareLink: (tripId: string) => svc().shareLink(tripId),
  reset: () => { activeTripId = ''; useMemoriesStore.getState()._set({ media: null, error: null }); },
};
