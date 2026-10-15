import { loadJSON, persistAfter } from '@/shared/persist';
import { createApiClient } from '@boardingpass/core';
import { db, currentUser, firebaseEnabled } from '@/shared/firebase';
import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  query, where, arrayUnion, serverTimestamp,
} from 'firebase/firestore';
import { FriendsError, normalizeHandle, type Friend, type FriendRequest, type Graph } from './friendsModel';
import { normalizeUsername, phoneKey } from '@/features/profile/profileModel';

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
export function createMockFriendsService(seed?: Graph, persistKey?: string): FriendsService {
  const init = persistKey ? loadJSON<Graph>(persistKey, seed ?? { friends: [], incoming: [] }) : (seed ?? { friends: [], incoming: [] });
  const friends: Friend[] = init.friends.map((f) => ({ ...f }));
  let incoming: FriendRequest[] = init.incoming.map((r) => ({ ...r }));
  const tick = () => new Promise<void>((r) => setTimeout(r, 0));
  const snap = (): Graph => ({ friends: friends.map((f) => ({ ...f })), incoming: incoming.map((r) => ({ ...r })) });

  const base: FriendsService = {
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
  return persistAfter(base, persistKey, snap);
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

/** Firestore-backed friends: real, cross-user social graph. Users are found by
 *  username or phone (via the public `usernames` / `phones` lookup docs, with
 *  email as a fallback); a request lives at friendRequests/`${fromUid}_${toUid}`;
 *  an accepted friendship is one doc per pair at
 *  friendships/`${sortedUidA}_${sortedUidB}` holding both parties' name + handle. */
export function createFirestoreFriendsService(): FriendsService {
  const me = () => {
    const u = currentUser();
    if (!u) throw new FriendsError('GENERIC');
    return u;
  };
  const pairId = (a: string, b: string) => [a, b].sort().join('_');
  const reqId = (from: string, to: string) => `${from}_${to}`;
  // My own public handle (username) for display on the other side; self-read ok.
  const myHandle = async (uid: string): Promise<string> => {
    try { return normalizeUsername(((await getDoc(doc(db(), 'users', uid))).data() as { username?: string })?.username ?? ''); }
    catch { return ''; }
  };
  // Resolve a typed handle (username / phone / email) to a lookup doc.
  const resolve = async (handle: string): Promise<{ uid: string; name: string; username: string } | null> => {
    const raw = (handle ?? '').trim();
    if (!raw) return null;
    const stripped = raw.replace(/[\s()\-]/g, '');
    let ref;
    if (/^\+?\d{9,}$/.test(stripped)) { const pk = phoneKey(stripped); if (!pk) return null; ref = doc(db(), 'phones', pk); }
    else if (raw.includes('@') && raw.includes('.')) ref = doc(db(), 'emailIndex', raw.toLowerCase());
    else { const un = normalizeUsername(raw); if (!un) return null; ref = doc(db(), 'usernames', un); }
    const s = await getDoc(ref);
    if (!s.exists()) return null;
    const d = s.data() as { uid: string; name?: string; username?: string };
    return { uid: d.uid, name: d.name ?? raw, username: d.username ?? '' };
  };

  async function snapshot(): Promise<Graph> {
    const u = me();
    const [fs, rs] = await Promise.all([
      getDocs(query(collection(db(), 'friendships'), where('uids', 'array-contains', u.uid))),
      getDocs(query(collection(db(), 'friendRequests'), where('toUid', '==', u.uid))),
    ]);
    const friends: Friend[] = fs.docs.map((d) => {
      const data = d.data() as { uids: string[]; profiles?: Record<string, { name?: string; username?: string }> };
      const other = data.uids.find((x) => x !== u.uid) ?? '';
      const p = data.profiles?.[other] ?? {};
      return { id: other, name: p.name ?? other, username: p.username ?? '' };
    });
    const incoming: FriendRequest[] = rs.docs.map((d) => {
      const data = d.data() as { fromName?: string; fromUsername?: string; fromUid: string };
      return { id: d.id, name: data.fromName ?? data.fromUid, username: data.fromUsername ?? '' };
    });
    return { friends, incoming };
  }

  return {
    getGraph: () => snapshot(),

    async sendRequest(handle) {
      const u = me();
      const target = await resolve(handle);
      if (!target) throw new FriendsError('NO_USER');
      const { uid: toUid, name: toName, username: toUsername } = target;
      if (toUid === u.uid) throw new FriendsError('SELF');
      if ((await getDoc(doc(db(), 'friendships', pairId(u.uid, toUid)))).exists()) throw new FriendsError('ALREADY_FRIEND');
      const [out, inc] = await Promise.all([
        getDoc(doc(db(), 'friendRequests', reqId(u.uid, toUid))),
        getDoc(doc(db(), 'friendRequests', reqId(toUid, u.uid))),
      ]);
      if (out.exists() || inc.exists()) throw new FriendsError('PENDING');
      await setDoc(doc(db(), 'friendRequests', reqId(u.uid, toUid)), {
        fromUid: u.uid, fromName: u.name, fromUsername: await myHandle(u.uid),
        toUid, toName, toUsername, createdAt: serverTimestamp(),
      });
      return snapshot();
    },

    async acceptRequest(id) {
      const u = me();
      const rref = doc(db(), 'friendRequests', id);
      const rs = await getDoc(rref);
      if (!rs.exists()) throw new FriendsError('NOT_FOUND');
      const r = rs.data() as { fromUid: string; fromName?: string; fromUsername?: string; toUid: string };
      if (r.toUid !== u.uid) throw new FriendsError('NOT_FOUND');
      await setDoc(doc(db(), 'friendships', pairId(r.fromUid, u.uid)), {
        uids: [r.fromUid, u.uid].sort(),
        profiles: {
          [r.fromUid]: { name: r.fromName ?? r.fromUid, username: r.fromUsername ?? '' },
          [u.uid]: { name: u.name, username: await myHandle(u.uid) },
        },
        createdAt: serverTimestamp(),
      });
      await deleteDoc(rref).catch(() => { /* already gone */ });
      return snapshot();
    },

    async rejectRequest(id) {
      await deleteDoc(doc(db(), 'friendRequests', id)).catch(() => { /* already gone */ });
      return snapshot();
    },

    async removeFriend(friendUid) {
      const u = me();
      await deleteDoc(doc(db(), 'friendships', pairId(u.uid, friendUid))).catch(() => { /* already gone */ });
      return snapshot();
    },

    async inviteToTrip(friendUid, tripId) {
      const u = me();
      let name = '';
      try {
        const fs = await getDoc(doc(db(), 'friendships', pairId(u.uid, friendUid)));
        name = ((fs.data() as { profiles?: Record<string, { name?: string }> })?.profiles?.[friendUid]?.name) ?? '';
      } catch { /* best-effort name */ }
      await updateDoc(doc(db(), 'trips', tripId), { memberUids: arrayUnion(friendUid) }).catch(() => { /* owner-only */ });
      await setDoc(doc(db(), 'trips', tripId, 'members', friendUid),
        { displayName: name, role: 'MEMBER', status: 'PENDING', invitedAt: serverTimestamp() },
        { merge: true }).catch(() => { /* owner-only */ });
    },
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
  if (firebaseEnabled()) return createFirestoreFriendsService();
  return import.meta.env.VITE_API_BASE_URL ? createApiFriendsService() : createMockFriendsService(demoGraph(), 'bp.friends.v1');
}
