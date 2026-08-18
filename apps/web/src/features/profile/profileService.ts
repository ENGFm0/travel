import { createApiClient } from '@boardingpass/core';
import { defaultPrefs, type NotifPrefs, type Profile } from './profileModel';

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
export function createMockProfileService(opts?: { blockedUids?: string[]; seedProfiles?: Record<string, Partial<Profile>> }): ProfileService {
  const profiles = new Map<string, Profile>();
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

  return {
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

export function createProfileService(): ProfileService {
  return import.meta.env.VITE_API_BASE_URL ? createApiProfileService() : createMockProfileService();
}
