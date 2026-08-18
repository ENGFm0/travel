import { createApiClient } from '@boardingpass/core';
import type { TripType, TripStatus } from '@boardingpass/types';

export interface TripCity {
  name: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface Trip {
  id: string;
  title: string;
  type: TripType;
  dateFrom: string;
  dateTo?: string;
  cities: TripCity[];
  ownerUid: string;
  status: TripStatus;
}

export interface CreateTripPayload {
  title: string;
  type: TripType;
  dateFrom: string;
  dateTo?: string;
  cities: TripCity[];
  invitees?: string[];
}

export interface TripsService {
  createTrip(payload: CreateTripPayload): Promise<Trip>;
}

/** In-memory service for dev/tests (no backend). */
export function createMockTripsService(): TripsService {
  const trips: Trip[] = [];
  return {
    async createTrip(p) {
      await new Promise<void>((r) => setTimeout(r, 0));
      const trip: Trip = {
        id: `trip-${crypto.randomUUID()}`,
        title: p.title,
        type: p.type,
        dateFrom: p.dateFrom,
        dateTo: p.dateTo,
        cities: p.cities,
        ownerUid: 'me',
        status: 'ACTIVE',
      };
      trips.push(trip);
      return trip;
    },
  };
}

/** API-backed service (US-003-BE `POST /api/v1/trips`). Token injection is wired
 *  by the auth layer; server assigns the creator as TRIP_OWNER. */
export function createApiTripsService(getToken?: () => string | undefined): TripsService {
  const base = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api/v1';
  const client = createApiClient({ baseUrl: base, getToken });
  return {
    createTrip(p) {
      return client.apiFetch<Trip>('/trips', { method: 'POST', body: JSON.stringify(p) });
    },
  };
}

export function createTripsService(): TripsService {
  return import.meta.env.VITE_API_BASE_URL ? createApiTripsService() : createMockTripsService();
}
