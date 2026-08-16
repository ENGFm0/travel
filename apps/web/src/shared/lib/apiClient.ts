import { toApiError } from './errors';

/** Thin typed fetch wrapper enforcing the unified error contract and versioned
 *  base URL. Auth token injection + refresh is layered in by US-001. No secrets
 *  live here (keys stay server-side per architecture §6). */
const BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api/v1';

export interface RequestOptions extends RequestInit {
  /** Bearer token (Firebase ID token), injected by the auth layer (US-001). */
  token?: string;
}

export async function apiFetch<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { token, headers, ...rest } = opts;
  const res = await fetch(`${BASE_URL}${path}`, {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  });
  if (!res.ok) throw await toApiError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
