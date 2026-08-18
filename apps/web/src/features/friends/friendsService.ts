import { createApiClient } from '@boardingpass/core';
import { FriendsError, normalizeHandle, type Friend, type FriendRequest, type Graph } from './friendsModel';

export interface FriendsService {
  getGraph(): Promise<Graph>;
  sendRequest(handle: string): Promise<Graph>;
  acceptRequest(id: string): Promise<Graph>;
  rejectRequest(id: string): Promise<Graph>;
  removeFriend(id: string): Promise<Graph>;
  inviteToTrip(friendId: string, tripId: string): Promise<void>;
}

const uid = (p: string) => `${p}-${crypto.randomUUID()}`;
const SELF_HANDLE = 'me';

/** In-memory friends service for dev/tests. NOT a security boundary — the server
 *  enforces self-scoped access, pair uniqueness/idempotency, and anti-spam. */
export function createMockFriendsService(seed?: Graph): FriendsService {
  const friends: Friend[] = seed ? seed.friends.map((f) => ({ ...f })) : [];
  let incoming: FriendRequest[] = seed ? seed.incoming.map((r) => ({ ...r })) : [];
  const tick = () => new Promise<void>((r) => setTimeout(r, 0));
  const snap = (): Graph => ({ friends: friends.map((f) => ({ ...f })), incoming: incoming.map((r) => ({ ...r })) });

  return {
    async getGraph() { await tick(); return snap(); },
    async sendRequest(handle) {
      await tick();
      const h = normalizeHandle(handle);
      if (!h || h === SELF_HANDLE) throw new FriendsError('SELF');
      if (friends.some((f) => normalizeHandle(f.username) === h)) throw new FriendsError('ALREADY_FRIEND');
      if (incoming.some((r) => normalizeHandle(r.username) === h)) throw new FriendsError('PENDING');
      // A real server creates an OUTGOING pending request; the mock has no second
      // user to accept it, so this is a no-op beyond the uniqueness checks.
      return snap();
    },
    async acceptRequest(id) {
      await tick();
      const req = incoming.find((r) => r.id === id);
      if (!req) throw new FriendsError('NOT_FOUND');
      incoming = incoming.filter((r) => r.id !== id);
      friends.push({ id: uid('f'), name: req.name, username: req.username });
      return snap();
    },
    async rejectRequest(id) {
      await tick();
      incoming = incoming.filter((r) => r.id !== id);
      return snap();
    },
    async removeFriend(id) {
      await tick();
      const i = friends.findIndex((f) => f.id === id);
      if (i >= 0) friends.splice(i, 1); // does NOT touch trip membership (BR-010-004)
      return snap();
    },
    async inviteToTrip(_friendId, _tripId) {
      await tick();
      // Delegates to US-009 server-side (creates a pending trip invitation).
    },
  };
}

export function createApiFriendsService(getToken?: () => string | undefined): FriendsService {
  const base = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api/v1';
  const client = createApiClient({ baseUrl: base, getToken });
  const graph = () => client.apiFetch<Graph>('/friends');
  return {
    getGraph: () => graph(),
    sendRequest: (handle) => client.apiFetch<Graph>('/friends/requests', { method: 'POST', body: JSON.stringify({ handle }) }),
    acceptRequest: (id) => client.apiFetch<Graph>(`/friends/requests/${id}`, { method: 'PATCH', body: JSON.stringify({ action: 'accept' }) }),
    rejectRequest: (id) => client.apiFetch<Graph>(`/friends/requests/${id}`, { method: 'PATCH', body: JSON.stringify({ action: 'reject' }) }),
    removeFriend: async (id) => { await client.apiFetch<void>(`/friends/${id}`, { method: 'DELETE' }); return graph(); },
    inviteToTrip: async (friendId, tripId) => { await client.apiFetch<void>('/friends/invite-to-trip', { method: 'POST', body: JSON.stringify({ friendId, tripId }) }); },
  };
}

/** Demo social graph for dev (mock only). */
export function demoGraph(): Graph {
  return {
    friends: [
      { id: 'f1', name: 'سالم العتيبي', username: 'salem' },
      { id: 'f2', name: 'نورة القحطاني', username: 'noura' },
    ],
    incoming: [{ id: 'r1', name: 'عمر الزهراني', username: 'omar' }],
  };
}

export function createFriendsService(): FriendsService {
  return import.meta.env.VITE_API_BASE_URL ? createApiFriendsService() : createMockFriendsService(demoGraph());
}
