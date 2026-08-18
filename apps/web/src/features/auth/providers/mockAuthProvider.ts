import { ApiError } from '@boardingpass/core';
import type { AuthUser } from '@boardingpass/types';
import type { AuthProvider, RegisterData } from '../provider';

/** In-memory auth for dev/tests (no network). Mirrors the flows the Firebase
 *  provider implements. NOT a security boundary. */
export function createMockAuthProvider(): AuthProvider {
  const users = new Map<string, { password: string; user: AuthUser }>();
  // seed one registered account (matches the prototype's demo)
  users.set('user@example.com', {
    password: 'password1',
    user: {
      uid: 'seed-user',
      email: 'user@example.com',
      displayName: 'Demo User',
      isAnonymous: false,
      role: 'USER',
    },
  });

  let current: AuthUser | null = null;
  const listeners = new Set<(u: AuthUser | null) => void>();
  const emit = () => listeners.forEach((cb) => cb(current));

  const delay = () => new Promise<void>((r) => setTimeout(r, 0));

  return {
    subscribe(cb) {
      listeners.add(cb);
      cb(current); // emit initial
      return () => listeners.delete(cb);
    },
    async checkEmailRegistered(email) {
      await delay();
      return users.has(email.trim().toLowerCase());
    },
    async signInWithPassword(email, password) {
      await delay();
      const rec = users.get(email.trim().toLowerCase());
      if (!rec || rec.password !== password) {
        throw new ApiError({ code: 'INVALID_CREDENTIALS', message: 'بيانات الدخول غير صحيحة', messageEn: 'Invalid credentials' });
      }
      current = rec.user;
      emit();
    },
    async register(data: RegisterData) {
      await delay();
      const email = data.email.trim().toLowerCase();
      if (users.has(email)) {
        throw new ApiError({ code: 'EMAIL_EXISTS', message: 'هذا البريد مسجّل مسبقًا', messageEn: 'Email already registered' });
      }
      const user: AuthUser = {
        uid: `u-${crypto.randomUUID()}`,
        email,
        displayName: `${data.firstName} ${data.lastName}`.trim(),
        isAnonymous: false,
        role: 'USER',
      };
      users.set(email, { password: data.password, user });
      current = user;
      emit();
    },
    async signInWithGoogle() {
      await delay();
      current = {
        uid: 'google-user',
        email: 'google.user@example.com',
        displayName: 'Google User',
        isAnonymous: false,
        role: 'USER',
      };
      emit();
    },
    async signInAsGuest() {
      await delay();
      current = { uid: `guest-${crypto.randomUUID()}`, email: null, displayName: null, isAnonymous: true, role: 'USER' };
      emit();
    },
    async sendPasswordReset(_email) {
      await delay();
      // no-op in mock; UI shows "reset sent"
    },
    async signOut() {
      await delay();
      current = null;
      emit();
    },
  };
}
