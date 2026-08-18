import { createApiClient } from '@boardingpass/core';
import type { FlightInfo } from './flightsModel';

export type FlightsErrorCode = 'INVALID' | 'RATE_LIMITED' | 'UPSTREAM' | 'GENERIC';
export class FlightsError extends Error {
  code: FlightsErrorCode;
  constructor(code: FlightsErrorCode) { super(code); this.code = code; }
}

export interface FlightsService {
  /** Returns flight info, or null for a valid "no data" result (BR-004-003). */
  lookup(code: string): Promise<FlightInfo | null>;
}

/** In-memory flights service for dev/tests. The real service calls a backend
 *  proxy that holds the AviationStack key; NO key is ever in the client. */
export function createMockFlightsService(): FlightsService {
  const tick = () => new Promise<void>((r) => setTimeout(r, 0));
  return {
    async lookup(code) {
      await tick();
      if (code === 'ZZ9999') return null;            // valid-but-empty (future/inactive)
      if (code === 'ER0001') throw new FlightsError('UPSTREAM');
      if (code === 'RL0001') throw new FlightsError('RATE_LIMITED');
      const airline = code.startsWith('SV') ? 'الخطوط السعودية' : 'Sample Airlines';
      return {
        code,
        airline,
        departure: { name: 'King Khalid Intl', iata: 'RUH', time: '2026-09-01T09:20:00' },
        arrival: { name: 'Heathrow', iata: 'LHR', time: '2026-09-01T13:40:00' },
      };
    },
  };
}

export function createApiFlightsService(getToken?: () => string | undefined): FlightsService {
  const base = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api/v1';
  const client = createApiClient({ baseUrl: base, getToken });
  return {
    async lookup(code) {
      // The proxy returns 200 with { found:false } for a valid empty result and a
      // typed error contract otherwise; apiClient maps error codes to ApiError.
      const r = await client.apiFetch<{ found: boolean; flight?: FlightInfo }>(`/flights/lookup?code=${encodeURIComponent(code)}`);
      return r.found && r.flight ? r.flight : null;
    },
  };
}

export function createFlightsService(): FlightsService {
  return import.meta.env.VITE_API_BASE_URL ? createApiFlightsService() : createMockFlightsService();
}
