import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  onAuthStateChanged,
  fetchSignInMethodsForEmail,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  GoogleAuthProvider,
  signInWithPopup,
  signInAnonymously,
  sendPasswordResetEmail,
  signOut as fbSignOut,
  type Auth,
  type User,
} from 'firebase/auth';
import { ApiError } from '@boardingpass/core';
import type { AuthUser } from '@boardingpass/types';
import type { AuthProvider, RegisterData } from '../provider';

function firebaseConfig() {
  const e = import.meta.env;
  return {
    apiKey: e.VITE_FIREBASE_API_KEY as string,
    authDomain: e.VITE_FIREBASE_AUTH_DOMAIN as string,
    projectId: e.VITE_FIREBASE_PROJECT_ID as string,
    storageBucket: e.VITE_FIREBASE_STORAGE_BUCKET as string | undefined,
    messagingSenderId: e.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
    appId: e.VITE_FIREBASE_APP_ID as string,
  };
}

function toAuthUser(u: User | null): AuthUser | null {
  if (!u) return null;
  // Global role comes from backend custom claims (US-016); default USER until
  // the session exchange (US-001-BE) returns the authoritative role.
  return {
    uid: u.uid,
    email: u.email,
    displayName: u.displayName,
    isAnonymous: u.isAnonymous,
    role: 'USER',
  };
}

function mapError(err: unknown): ApiError {
  const code = (err as { code?: string })?.code ?? '';
  if (['auth/wrong-password', 'auth/user-not-found', 'auth/invalid-credential'].includes(code)) {
    return new ApiError({ code: 'INVALID_CREDENTIALS', message: 'بيانات الدخول غير صحيحة', messageEn: 'Invalid credentials' });
  }
  if (code === 'auth/email-already-in-use') {
    return new ApiError({ code: 'EMAIL_EXISTS', message: 'هذا البريد مسجّل مسبقًا', messageEn: 'Email already registered' });
  }
  if (code === 'auth/too-many-requests') {
    return new ApiError({ code: 'RATE_LIMITED', message: 'محاولات كثيرة، حاول لاحقًا', messageEn: 'Too many attempts, try later' });
  }
  return new ApiError({ code: 'AUTH_ERROR', message: 'تعذّر إتمام العملية', messageEn: 'Could not complete the request' });
}

export function createFirebaseAuthProvider(): AuthProvider {
  const app: FirebaseApp = getApps()[0] ?? initializeApp(firebaseConfig());
  const auth: Auth = getAuth(app);

  return {
    subscribe(cb) {
      return onAuthStateChanged(auth, (u) => cb(toAuthUser(u)));
    },
    async checkEmailRegistered(email) {
      try {
        const methods = await fetchSignInMethodsForEmail(auth, email.trim().toLowerCase());
        return methods.length > 0;
      } catch (e) {
        throw mapError(e);
      }
    },
    async signInWithPassword(email, password) {
      try {
        await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
      } catch (e) {
        throw mapError(e);
      }
    },
    async register(data: RegisterData) {
      try {
        const cred = await createUserWithEmailAndPassword(auth, data.email.trim().toLowerCase(), data.password);
        const name = `${data.firstName} ${data.lastName}`.trim();
        if (name) await updateProfile(cred.user, { displayName: name });
        // The backend session exchange (US-001-BE) persists profile + phone.
      } catch (e) {
        throw mapError(e);
      }
    },
    async signInWithGoogle() {
      try {
        await signInWithPopup(auth, new GoogleAuthProvider());
      } catch (e) {
        throw mapError(e);
      }
    },
    async signInAsGuest() {
      try {
        await signInAnonymously(auth);
      } catch (e) {
        throw mapError(e);
      }
    },
    async sendPasswordReset(email) {
      try {
        await sendPasswordResetEmail(auth, email.trim().toLowerCase());
      } catch (e) {
        throw mapError(e);
      }
    },
    async signOut() {
      await fbSignOut(auth);
    },
  };
}
