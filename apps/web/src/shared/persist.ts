// Tiny localStorage persistence for the mock services, so a phone/demo build
// keeps its data across reloads without a backend. Every access is guarded —
// private mode, cleared storage, or SSR all fall back gracefully.

export function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw != null ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function saveJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota exceeded / unavailable — ignore */
  }
}

export function removeKey(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/** Wrap a mock service so that after every method call it persists a snapshot of
 *  its internal state under `key`. No key → returns the service untouched (used
 *  by tests, which stay pure in-memory). Reads persist too — harmless. */
export function persistAfter<T extends object>(svc: T, key: string | undefined, snapshot: () => unknown): T {
  if (!key) return svc;
  const out: Record<string, unknown> = {};
  for (const name of Object.keys(svc)) {
    const val = (svc as Record<string, unknown>)[name];
    out[name] =
      typeof val === 'function'
        ? async (...args: unknown[]) => {
            const r = await (val as (...a: unknown[]) => Promise<unknown>)(...args);
            saveJSON(key, snapshot());
            return r;
          }
        : val;
  }
  return out as T;
}

