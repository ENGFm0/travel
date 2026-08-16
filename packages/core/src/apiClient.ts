import { toApiError } from './errors';

export interface ApiClientConfig {
  baseUrl: string;
  /** Returns a fresh bearer token (Firebase ID token). Wired by US-001. */
  getToken?: () => string | undefined | Promise<string | undefined>;
}

export interface RequestOptions extends RequestInit {
  token?: string;
}

/** Factory for a thin typed fetch client enforcing the unified error contract.
 *  No secrets here — server-side keys only (architecture §6). */
export function createApiClient(config: ApiClientConfig) {
  async function apiFetch<T>(path: string, opts: RequestOptions = {}): Promise<T> {
    const { token, headers, ...rest } = opts;
    const bearer = token ?? (config.getToken ? await config.getToken() : undefined);
    const res = await fetch(`${config.baseUrl}${path}`, {
      ...rest,
      headers: {
        'Content-Type': 'application/json',
        ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
        ...headers,
      },
    });
    if (!res.ok) throw await toApiError(res);
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }
  return { apiFetch };
}
