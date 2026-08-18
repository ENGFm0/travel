import { create } from 'zustand';
import type { MemberRole } from '@boardingpass/types';
import type { InvitePayload, Member, MembersErrorCode, MembersService } from './membersService';
import { MembersError, createMembersService } from './membersService';

interface MembersStore {
  service: MembersService | null;
  tripId: string | null;
  members: Member[] | null; // null = not loaded
  loading: boolean;
  error: MembersErrorCode | null;
  setService: (s: MembersService) => void;
  _set: (p: Partial<MembersStore>) => void;
}

export const useMembersStore = create<MembersStore>((set) => ({
  service: null,
  tripId: null,
  members: null,
  loading: false,
  error: null,
  setService: (service) => set({ service }),
  _set: (p) => set(p),
}));

export function initMembers(): void {
  if (!useMembersStore.getState().service) {
    useMembersStore.getState().setService(createMembersService());
  }
}

export function useMembers() {
  const members = useMembersStore((s) => s.members);
  const loading = useMembersStore((s) => s.loading);
  const error = useMembersStore((s) => s.error);
  const tripId = useMembersStore((s) => s.tripId);
  return { members, loading, error, tripId };
}

function svc(): MembersService {
  const s = useMembersStore.getState().service;
  if (!s) throw new Error('Members service not initialized');
  return s;
}

async function reload(tripId: string): Promise<void> {
  const list = await svc().list(tripId);
  useMembersStore.getState()._set({ members: list });
}

/** Runs a mutation, refreshes the list, and surfaces a typed error code. */
async function run(tripId: string, fn: () => Promise<unknown>): Promise<boolean> {
  useMembersStore.getState()._set({ error: null });
  try {
    await fn();
    await reload(tripId);
    return true;
  } catch (e) {
    const code: MembersErrorCode = e instanceof MembersError ? e.code : 'GENERIC';
    useMembersStore.getState()._set({ error: code });
    return false;
  }
}

export const membersActions = {
  async load(tripId: string): Promise<void> {
    useMembersStore.getState()._set({ tripId, loading: true, error: null });
    try {
      const list = await svc().list(tripId);
      useMembersStore.getState()._set({ members: list });
    } catch {
      useMembersStore.getState()._set({ error: 'GENERIC' });
    } finally {
      useMembersStore.getState()._set({ loading: false });
    }
  },
  invite: (tripId: string, p: InvitePayload) => run(tripId, () => svc().invite(tripId, p)),
  setRole: (tripId: string, uid: string, role: MemberRole) => run(tripId, () => svc().setRole(tripId, uid, role)),
  remove: (tripId: string, uid: string) => run(tripId, () => svc().remove(tripId, uid)),
  transfer: (tripId: string, uid: string) => run(tripId, () => svc().transferOwnership(tripId, uid)),
  leave: (tripId: string, uid: string) => run(tripId, () => svc().leave(tripId, uid)),
  accept: (tripId: string, uid: string) => run(tripId, () => svc().acceptInvite(tripId, uid)),
  decline: (tripId: string, uid: string) => run(tripId, () => svc().declineInvite(tripId, uid)),
  inviteLink: (tripId: string) => svc().inviteLink(tripId),
  reset: () => useMembersStore.getState()._set({ tripId: null, members: null, error: null }),
};
