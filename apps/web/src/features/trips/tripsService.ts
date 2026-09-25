import { createApiClient } from '@boardingpass/core';
import type { TripType, TripStatus } from '@boardingpass/types';
import { loadJSON, saveJSON } from '@/shared/persist';
import { db, firebaseEnabled, requireUid, currentUser } from '@/shared/firebase';
import {
  collection, doc, setDoc, getDoc, getDocs, updateDoc,
  query, where, serverTimestamp, type DocumentData,
} from 'firebase/firestore';

export type TripTravelMode = 'PLANE' | 'CAR' | 'CRUISE';
/** Planning state chosen at setup, editable later. */
export type TripState = 'PLANNING' | 'CONFIRMED' | 'DONE';

export interface TripCity {
  name: string;
  dateFrom?: string;
  dateTo?: string;
  hotel?: string;
  travelMode?: TripTravelMode;
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
  travelMode?: TripTravelMode;
  state?: TripState;
  /** 0–100 planning completeness (server-computed; BR-005-001). */
  progress?: number;
}

export interface CreateTripPayload {
  title: string;
  type: TripType;
  dateFrom: string;
  dateTo?: string;
  cities: TripCity[];
  travelMode?: TripTravelMode;
  state?: TripState;
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
export function createMockTripsService(seed?: Trip[], persistKey?: string): TripsService {
  const trips: Trip[] = persistKey ? loadJSON(persistKey, seed ?? []) : seed ? [...seed] : [];
  const save = () => { if (persistKey) saveJSON(persistKey, trips); };
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
        travelMode: p.travelMode,
        state: p.state ?? 'PLANNING',
        progress: 5,
      };
      trips.unshift(trip);
      save();
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
      save();
      return trip;
    },
    async deleteTrip(id) {
      await tick();
      const trip = trips.find((t) => t.id === id);
      if (trip) trip.status = 'DELETED'; // soft-delete (BR-005-003)
      save();
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

/** Firestore-backed trips service (real, shared data). A trip is the tenant
 *  root; `memberUids` on the doc powers the "my trips" query and the security
 *  rules. Creating a trip also writes the owner's membership doc. */
export function createFirestoreTripsService(): TripsService {
  function toTrip(id: string, d: DocumentData): Trip {
    return {
      id,
      title: d.title,
      type: d.type,
      dateFrom: d.dateFrom,
      dateTo: d.dateTo,
      cities: (d.cities ?? []) as TripCity[],
      ownerUid: d.ownerUid,
      status: d.status,
      travelMode: d.travelMode ?? undefined,
      state: d.state ?? undefined,
      progress: d.progress ?? 0,
    };
  }

  return {
    async createTrip(p) {
      const uid = requireUid();
      const me = currentUser();
      const ref = doc(collection(db(), 'trips'));
      const data = {
        title: p.title.trim(),
        type: p.type,
        dateFrom: p.dateFrom,
        dateTo: p.dateTo ?? null,
        cities: p.cities,
        ownerUid: uid,
        memberUids: [uid],
        status: 'ACTIVE' as TripStatus,
        travelMode: p.travelMode ?? null,
        state: p.state ?? 'PLANNING',
        progress: 5,
        createdAt: serverTimestamp(),
      };
      await setDoc(ref, data);
      // Owner membership (rules allow the trip's ownerUid to create members).
      await setDoc(doc(db(), 'trips', ref.id, 'members', uid), {
        uid, displayName: me?.name ?? 'أنت', role: 'OWNER', status: 'ACTIVE', joinedAt: serverTimestamp(),
      });
      return toTrip(ref.id, { ...data, dateTo: p.dateTo });
    },
    async listTrips(scope = 'all') {
      const uid = requireUid();
      const snap = await getDocs(query(collection(db(), 'trips'), where('memberUids', 'array-contains', uid)));
      const today = new Date().toISOString().slice(0, 10);
      return snap.docs
        .map((d) => toTrip(d.id, d.data()))
        .filter((t) => (scope === 'archived' ? t.status === 'ARCHIVED' : t.status === 'ACTIVE'))
        .filter((t) => {
          if (scope === 'upcoming') return tripIsUpcoming(t, today);
          if (scope === 'past') return !tripIsUpcoming(t, today);
          return true;
        })
        .sort((a, b) => a.dateFrom.localeCompare(b.dateFrom));
    },
    async getTrip(id) {
      const s = await getDoc(doc(db(), 'trips', id));
      if (!s.exists()) return null;
      const t = toTrip(s.id, s.data());
      return t.status === 'DELETED' ? null : t;
    },
    async updateStatus(id, status) {
      await updateDoc(doc(db(), 'trips', id), { status });
      const s = await getDoc(doc(db(), 'trips', id));
      return toTrip(id, s.data() ?? {});
    },
    async deleteTrip(id) {
      await updateDoc(doc(db(), 'trips', id), { status: 'DELETED' }); // soft-delete
    },
  };
}

export function createTripsService(): TripsService {
  if (firebaseEnabled()) return createFirestoreTripsService();
  return import.meta.env.VITE_API_BASE_URL ? createApiTripsService() : createMockTripsService(demoTrips(), 'bp.trips.v1');
}
