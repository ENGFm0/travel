import { createApiClient } from '@boardingpass/core';
import type { MemberRole } from '@boardingpass/types';
import { loadJSON, persistAfter } from '@/shared/persist';
import { db, firebaseEnabled } from '@/shared/firebase';
import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  arrayRemove, serverTimestamp, type DocumentData,
} from 'firebase/firestore';

export type MemberStatus = 'ACTIVE' | 'PENDING' | 'DECLINED';

export interface Member {
  uid: string;
  displayName: string;
  handle?: string; // phone/username shown in the list
  role: MemberRole;
  status: MemberStatus;
}

export interface InvitePayload {
  name: string;
  handle?: string; // phone (E.164) or username
}

/** Error codes surfaced to the UI (mapped to i18n). */
export type MembersErrorCode =
  | 'ALREADY_MEMBER'
  | 'OWNER_MUST_TRANSFER'
  | 'NOT_FOUND'
  | 'GENERIC';

export class MembersError extends Error {
  code: MembersErrorCode;
  constructor(code: MembersErrorCode) {
    super(code);
    this.code = code;
  }
}

export interface MembersService {
  list(tripId: string): Promise<Member[]>;
  invite(tripId: string, payload: InvitePayload): Promise<Member>;
  setRole(tripId: string, uid: string, role: MemberRole): Promise<void>;
  remove(tripId: string, uid: string): Promise<void>;
  transferOwnership(tripId: string, uid: string): Promise<void>;
  /** Current user leaves; owner with other members is blocked (BR-009-002). */
  leave(tripId: string, uid: string): Promise<void>;
  acceptInvite(tripId: string, uid: string): Promise<void>;
  declineInvite(tripId: string, uid: string): Promise<void>;
  /** Capability link — requires login + accept to actually join (BR-009-003). */
  inviteLink(tripId: string): Promise<string>;
}

export const CURRENT_UID = 'me';

/** In-memory members service for dev/tests. NOT a security boundary — the real
 *  service enforces one-owner, owner-only management, and tenant isolation. */
export function createMockMembersService(seed?: Record<string, Member[]>, persistKey?: string): MembersService {
  const byTrip = new Map<string, Member[]>();
  const initial = persistKey ? loadJSON<Record<string, Member[]>>(persistKey, seed ?? {}) : (seed ?? {});
  for (const [k, v] of Object.entries(initial)) byTrip.set(k, v.map((m) => ({ ...m })));
  const tick = () => new Promise<void>((r) => setTimeout(r, 0));

  function ensure(tripId: string): Member[] {
    let list = byTrip.get(tripId);
    if (!list) {
      list = [{ uid: CURRENT_UID, displayName: 'أنت', role: 'OWNER', status: 'ACTIVE' }];
      byTrip.set(tripId, list);
    }
    return list;
  }

  const base: MembersService = {
    async list(tripId) {
      await tick();
      return ensure(tripId).map((m) => ({ ...m }));
    },
    async invite(tripId, payload) {
      await tick();
      const list = ensure(tripId);
      const handle = payload.handle?.trim();
      if (handle && list.some((m) => m.handle === handle)) throw new MembersError('ALREADY_MEMBER');
      const member: Member = {
        uid: `m-${crypto.randomUUID()}`,
        displayName: payload.name.trim(),
        handle,
        role: 'MEMBER',
        status: 'PENDING',
      };
      list.push(member);
      return { ...member };
    },
    async setRole(tripId, uid, role) {
      await tick();
      const m = ensure(tripId).find((x) => x.uid === uid);
      if (!m) throw new MembersError('NOT_FOUND');
      if (m.role === 'OWNER') throw new MembersError('GENERIC'); // change owner via transfer
      m.role = role;
    },
    async remove(tripId, uid) {
      await tick();
      const list = ensure(tripId);
      const idx = list.findIndex((x) => x.uid === uid);
      if (idx >= 0) list.splice(idx, 1);
    },
    async transferOwnership(tripId, uid) {
      await tick();
      const list = ensure(tripId);
      const target = list.find((x) => x.uid === uid && x.status === 'ACTIVE');
      const owner = list.find((x) => x.role === 'OWNER');
      if (!target) throw new MembersError('NOT_FOUND');
      if (owner) owner.role = 'MEMBER';
      target.role = 'OWNER'; // exactly one owner remains (BR-009-001)
    },
    async leave(tripId, uid) {
      await tick();
      const list = ensure(tripId);
      const me = list.find((x) => x.uid === uid);
      if (!me) return;
      const others = list.filter((x) => x.uid !== uid && x.status === 'ACTIVE');
      if (me.role === 'OWNER' && others.length > 0) throw new MembersError('OWNER_MUST_TRANSFER');
      const idx = list.findIndex((x) => x.uid === uid);
      list.splice(idx, 1);
    },
    async acceptInvite(tripId, uid) {
      await tick();
      const m = ensure(tripId).find((x) => x.uid === uid);
      if (m) m.status = 'ACTIVE';
    },
    async declineInvite(tripId, uid) {
      await tick();
      const list = ensure(tripId);
      const idx = list.findIndex((x) => x.uid === uid);
      if (idx >= 0) list.splice(idx, 1);
    },
    async inviteLink(tripId) {
      await tick();
      // Opaque, single-trip token. The real server issues/rotates/expires it and
      // requires auth on open (BR-009-003/006). Deterministic here for tests.
      return `${origin()}/join/${tripId}`;
    },
  };
  return persistAfter(base, persistKey, () => Object.fromEntries(byTrip));
}

function origin(): string {
  try {
    return globalThis.location?.origin ?? 'https://boardingpass.app';
  } catch {
    return 'https://boardingpass.app';
  }
}

export function createApiMembersService(getToken?: () => string | undefined): MembersService {
  const base = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api/v1';
  const client = createApiClient({ baseUrl: base, getToken });
  return {
    list: (tripId) => client.apiFetch<Member[]>(`/trips/${tripId}/members`),
    invite: (tripId, payload) =>
      client.apiFetch<Member>(`/trips/${tripId}/invitations`, { method: 'POST', body: JSON.stringify(payload) }),
    async setRole(tripId, uid, role) {
      await client.apiFetch<void>(`/trips/${tripId}/members/${uid}`, { method: 'PATCH', body: JSON.stringify({ role }) });
    },
    async remove(tripId, uid) {
      await client.apiFetch<void>(`/trips/${tripId}/members/${uid}`, { method: 'DELETE' });
    },
    async transferOwnership(tripId, uid) {
      await client.apiFetch<void>(`/trips/${tripId}/members/${uid}`, { method: 'PATCH', body: JSON.stringify({ transferOwnership: true }) });
    },
    async leave(tripId, uid) {
      await client.apiFetch<void>(`/trips/${tripId}/members/${uid}`, { method: 'DELETE' });
    },
    async acceptInvite(tripId, uid) {
      await client.apiFetch<void>(`/trips/${tripId}/invitations/${uid}/accept`, { method: 'POST' });
    },
    async declineInvite(tripId, uid) {
      await client.apiFetch<void>(`/trips/${tripId}/invitations/${uid}/decline`, { method: 'POST' });
    },
    async inviteLink(tripId) {
      const r = await client.apiFetch<{ url: string }>(`/trips/${tripId}/invite-link`, { method: 'POST' });
      return r.url;
    },
  };
}

/** Firestore-backed members service. Members live at trips/{tripId}/members/{id};
 *  a real member's doc id is their uid (also in the trip's memberUids for access),
 *  a name-only invite is a PENDING doc with a generated id (display-only until a
 *  real join flow lands). Owner-only management is enforced by the rules. */
export function createFirestoreMembersService(): MembersService {
  const col = (tripId: string) => collection(db(), 'trips', tripId, 'members');
  const toMember = (id: string, d: DocumentData): Member => ({
    uid: id,
    displayName: d.displayName ?? 'مسافر',
    handle: d.handle,
    role: d.role ?? 'MEMBER',
    status: d.status ?? 'ACTIVE',
  });

  return {
    async list(tripId) {
      const snap = await getDocs(col(tripId));
      return snap.docs.map((d) => toMember(d.id, d.data()));
    },
    async invite(tripId, payload) {
      const handle = payload.handle?.trim();
      const existing = await getDocs(col(tripId));
      if (handle && existing.docs.some((d) => d.data().handle === handle)) throw new MembersError('ALREADY_MEMBER');
      const id = `pending-${crypto.randomUUID()}`;
      const member = { displayName: payload.name.trim(), handle: handle ?? null, role: 'MEMBER' as MemberRole, status: 'PENDING' as MemberStatus };
      await setDoc(doc(col(tripId), id), { ...member, invitedAt: serverTimestamp() });
      return { uid: id, ...member, handle };
    },
    async setRole(tripId, uid, role) {
      const s = await getDoc(doc(col(tripId), uid));
      if (!s.exists()) throw new MembersError('NOT_FOUND');
      if (s.data().role === 'OWNER') throw new MembersError('GENERIC');
      await updateDoc(doc(col(tripId), uid), { role });
    },
    async remove(tripId, uid) {
      await deleteDoc(doc(col(tripId), uid));
      await updateDoc(doc(db(), 'trips', tripId), { memberUids: arrayRemove(uid) }).catch(() => {});
    },
    async transferOwnership(tripId, uid) {
      const snap = await getDocs(col(tripId));
      const target = snap.docs.find((d) => d.id === uid && d.data().status === 'ACTIVE');
      const owner = snap.docs.find((d) => d.data().role === 'OWNER');
      if (!target) throw new MembersError('NOT_FOUND');
      if (owner) await updateDoc(doc(col(tripId), owner.id), { role: 'MEMBER' });
      await updateDoc(doc(col(tripId), uid), { role: 'OWNER' });
      await updateDoc(doc(db(), 'trips', tripId), { ownerUid: uid }).catch(() => {});
    },
    async leave(tripId, uid) {
      const snap = await getDocs(col(tripId));
      const me = snap.docs.find((d) => d.id === uid);
      if (!me) return;
      const others = snap.docs.filter((d) => d.id !== uid && d.data().status === 'ACTIVE');
      if (me.data().role === 'OWNER' && others.length > 0) throw new MembersError('OWNER_MUST_TRANSFER');
      await deleteDoc(doc(col(tripId), uid));
      await updateDoc(doc(db(), 'trips', tripId), { memberUids: arrayRemove(uid) }).catch(() => {});
    },
    async acceptInvite(tripId, uid) {
      await updateDoc(doc(col(tripId), uid), { status: 'ACTIVE' });
    },
    async declineInvite(tripId, uid) {
      await deleteDoc(doc(col(tripId), uid));
    },
    async inviteLink(tripId) {
      return `${origin()}/join/${tripId}`;
    },
  };
}

export function createMembersService(): MembersService {
  if (firebaseEnabled()) return createFirestoreMembersService();
  return import.meta.env.VITE_API_BASE_URL ? createApiMembersService() : createMockMembersService(undefined, 'bp.members.v1');
}
