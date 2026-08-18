import { create } from 'zustand';
import type { FriendsErrorCode, Graph } from './friendsModel';
import { FriendsError } from './friendsModel';
import type { FriendsService } from './friendsService';
import { createFriendsService } from './friendsService';

interface FriendsStore {
  service: FriendsService | null;
  graph: Graph | null;
  loading: boolean;
  error: FriendsErrorCode | null;
  setService: (s: FriendsService) => void;
  _set: (p: Partial<FriendsStore>) => void;
}

export const useFriendsStore = create<FriendsStore>((set) => ({
  service: null,
  graph: null,
  loading: false,
  error: null,
  setService: (service) => set({ service }),
  _set: (p) => set(p),
}));

export function initFriends(): void {
  if (!useFriendsStore.getState().service) {
    useFriendsStore.getState().setService(createFriendsService());
  }
}

export function useFriends() {
  const graph = useFriendsStore((s) => s.graph);
  const loading = useFriendsStore((s) => s.loading);
  const error = useFriendsStore((s) => s.error);
  return { graph, loading, error };
}

function svc(): FriendsService {
  const s = useFriendsStore.getState().service;
  if (!s) throw new Error('Friends service not initialized');
  return s;
}

async function apply(fn: () => Promise<Graph>): Promise<boolean> {
  useFriendsStore.getState()._set({ error: null });
  try {
    const graph = await fn();
    useFriendsStore.getState()._set({ graph });
    return true;
  } catch (e) {
    useFriendsStore.getState()._set({ error: e instanceof FriendsError ? e.code : 'GENERIC' });
    return false;
  }
}

export const friendsActions = {
  async load(): Promise<void> {
    useFriendsStore.getState()._set({ loading: true, error: null });
    try {
      const graph = await svc().getGraph();
      useFriendsStore.getState()._set({ graph });
    } catch {
      useFriendsStore.getState()._set({ error: 'GENERIC' });
    } finally {
      useFriendsStore.getState()._set({ loading: false });
    }
  },
  send: (handle: string) => apply(() => svc().sendRequest(handle)),
  accept: (id: string) => apply(() => svc().acceptRequest(id)),
  reject: (id: string) => apply(() => svc().rejectRequest(id)),
  remove: (id: string) => apply(() => svc().removeFriend(id)),
  inviteToTrip: (friendId: string, tripId: string) => svc().inviteToTrip(friendId, tripId),
  clearError: () => useFriendsStore.getState()._set({ error: null }),
};
