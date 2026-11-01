import { describe, it, expect, afterEach, vi } from 'vitest';

/** VITE_PUBLIC_PREVIEW="1" must turn Firebase off and sign the demo account
 *  in without any user action; off, behaviour is unchanged. Modules read the
 *  env at import time, so each case re-imports them fresh. */
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

async function fresh() {
  vi.resetModules();
  const [{ firebaseEnabled }, { createAuthProvider }] = await Promise.all([
    import('@/shared/firebase'),
    import('@/features/auth/provider'),
  ]);
  return { firebaseEnabled, createAuthProvider };
}

describe('public preview mode', () => {
  it('forces Firebase off and auto-signs-in the demo user', async () => {
    localStorage.clear();
    vi.stubEnv('VITE_FIREBASE_API_KEY', 'fake-key');
    vi.stubEnv('VITE_PUBLIC_PREVIEW', '1');
    const { firebaseEnabled, createAuthProvider } = await fresh();
    expect(firebaseEnabled()).toBe(false);
    const p = await createAuthProvider();
    let uid: string | null = null;
    p.subscribe((u) => { uid = u?.uid ?? null; })();
    expect(uid).toBe('seed-user');
  });

  it('is inert when off (mock provider stays signed out)', async () => {
    localStorage.clear();
    vi.stubEnv('VITE_FIREBASE_API_KEY', '');
    vi.stubEnv('VITE_PUBLIC_PREVIEW', '0');
    const { firebaseEnabled, createAuthProvider } = await fresh();
    expect(firebaseEnabled()).toBe(false);
    const p = await createAuthProvider();
    let uid: string | null = 'x';
    p.subscribe((u) => { uid = u?.uid ?? null; })();
    expect(uid).toBeNull();
  });
});
