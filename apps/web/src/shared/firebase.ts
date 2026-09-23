import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';

/** Shared Firebase app/Firestore access for the data services. Config comes from
 *  the (public) VITE_FIREBASE_* build env; when it's absent the app runs on the
 *  in-memory mock services instead (dev/tests). */
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

/** True when real Firebase is configured — the data services then use Firestore. */
export function firebaseEnabled(): boolean {
  return Boolean(import.meta.env.VITE_FIREBASE_API_KEY);
}

export function getFirebaseApp(): FirebaseApp {
  return getApps()[0] ?? initializeApp(firebaseConfig());
}

export function db(): Firestore {
  return getFirestore(getFirebaseApp());
}

/** The signed-in user's uid, or null. Data services read this at call time so
 *  they always use the current session's identity. */
export function currentUid(): string | null {
  return getAuth(getFirebaseApp()).currentUser?.uid ?? null;
}

/** The signed-in user's display name / email, for seeding member/profile docs. */
export function currentUser(): { uid: string; name: string; email: string | null } | null {
  const u = getAuth(getFirebaseApp()).currentUser;
  if (!u) return null;
  return { uid: u.uid, name: u.displayName ?? (u.email ?? 'مسافر'), email: u.email };
}

export function requireUid(): string {
  const uid = currentUid();
  if (!uid) throw new Error('NOT_AUTHENTICATED');
  return uid;
}
