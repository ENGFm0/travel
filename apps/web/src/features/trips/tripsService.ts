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
  /** 0–100 planning completeness (server-computed; BR-005-001). */
  progress?: number;
}

export interface CreateTripPayload {
  title: string;
  type: TripType;
  dateFrom: string;
  dateTo?: string;
  cities: TripCity[];
  invitees?: string[];
}

/** Lifecycle scope for the My Trips list (FR-005-002). `archived` is the
 *  owner's restore view; `all` is used by tests/tools. */
export type TripScope = 'upcoming' | 'past' | 'archived' | 'all';

export interface TripsService {
  createTrip(payload: CreateTripPayload): Promise<Trip>;
  listTrips(scope?: TripScope): Promise<Trip[]>;
  getTrip(id: string): Promise<Trip | null>;
  updateStatus(id: string, status: TripStatus): Promise<Trip>;
  deleteTrip(id: string): Promise<void>;
}

const CURRENT_UID = 'me';

/** In-memory service for dev/tests (no backend). NOT a security boundary —
 *  the real service filters by membership and enforces ownership server-side. */
export function createMockTripsService(seed?: Trip[]): TripsService {
  const trips: Trip[] = seed ? [...seed] : [];
  const tick = () => new Promise<void>((r) => setTimeout(r, 0));

  return {
    async createTrip(p) {
      await tick();
      const trip: Trip = {
        id: `trip-${crypto.randomUUID()}`,
        title: p.title,
        type: p.type,
        dateFrom: p.dateFrom,
        dateTo: p.dateTo,
        cities: p.cities,
        ownerUid: CURRENT_UID,
        status: 'ACTIVE',
        progress: 5,
      };
      trips.unshift(trip);
      return trip;
    },
    async listTrips(scope = 'all') {
      await tick();
      const today = new Date().toISOString().slice(0, 10);
      return trips
        .filter((t) => (scope === 'archived' ? t.status === 'ARCHIVED' : t.status === 'ACTIVE'))
        .filter((t) => {
          if (scope === 'upcoming') return tripIsUpcoming(t, today);
          if (scope === 'past') return !tripIsUpcoming(t, today);
          return true;
        })
        .sort((a, b) => a.dateFrom.localeCompare(b.dateFrom));
    },
    async getTrip(id) {
      await tick();
      return trips.find((t) => t.id === id && t.status !== 'DELETED') ?? null;
    },
    async updateStatus(id, status) {
      await tick();
      const trip = trips.find((t) => t.id === id);
      if (!trip) throw new Error('NOT_FOUND');
      trip.status = status;
      return trip;
    },
    async deleteTrip(id) {
      await tick();
      const trip = trips.find((t) => t.id === id);
      if (trip) trip.status = 'DELETED'; // soft-delete (BR-005-003)
    },
  };
}

/** A trip is "upcoming" while it has not ended yet (ongoing counts as upcoming,
 *  BR-005-002). Compares ISO date strings (lexicographic == chronological). */
export function tripIsUpcoming(trip: Trip, today: string): boolean {
  const end = trip.dateTo ?? trip.dateFrom;
  return end >= today;
}

/** API-backed service (US-005-BE). Token injection wired by the auth layer;
 *  the server assigns ownership and filters by membership. */
export function createApiTripsService(getToken?: () => string | undefined): TripsService {
  const base = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api/v1';
  const client = createApiClient({ baseUrl: base, getToken });
  return {
    createTrip(p) {
      return client.apiFetch<Trip>('/trips', { method: 'POST', body: JSON.stringify(p) });
    },
    listTrips(scope = 'all') {
      return client.apiFetch<Trip[]>(`/trips?scope=${scope}`);
    },
    getTrip(id) {
      return client.apiFetch<Trip | null>(`/trips/${id}`);
    },
    updateStatus(id, status) {
      return client.apiFetch<Trip>(`/trips/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
    },
    async deleteTrip(id) {
      await client.apiFetch<void>(`/trips/${id}`, { method: 'DELETE' });
    },
  };
}

/** Demo trips for dev (mock only) so My Trips isn't empty before a backend
 *  exists — one clearly upcoming, one clearly past. */
export function demoTrips(): Trip[] {
  return [
    {
      id: 'trip-demo-1',
      title: 'رحلة أوروبا الصيفية',
      type: 'INTERNATIONAL',
      dateFrom: '2026-12-10',
      dateTo: '2026-12-22',
      cities: [
        { name: 'باريس' },
        { name: 'روما' },
      ],
      ownerUid: CURRENT_UID,
      status: 'ACTIVE',
      progress: 45,
    },
    {
      id: 'trip-demo-2',
      title: 'إجازة أبها',
      type: 'DOMESTIC',
      dateFrom: '2025-03-05',
      dateTo: '2025-03-09',
      cities: [{ name: 'أبها' }],
      ownerUid: CURRENT_UID,
      status: 'ACTIVE',
      progress: 100,
    },
  ];
}

export function createTripsService(): TripsService {
  return import.meta.env.VITE_API_BASE_URL ? createApiTripsService() : createMockTripsService(demoTrips());
}
