import { loadJSON, persistAfter } from '@/shared/persist';
import { createApiClient } from '@boardingpass/core';
import { defaultPrefs, type NotifPrefs, type Profile } from './profileModel';
import { db, firebaseEnabled } from '@/shared/firebase';
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';

export interface ProfileSeed {
  uid: string;
  email: string;
  displayName?: string | null;
}

export type ProfileErrorCode = 'OWNER_TRANSFER_REQUIRED' | 'GENERIC';
export class ProfileError extends Error {
  code: ProfileErrorCode;
  constructor(code: ProfileErrorCode) { super(code); this.code = code; }
}

export interface ProfileService {
  getProfile(seed: ProfileSeed): Promise<Profile>;
  updateProfile(uid: string, patch: Partial<Profile>): Promise<Profile>;
  updateNotif(uid: string, notif: NotifPrefs): Promise<Profile>;
  uploadAvatar(uid: string, url: string): Promise<Profile>;
  deleteAccount(uid: string): Promise<void>;
}

function splitName(displayName?: string | null): { firstName: string; lastName: string } {
  const parts = (displayName ?? '').trim().split(/\s+/).filter(Boolean);
  return { firstName: parts[0] ?? '', lastName: parts.length > 1 ? parts[parts.length - 1] : '' };
}

/** In-memory profile service for dev/tests. NOT a security boundary — the server
 *  enforces self-only access, validates input, and computes the delete blocker. */
export function createMockProfileService(opts?: { blockedUids?: string[]; seedProfiles?: Record<string, Partial<Profile>>; persistKey?: string }): ProfileService {
  const profiles = new Map<string, Profile>();
  const persistKey = opts?.persistKey;
  if (persistKey) {
    const saved = loadJSON<Record<string, Profile>>(persistKey, {});
    for (const [k, v] of Object.entries(saved)) profiles.set(k, v);
  }
  const blocked = new Set(opts?.blockedUids ?? []);
  const tick = () => new Promise<void>((r) => setTimeout(r, 0));

  function ensure(seed: ProfileSeed): Profile {
    let p = profiles.get(seed.uid);
    if (!p) {
      const { firstName, lastName } = splitName(seed.displayName);
      p = {
        uid: seed.uid, firstName, middleName: '', lastName,
        email: seed.email, phone: '', avatarUrl: '', notif: defaultPrefs(),
        ...opts?.seedProfiles?.[seed.uid],
      };
      profiles.set(seed.uid, p);
    }
    return p;
  }

  const base: ProfileService = {
    async getProfile(seed) { await tick(); return { ...ensure(seed) }; },
    async updateProfile(uid, patch) {
      await tick();
      const p = profiles.get(uid); if (!p) throw new ProfileError('GENERIC');
      Object.assign(p, patch, { uid: p.uid, email: p.email }); // uid/email immutable
      return { ...p };
    },
    async updateNotif(uid, notif) {
      await tick();
      const p = profiles.get(uid); if (!p) throw new ProfileError('GENERIC');
      p.notif = { ...notif };
      return { ...p };
    },
    async uploadAvatar(uid, url) {
      await tick();
      const p = profiles.get(uid); if (!p) throw new ProfileError('GENERIC');
      p.avatarUrl = url;
      return { ...p };
    },
    async deleteAccount(uid) {
      await tick();
      if (blocked.has(uid)) throw new ProfileError('OWNER_TRANSFER_REQUIRED');
      profiles.delete(uid);
    },
  };
  return persistAfter(base, persistKey, () => Object.fromEntries(profiles));
}

export function createApiProfileService(getToken?: () => string | undefined): ProfileService {
  const base = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api/v1';
  const client = createApiClient({ baseUrl: base, getToken });
  return {
    getProfile: () => client.apiFetch<Profile>('/users/me'),
    updateProfile: (_uid, patch) => client.apiFetch<Profile>('/users/me', { method: 'PATCH', body: JSON.stringify(patch) }),
    updateNotif: (_uid, notif) => client.apiFetch<Profile>('/users/me', { method: 'PATCH', body: JSON.stringify({ notif }) }),
    uploadAvatar: (_uid, url) => client.apiFetch<Profile>('/users/me/avatar', { method: 'POST', body: JSON.stringify({ url }) }),
    deleteAccount: async () => { await client.apiFetch<void>('/users/me', { method: 'DELETE' }); },
  };
}

/** Firestore-backed profile at users/{uid} (self read/write per rules). uid and
 *  email are immutable (never written from a patch). */
export function createFirestoreProfileService(): ProfileService {
  const ref = (uid: string) => doc(db(), 'users', uid);
  const readProfile = async (uid: string): Promise<Profile> => {
    const s = await getDoc(ref(uid));
    const d = (s.data() ?? {}) as Partial<Profile>;
    return {
      uid, firstName: d.firstName ?? '', middleName: d.middleName ?? '', lastName: d.lastName ?? '',
      email: d.email ?? '', phone: d.phone ?? '', country: d.country ?? undefined,
      avatarUrl: d.avatarUrl ?? '', notif: d.notif ?? defaultPrefs(),
    };
  };
  return {
    async getProfile(seed) {
      const s = await getDoc(ref(seed.uid));
      if (s.exists()) return readProfile(seed.uid);
      const { firstName, lastName } = splitName(seed.displayName);
      const p: Profile = { uid: seed.uid, firstName, middleName: '', lastName, email: seed.email, phone: '', avatarUrl: '', notif: defaultPrefs() };
      const { uid: _uid, ...rest } = p;
      await setDoc(ref(seed.uid), rest);
      return p;
    },
    async updateProfile(uid, patch) {
      const { uid: _u, email: _e, ...rest } = patch; // uid + email immutable
      await updateDoc(ref(uid), rest);
      return readProfile(uid);
    },
    async updateNotif(uid, notif) { await updateDoc(ref(uid), { notif }); return readProfile(uid); },
    async uploadAvatar(uid, url) { await updateDoc(ref(uid), { avatarUrl: url }); return readProfile(uid); },
    async deleteAccount(uid) { await deleteDoc(ref(uid)); },
  };
}

export function createProfileService(): ProfileService {
  if (firebaseEnabled()) return createFirestoreProfileService();
  return import.meta.env.VITE_API_BASE_URL ? createApiProfileService() : createMockProfileService({ persistKey: 'bp.profile.v1' });
}
