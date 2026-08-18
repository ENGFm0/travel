import { create } from 'zustand';
import type { NotifPrefs, Profile } from './profileModel';
import type { ProfileSeed, ProfileService, ProfileErrorCode } from './profileService';
import { ProfileError, createProfileService } from './profileService';

interface ProfileStore {
  service: ProfileService | null;
  profile: Profile | null;
  loading: boolean;
  error: ProfileErrorCode | null;
  setService: (s: ProfileService) => void;
  _set: (p: Partial<ProfileStore>) => void;
}

export const useProfileStore = create<ProfileStore>((set) => ({
  service: null,
  profile: null,
  loading: false,
  error: null,
  setService: (service) => set({ service }),
  _set: (p) => set(p),
}));

export function initProfile(): void {
  if (!useProfileStore.getState().service) {
    useProfileStore.getState().setService(createProfileService());
  }
}

export function useProfile() {
  const profile = useProfileStore((s) => s.profile);
  const loading = useProfileStore((s) => s.loading);
  const error = useProfileStore((s) => s.error);
  return { profile, loading, error };
}

function svc(): ProfileService {
  const s = useProfileStore.getState().service;
  if (!s) throw new Error('Profile service not initialized');
  return s;
}

let uid = '';
async function apply(fn: () => Promise<Profile>): Promise<boolean> {
  useProfileStore.getState()._set({ error: null });
  try {
    const profile = await fn();
    useProfileStore.getState()._set({ profile });
    return true;
  } catch (e) {
    useProfileStore.getState()._set({ error: e instanceof ProfileError ? e.code : 'GENERIC' });
    return false;
  }
}

export const profileActions = {
  async load(seed: ProfileSeed): Promise<void> {
    uid = seed.uid;
    useProfileStore.getState()._set({ loading: true, error: null });
    try {
      const profile = await svc().getProfile(seed);
      useProfileStore.getState()._set({ profile });
    } catch {
      useProfileStore.getState()._set({ error: 'GENERIC' });
    } finally {
      useProfileStore.getState()._set({ loading: false });
    }
  },
  update: (patch: Partial<Profile>) => apply(() => svc().updateProfile(uid, patch)),
  updateNotif: (notif: NotifPrefs) => apply(() => svc().updateNotif(uid, notif)),
  uploadAvatar: (url: string) => apply(() => svc().uploadAvatar(uid, url)),
  async deleteAccount(): Promise<boolean> {
    useProfileStore.getState()._set({ error: null });
    try {
      await svc().deleteAccount(uid);
      return true;
    } catch (e) {
      useProfileStore.getState()._set({ error: e instanceof ProfileError ? e.code : 'GENERIC' });
      return false;
    }
  },
  reset: () => { uid = ''; useProfileStore.getState()._set({ profile: null, error: null }); },
};
