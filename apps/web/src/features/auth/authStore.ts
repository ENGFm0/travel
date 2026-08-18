import { create } from 'zustand';
import type { AuthUser, AuthStatus } from '@boardingpass/types';
import type { AuthProvider, RegisterData } from './provider';
import { createAuthProvider } from './provider';

interface AuthStore {
  status: AuthStatus;
  user: AuthUser | null;
  provider: AuthProvider | null;
  modalOpen: boolean;
  setProvider: (p: AuthProvider) => void;
  openAuth: () => void;
  closeAuth: () => void;
  _onUser: (u: AuthUser | null) => void;
}

let unsub: (() => void) | null = null;

export const useAuthStore = create<AuthStore>((set, get) => ({
  status: 'loading',
  user: null,
  provider: null,
  modalOpen: false,
  setProvider: (p) => {
    if (unsub) unsub();
    set({ provider: p });
    unsub = p.subscribe((u) => get()._onUser(u));
  },
  openAuth: () => set({ modalOpen: true }),
  closeAuth: () => set({ modalOpen: false }),
  _onUser: (u) => {
    const status: AuthStatus = u ? (u.isAnonymous ? 'guest' : 'authenticated') : 'unauthenticated';
    set({ user: u, status, ...(u ? { modalOpen: false } : {}) });
  },
}));

/** Bootstraps the provider (Firebase when configured, else mock) once. */
export async function initAuth(): Promise<void> {
  if (useAuthStore.getState().provider) return;
  const p = await createAuthProvider();
  useAuthStore.getState().setProvider(p);
}

// ── Selector hooks ────────────────────────────────────────────────────────────
export function useAuth() {
  const status = useAuthStore((s) => s.status);
  const user = useAuthStore((s) => s.user);
  const modalOpen = useAuthStore((s) => s.modalOpen);
  const openAuth = useAuthStore((s) => s.openAuth);
  const closeAuth = useAuthStore((s) => s.closeAuth);
  return {
    status,
    user,
    modalOpen,
    openAuth,
    closeAuth,
    isAuthenticated: status === 'authenticated',
    isGuest: status === 'guest',
  };
}

function requireProvider(): AuthProvider {
  const p = useAuthStore.getState().provider;
  if (!p) throw new Error('Auth provider not initialized');
  return p;
}

/** Imperative auth actions (call the provider; state updates via subscription). */
export const authActions = {
  checkEmail: (email: string) => requireProvider().checkEmailRegistered(email),
  signIn: (email: string, password: string) => requireProvider().signInWithPassword(email, password),
  register: (data: RegisterData) => requireProvider().register(data),
  google: () => requireProvider().signInWithGoogle(),
  guest: () => requireProvider().signInAsGuest(),
  reset: (email: string) => requireProvider().sendPasswordReset(email),
  signOut: () => requireProvider().signOut(),
};
