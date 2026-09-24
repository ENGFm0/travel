import { createApiClient } from '@boardingpass/core';
import { loadJSON, persistAfter } from '@/shared/persist';
import { db, firebaseEnabled } from '@/shared/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

export interface Activity {
  id: string;
  title: string;
  time?: string; // HH:mm
}

export interface Day {
  id: string;
  title: string;
  date?: string;
  activities: Activity[];
}

/** One flight leg (outbound or return). All fields optional — filled manually
 *  or by the flight lookup. */
export interface FlightLeg {
  airline?: string;
  no?: string;    // flight number (e.g. SV1020)
  from?: string;  // origin airport/city
  to?: string;    // destination airport/city
  date?: string;  // ISO date
  time?: string;  // HH:mm
}

export interface CityStop {
  id: string;
  name: string;
  dateFrom?: string;
  dateTo?: string;
  flight?: string;      // legacy one-line summary (kept for back-compat)
  flightOut?: FlightLeg;
  flightReturn?: FlightLeg;
  hotel?: string;
  hotelUrl?: string;    // optional booking/maps link
  days: Day[];
}

export interface CityInfoPatch {
  flight?: string;
  hotel?: string;
  hotelUrl?: string;
  flightOut?: FlightLeg;
  flightReturn?: FlightLeg;
}

export interface Board {
  tripId: string;
  cities: CityStop[];
}

/** City seed from the trip (US-003 cities) used to initialise a board once. */
export interface CitySeed {
  name: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface ItineraryService {
  getBoard(tripId: string, seed: CitySeed[]): Promise<Board>;
  addCity(tripId: string, name: string): Promise<Board>;
  moveCity(tripId: string, cityId: string, dir: -1 | 1): Promise<Board>;
  deleteCity(tripId: string, cityId: string): Promise<Board>;
  setCityInfo(tripId: string, cityId: string, info: CityInfoPatch): Promise<Board>;
  addDay(tripId: string, cityId: string, title: string, date?: string): Promise<Board>;
  deleteDay(tripId: string, cityId: string, dayId: string): Promise<Board>;
  addActivity(tripId: string, cityId: string, dayId: string, title: string, time?: string): Promise<Board>;
  deleteActivity(tripId: string, cityId: string, dayId: string, activityId: string): Promise<Board>;
}

const uid = (p: string) => `${p}-${crypto.randomUUID()}`;

/** In-memory itinerary service for dev/tests. NOT a security boundary — the real
 *  service enforces member-write / viewer-read and tenant isolation server-side. */
export function createMockItineraryService(seedBoards?: Record<string, Board>, persistKey?: string): ItineraryService {
  const boards = new Map<string, Board>();
  const initial = persistKey ? loadJSON<Record<string, Board>>(persistKey, seedBoards ?? {}) : (seedBoards ?? {});
  for (const [k, v] of Object.entries(initial)) boards.set(k, structuredClone(v));
  const tick = () => new Promise<void>((r) => setTimeout(r, 0));

  function board(tripId: string, seed: CitySeed[] = []): Board {
    let b = boards.get(tripId);
    if (!b) {
      b = {
        tripId,
        cities: seed.map((c) => ({ id: uid('city'), name: c.name, dateFrom: c.dateFrom, dateTo: c.dateTo, days: [] })),
      };
      boards.set(tripId, b);
    }
    return b;
  }
  const snap = (tripId: string) => structuredClone(boards.get(tripId)!) as Board;
  const city = (b: Board, id: string) => b.cities.find((c) => c.id === id);
  const day = (b: Board, cid: string, did: string) => city(b, cid)?.days.find((d) => d.id === did);

  const base: ItineraryService = {
    async getBoard(tripId, seed) { await tick(); board(tripId, seed); return snap(tripId); },
    async addCity(tripId, name) {
      await tick();
      const b = board(tripId);
      b.cities.push({ id: uid('city'), name: name.trim(), days: [] });
      return snap(tripId);
    },
    async moveCity(tripId, cityId, dir) {
      await tick();
      const b = board(tripId);
      const i = b.cities.findIndex((c) => c.id === cityId);
      const j = i + dir;
      if (i >= 0 && j >= 0 && j < b.cities.length) {
        [b.cities[i], b.cities[j]] = [b.cities[j], b.cities[i]];
      }
      return snap(tripId);
    },
    async deleteCity(tripId, cityId) {
      await tick();
      const b = board(tripId);
      b.cities = b.cities.filter((c) => c.id !== cityId); // cascades days/activities
      return snap(tripId);
    },
    async setCityInfo(tripId, cityId, info) {
      await tick();
      const b = board(tripId);
      const c = city(b, cityId);
      if (c) {
        if (info.flight !== undefined) c.flight = info.flight;
        if (info.hotel !== undefined) c.hotel = info.hotel;
        if (info.hotelUrl !== undefined) c.hotelUrl = info.hotelUrl;
        if (info.flightOut !== undefined) c.flightOut = info.flightOut;
        if (info.flightReturn !== undefined) c.flightReturn = info.flightReturn;
      }
      return snap(tripId);
    },
    async addDay(tripId, cityId, title, date) {
      await tick();
      const b = board(tripId);
      city(b, cityId)?.days.push({ id: uid('day'), title: title.trim(), date, activities: [] });
      return snap(tripId);
    },
    async deleteDay(tripId, cityId, dayId) {
      await tick();
      const b = board(tripId);
      const c = city(b, cityId);
      if (c) c.days = c.days.filter((d) => d.id !== dayId);
      return snap(tripId);
    },
    async addActivity(tripId, cityId, dayId, title, time) {
      await tick();
      const b = board(tripId);
      day(b, cityId, dayId)?.activities.push({ id: uid('act'), title: title.trim(), time: time || undefined });
      return snap(tripId);
    },
    async deleteActivity(tripId, cityId, dayId, activityId) {
      await tick();
      const b = board(tripId);
      const d = day(b, cityId, dayId);
      if (d) d.activities = d.activities.filter((a) => a.id !== activityId);
      return snap(tripId);
    },
  };
  return persistAfter(base, persistKey, () => Object.fromEntries(boards));
}

export function createApiItineraryService(getToken?: () => string | undefined): ItineraryService {
  const base = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api/v1';
  const client = createApiClient({ baseUrl: base, getToken });
  const board = (tripId: string) => client.apiFetch<Board>(`/trips/${tripId}/itinerary`);
  return {
    getBoard: (tripId) => board(tripId),
    addCity: (tripId, name) => client.apiFetch<Board>(`/trips/${tripId}/cities`, { method: 'POST', body: JSON.stringify({ name }) }),
    moveCity: (tripId, cityId, dir) => client.apiFetch<Board>(`/trips/${tripId}/cities/${cityId}/move`, { method: 'PATCH', body: JSON.stringify({ dir }) }),
    deleteCity: async (tripId, cityId) => { await client.apiFetch<void>(`/trips/${tripId}/cities/${cityId}`, { method: 'DELETE' }); return board(tripId); },
    setCityInfo: (tripId, cityId, info) => client.apiFetch<Board>(`/trips/${tripId}/cities/${cityId}`, { method: 'PATCH', body: JSON.stringify(info) }),
    addDay: (tripId, cityId, title, date) => client.apiFetch<Board>(`/trips/${tripId}/cities/${cityId}/days`, { method: 'POST', body: JSON.stringify({ title, date }) }),
    deleteDay: async (tripId, cityId, dayId) => { await client.apiFetch<void>(`/trips/${tripId}/cities/${cityId}/days/${dayId}`, { method: 'DELETE' }); return board(tripId); },
    addActivity: (tripId, cityId, dayId, title, time) => client.apiFetch<Board>(`/trips/${tripId}/cities/${cityId}/days/${dayId}/activities`, { method: 'POST', body: JSON.stringify({ title, time }) }),
    deleteActivity: async (tripId, cityId, dayId, activityId) => { await client.apiFetch<void>(`/trips/${tripId}/cities/${cityId}/days/${dayId}/activities/${activityId}`, { method: 'DELETE' }); return board(tripId); },
  };
}

/** Firestore-backed itinerary. The whole board is one doc
 *  (trips/{tripId}/cities/_board); each op hydrates the mock with the stored
 *  board, applies the same logic, and persists the result. */
export function createFirestoreItineraryService(): ItineraryService {
  const ref = (tripId: string) => doc(db(), 'trips', tripId, 'cities', '_board');
  async function read(tripId: string): Promise<Board | null> {
    const s = await getDoc(ref(tripId));
    return s.exists() ? (s.data().board as Board) : null;
  }
  async function run(tripId: string, seed: CitySeed[], op: (m: ItineraryService) => Promise<Board>): Promise<Board> {
    const existing = await read(tripId);
    const mock = createMockItineraryService(existing ? { [tripId]: existing } : {});
    await mock.getBoard(tripId, seed); // init from seed only when new
    const board = await op(mock);
    await setDoc(ref(tripId), { board });
    return board;
  }
  return {
    getBoard: (tripId, seed) => run(tripId, seed, (m) => m.getBoard(tripId, seed)),
    addCity: (tripId, name) => run(tripId, [], (m) => m.addCity(tripId, name)),
    moveCity: (tripId, cityId, dir) => run(tripId, [], (m) => m.moveCity(tripId, cityId, dir)),
    deleteCity: (tripId, cityId) => run(tripId, [], (m) => m.deleteCity(tripId, cityId)),
    setCityInfo: (tripId, cityId, info) => run(tripId, [], (m) => m.setCityInfo(tripId, cityId, info)),
    addDay: (tripId, cityId, title, date) => run(tripId, [], (m) => m.addDay(tripId, cityId, title, date)),
    deleteDay: (tripId, cityId, dayId) => run(tripId, [], (m) => m.deleteDay(tripId, cityId, dayId)),
    addActivity: (tripId, cityId, dayId, title, time) => run(tripId, [], (m) => m.addActivity(tripId, cityId, dayId, title, time)),
    deleteActivity: (tripId, cityId, dayId, activityId) => run(tripId, [], (m) => m.deleteActivity(tripId, cityId, dayId, activityId)),
  };
}

export function createItineraryService(): ItineraryService {
  if (firebaseEnabled()) return createFirestoreItineraryService();
  return import.meta.env.VITE_API_BASE_URL ? createApiItineraryService() : createMockItineraryService(undefined, 'bp.itinerary.v1');
}
