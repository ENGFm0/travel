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

/** RapidAPI key for AeroDataBox (public build key, like the Maps key). When set,
 *  the client fetches real flight schedules directly. */
function aeroKey(): string | undefined {
  return import.meta.env.VITE_AERODATABOX_KEY as string | undefined;
}
export function flightsLiveEnabled(): boolean {
  return Boolean(aeroKey());
}

/** Real flight lookup via AeroDataBox (RapidAPI). Returns schedule, route and
 *  airline for a flight number. HTTPS + CORS, so it runs client-side. */
export function createAeroDataBoxService(): FlightsService {
  const key = aeroKey() as string;
  const host = 'aerodatabox.p.rapidapi.com';
  const norm = (s?: string) => (s ? s.replace(' ', 'T') : undefined); // "2026-09-01 09:20+03:00" → ISO
  return {
    async lookup(code) {
      let res: Response;
      try {
        res = await fetch(`https://${host}/flights/number/${encodeURIComponent(code)}?withAircraftImage=false&withLocation=false`, {
          headers: { 'X-RapidAPI-Key': key, 'X-RapidAPI-Host': host },
        });
      } catch {
        throw new FlightsError('UPSTREAM');
      }
      if (res.status === 204 || res.status === 404) return null; // valid but no data
      if (res.status === 429) throw new FlightsError('RATE_LIMITED');
      if (res.status === 401 || res.status === 403) throw new FlightsError('UPSTREAM');
      if (!res.ok) throw new FlightsError('UPSTREAM');
      /* eslint-disable @typescript-eslint/no-explicit-any */
      let data: any;
      try { data = await res.json(); } catch { return null; }
      const arr: any[] = Array.isArray(data) ? data : (data?.flights ?? []);
      const f = arr[0];
      if (!f) return null;
      return {
        code: String(f.number ?? code).replace(/\s+/g, ''),
        airline: f.airline?.name ?? f.airline ?? '—',
        departure: {
          name: f.departure?.airport?.name ?? '',
          iata: f.departure?.airport?.iata ?? f.departure?.airport?.icao ?? '',
          time: norm(f.departure?.scheduledTime?.local ?? f.departure?.revisedTime?.local ?? f.departure?.scheduledTime?.utc),
        },
        arrival: {
          name: f.arrival?.airport?.name ?? '',
          iata: f.arrival?.airport?.iata ?? f.arrival?.airport?.icao ?? '',
          time: norm(f.arrival?.scheduledTime?.local ?? f.arrival?.revisedTime?.local ?? f.arrival?.scheduledTime?.utc),
        },
      };
      /* eslint-enable @typescript-eslint/no-explicit-any */
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
  if (aeroKey()) return createAeroDataBoxService();
  return import.meta.env.VITE_API_BASE_URL ? createApiFlightsService() : createMockFlightsService();
}
