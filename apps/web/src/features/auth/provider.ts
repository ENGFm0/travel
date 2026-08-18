import type { AuthUser } from '@boardingpass/types';

/** Auth provider abstraction (US-001). A mock implementation powers dev/tests;
 *  the Firebase implementation (loaded only when configured) powers production.
 *  The backend remains the security authority (server-side ID-token validation
 *  + role claims); this client layer is UX + session bootstrapping only. */

export interface RegisterData {
  firstName: string;
  lastName: string;
  middleName?: string;
  email: string;
  phone?: string;
  password: string;
}

export interface AuthProvider {
  /** Subscribe to auth-state changes; returns an unsubscribe fn. */
  subscribe(cb: (user: AuthUser | null) => void): () => void;
  /** Route step-1: is this email already registered? */
  checkEmailRegistered(email: string): Promise<boolean>;
  signInWithPassword(email: string, password: string): Promise<void>;
  register(data: RegisterData): Promise<void>;
  signInWithGoogle(): Promise<void>;
  signInAsGuest(): Promise<void>;
  sendPasswordReset(email: string): Promise<void>;
  signOut(): Promise<void>;
}

/** Selects the provider: Firebase when configured (env), else the mock.
 *  Firebase is dynamically imported so it never enters the main bundle or tests
 *  unless real config is present. */
export async function createAuthProvider(): Promise<AuthProvider> {
  if (import.meta.env.VITE_FIREBASE_API_KEY) {
    const { createFirebaseAuthProvider } = await import('./providers/firebaseAuthProvider');
    return createFirebaseAuthProvider();
  }
  const { createMockAuthProvider } = await import('./providers/mockAuthProvider');
  return createMockAuthProvider();
}
