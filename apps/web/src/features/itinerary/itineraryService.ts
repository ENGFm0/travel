import { createApiClient } from '@boardingpass/core';
import { loadJSON, persistAfter } from '@/shared/persist';
import { db, firebaseEnabled } from '@/shared/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

export type ActivityKind = 'ARRIVAL' | 'HOTEL' | 'FOOD' | 'SHOPPING' | 'SIGHT' | 'TRANSPORT' | 'ACTIVITY' | 'OTHER';
export const ACTIVITY_KINDS: ActivityKind[] = ['ARRIVAL', 'HOTEL', 'FOOD', 'SHOPPING', 'SIGHT', 'TRANSPORT', 'ACTIVITY', 'OTHER'];

/** Named times of day (morning → night). Used instead of a raw clock time. */
export type DayPeriod = 'MORNING' | 'NOON' | 'AFTERNOON' | 'SUNSET' | 'EVENING' | 'NIGHT';
export const DAY_PERIODS: DayPeriod[] = ['MORNING', 'NOON', 'AFTERNOON', 'SUNSET', 'EVENING', 'NIGHT'];
/** Representative clock time for each period — used only to sort the timeline. */
export const PERIOD_TIME: Record<DayPeriod, string> = {
  MORNING: '09:00', NOON: '12:00', AFTERNOON: '15:00', SUNSET: '18:00', EVENING: '20:00', NIGHT: '23:00',
};

/** How a stop is reached / travelled. */
export type TravelMode = 'PLANE' | 'CAR' | 'CRUISE';
export const TRAVEL_MODES: TravelMode[] = ['PLANE', 'CAR', 'CRUISE'];

/** Trip shape for the travel legs: one-way, round-trip, or multi-leg. */
export type TripKind = 'ONE_WAY' | 'ROUND' | 'MULTI';
export const TRIP_KINDS: TripKind[] = ['ONE_WAY', 'ROUND', 'MULTI'];

export interface Activity {
  id: string;
  title: string;
  time?: string;       // HH:mm (exact, optional)
  period?: DayPeriod;  // named time of day
  note?: string;       // extra detail (place, address, remarks)
  kind?: ActivityKind;
  photoUrl?: string;   // optional place photo (from Google Places)
  mapsUrl?: string;    // optional deep-link (from Google Places / Explore)
  placeId?: string;    // links to a community place (for rating/recommendations)
}

export interface ActivityInput {
  title: string;
  time?: string;
  period?: DayPeriod;
  note?: string;
  kind?: ActivityKind;
  photoUrl?: string;
  mapsUrl?: string;
  placeId?: string;
}

/** Sort key for an activity: exact time, else the period's representative time. */
export function activitySortKey(a: { time?: string; period?: DayPeriod }): string {
  return a.time || (a.period ? PERIOD_TIME[a.period] : '') || '99:99';
}

/** Derive the day period from an "HH:mm" time (Saudi day rhythm). */
export function periodFromTime(hhmm?: string): DayPeriod | undefined {
  if (!hhmm) return undefined;
  const h = parseInt(hhmm.slice(0, 2), 10);
  if (Number.isNaN(h)) return undefined;
  if (h < 5) return 'NIGHT';
  if (h < 11) return 'MORNING';
  if (h < 15) return 'NOON';
  if (h < 17) return 'AFTERNOON';
  if (h < 19) return 'SUNSET';
  if (h < 22) return 'EVENING';
  return 'NIGHT';
}

/** Format an "HH:mm" (24h) time as 12-hour with ص/م (ar) or AM/PM. */
export function formatTime12(hhmm?: string, locale = 'ar'): string {
  if (!hhmm) return '';
  const [hs, ms] = hhmm.split(':');
  const h = parseInt(hs, 10);
  if (Number.isNaN(h)) return hhmm;
  const m = ms ?? '00';
  const am = h < 12;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const suffix = locale.startsWith('ar') ? (am ? 'ص' : 'م') : (am ? 'AM' : 'PM');
  return `${h12}:${m} ${suffix}`;
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
  tripKind?: TripKind;
  legs?: FlightLeg[];   // used when tripKind === 'MULTI'
  hotel?: string;
  hotelUrl?: string;    // optional booking/maps link
  travelMode?: TravelMode;
  days: Day[];
}

export interface CityInfoPatch {
  flight?: string;
  hotel?: string;
  hotelUrl?: string;
  dateFrom?: string;
  dateTo?: string;
  flightOut?: FlightLeg;
  flightReturn?: FlightLeg;
  tripKind?: TripKind;
  legs?: FlightLeg[];
  travelMode?: TravelMode;
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
  hotel?: string;
  travelMode?: TravelMode;
}

export interface ItineraryService {
  getBoard(tripId: string, seed: CitySeed[]): Promise<Board>;
  addCity(tripId: string, name: string, dates?: { dateFrom?: string; dateTo?: string }): Promise<Board>;
  moveCity(tripId: string, cityId: string, dir: -1 | 1): Promise<Board>;
  deleteCity(tripId: string, cityId: string): Promise<Board>;
  setCityInfo(tripId: string, cityId: string, info: CityInfoPatch): Promise<Board>;
  addDay(tripId: string, cityId: string, title: string, date?: string): Promise<Board>;
  /** Auto-create a day per ISO date (skips dates that already have a day). */
  generateDays(tripId: string, cityId: string, dates: string[]): Promise<Board>;
  deleteDay(tripId: string, cityId: string, dayId: string): Promise<Board>;
  addActivity(tripId: string, cityId: string, dayId: string, input: ActivityInput): Promise<Board>;
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
        cities: seed.map((c) => ({ id: uid('city'), name: c.name, dateFrom: c.dateFrom, dateTo: c.dateTo, hotel: c.hotel, travelMode: c.travelMode, days: [] })),
      };
      boards.set(tripId, b);
    }
    return b;
  }
  const snap = (tripId: string) => structuredClone(boards.get(tripId)!) as Board;
  const city = (b: Board, id: string) => b.cities.find((c) => c.id === id);
  // Chronological order by start date; undated cities keep their relative order last.
  const sortCities = (b: Board) => b.cities.sort((a, c) => (a.dateFrom ?? '9999-99').localeCompare(c.dateFrom ?? '9999-99'));
  const day = (b: Board, cid: string, did: string) => city(b, cid)?.days.find((d) => d.id === did);

  const base: ItineraryService = {
    async getBoard(tripId, seed) { await tick(); board(tripId, seed); return snap(tripId); },
    async addCity(tripId, name, dates) {
      await tick();
      const b = board(tripId);
      b.cities.push({ id: uid('city'), name: name.trim(), dateFrom: dates?.dateFrom, dateTo: dates?.dateTo, days: [] });
      sortCities(b);
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
        if (info.dateFrom !== undefined) c.dateFrom = info.dateFrom || undefined;
        if (info.dateTo !== undefined) c.dateTo = info.dateTo || undefined;
        if (info.flightOut !== undefined) c.flightOut = info.flightOut;
        if (info.flightReturn !== undefined) c.flightReturn = info.flightReturn;
        if (info.tripKind !== undefined) c.tripKind = info.tripKind;
        if (info.legs !== undefined) c.legs = info.legs;
        if (info.travelMode !== undefined) c.travelMode = info.travelMode;
        if (info.dateFrom !== undefined || info.dateTo !== undefined) sortCities(b);
      }
      return snap(tripId);
    },
    async addDay(tripId, cityId, title, date) {
      await tick();
      const b = board(tripId);
      city(b, cityId)?.days.push({ id: uid('day'), title: title.trim(), date, activities: [] });
      return snap(tripId);
    },
    async generateDays(tripId, cityId, dates) {
      await tick();
      const b = board(tripId);
      const c = city(b, cityId);
      if (c) {
        // Drop leftover empty dateless days (keep any day that has activities).
        c.days = c.days.filter((d) => d.date || d.activities.length > 0);
        const have = new Set(c.days.map((d) => d.date).filter(Boolean));
        for (const date of dates) {
          if (have.has(date)) continue;
          c.days.push({ id: uid('day'), title: '', date, activities: [] });
        }
        // dated days first (chronological), any dateless-with-activities last.
        c.days.sort((x, y) => (x.date ?? '9999-99-99').localeCompare(y.date ?? '9999-99-99'));
      }
      return snap(tripId);
    },
    async deleteDay(tripId, cityId, dayId) {
      await tick();
      const b = board(tripId);
      const c = city(b, cityId);
      if (c) c.days = c.days.filter((d) => d.id !== dayId);
      return snap(tripId);
    },
    async addActivity(tripId, cityId, dayId, input) {
      await tick();
      const b = board(tripId);
      day(b, cityId, dayId)?.activities.push({
        id: uid('act'), title: input.title.trim(), time: input.time || undefined,
        period: input.period, note: input.note?.trim() || undefined, kind: input.kind,
        photoUrl: input.photoUrl || undefined, mapsUrl: input.mapsUrl || undefined,
        placeId: input.placeId || undefined,
      });
      // keep the day's activities ordered by time-of-day
      const d = day(b, cityId, dayId);
      if (d) d.activities.sort((a1, a2) => activitySortKey(a1).localeCompare(activitySortKey(a2)));
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
    addCity: (tripId, name, dates) => client.apiFetch<Board>(`/trips/${tripId}/cities`, { method: 'POST', body: JSON.stringify({ name, ...dates }) }),
    moveCity: (tripId, cityId, dir) => client.apiFetch<Board>(`/trips/${tripId}/cities/${cityId}/move`, { method: 'PATCH', body: JSON.stringify({ dir }) }),
    deleteCity: async (tripId, cityId) => { await client.apiFetch<void>(`/trips/${tripId}/cities/${cityId}`, { method: 'DELETE' }); return board(tripId); },
    setCityInfo: (tripId, cityId, info) => client.apiFetch<Board>(`/trips/${tripId}/cities/${cityId}`, { method: 'PATCH', body: JSON.stringify(info) }),
    addDay: (tripId, cityId, title, date) => client.apiFetch<Board>(`/trips/${tripId}/cities/${cityId}/days`, { method: 'POST', body: JSON.stringify({ title, date }) }),
    generateDays: (tripId, cityId, dates) => client.apiFetch<Board>(`/trips/${tripId}/cities/${cityId}/days/generate`, { method: 'POST', body: JSON.stringify({ dates }) }),
    deleteDay: async (tripId, cityId, dayId) => { await client.apiFetch<void>(`/trips/${tripId}/cities/${cityId}/days/${dayId}`, { method: 'DELETE' }); return board(tripId); },
    addActivity: (tripId, cityId, dayId, input) => client.apiFetch<Board>(`/trips/${tripId}/cities/${cityId}/days/${dayId}/activities`, { method: 'POST', body: JSON.stringify(input) }),
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
    addCity: (tripId, name, dates) => run(tripId, [], (m) => m.addCity(tripId, name, dates)),
    moveCity: (tripId, cityId, dir) => run(tripId, [], (m) => m.moveCity(tripId, cityId, dir)),
    deleteCity: (tripId, cityId) => run(tripId, [], (m) => m.deleteCity(tripId, cityId)),
    setCityInfo: (tripId, cityId, info) => run(tripId, [], (m) => m.setCityInfo(tripId, cityId, info)),
    addDay: (tripId, cityId, title, date) => run(tripId, [], (m) => m.addDay(tripId, cityId, title, date)),
    generateDays: (tripId, cityId, dates) => run(tripId, [], (m) => m.generateDays(tripId, cityId, dates)),
    deleteDay: (tripId, cityId, dayId) => run(tripId, [], (m) => m.deleteDay(tripId, cityId, dayId)),
    addActivity: (tripId, cityId, dayId, input) => run(tripId, [], (m) => m.addActivity(tripId, cityId, dayId, input)),
    deleteActivity: (tripId, cityId, dayId, activityId) => run(tripId, [], (m) => m.deleteActivity(tripId, cityId, dayId, activityId)),
  };
}

export function createItineraryService(): ItineraryService {
  if (firebaseEnabled()) return createFirestoreItineraryService();
  return import.meta.env.VITE_API_BASE_URL ? createApiItineraryService() : createMockItineraryService(undefined, 'bp.itinerary.v1');
}

/** Load a trip's itinerary board from outside the itinerary page (e.g. the
 *  Explore "add to plan" modal needs the city's days). */
export function getItineraryBoard(tripId: string, seed: CitySeed[]): Promise<Board> {
  return createItineraryService().getBoard(tripId, seed);
}

/** Add a place (e.g. chosen in Explore) to a trip's itinerary: find/create the
 *  city, add it to the chosen day (or the first/created day), then append the
 *  activity. Best-effort, used from outside the itinerary page. */
export async function addPlaceToItinerary(
  tripId: string, seed: CitySeed[], cityName: string, input: ActivityInput, dayId?: string,
): Promise<void> {
  const svc = createItineraryService();
  let board = await svc.getBoard(tripId, seed);
  let city = board.cities.find((c) => c.name === cityName);
  if (!city) { board = await svc.addCity(tripId, cityName); city = board.cities.find((c) => c.name === cityName); }
  if (!city) return;
  let targetDayId = dayId && city.days.some((d) => d.id === dayId) ? dayId : undefined;
  if (!targetDayId) {
    if (city.days.length === 0) {
      board = await svc.addDay(tripId, city.id, '');
      city = board.cities.find((c) => c.id === city!.id);
    }
    targetDayId = city?.days[0]?.id;
  }
  if (city && targetDayId) await svc.addActivity(tripId, city.id, targetDayId, input);
}
