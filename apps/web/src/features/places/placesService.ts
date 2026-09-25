import { loadJSON, persistAfter } from '@/shared/persist';
import { createApiClient } from '@boardingpass/core';
import { currentUser, db, firebaseEnabled } from '@/shared/firebase';
import { collection, doc, getDoc, getDocs, increment, limit, orderBy, query, serverTimestamp, setDoc } from 'firebase/firestore';
import { applyRating, clampRating, type Place } from './placesModel';

export interface PlacesService {
  /** Community recommendations — places travellers added to their trips. */
  list(): Promise<Place[]>;
  rate(placeId: string, rating: number): Promise<Place[]>;
  /** Rate + comment a place, promoting it into the community recommendations. */
  review(place: Place, rating: number, comment: string): Promise<Place[]>;
  /** Record that a place was added to a trip (feeds recommendations). */
  record(place: Place): Promise<void>;
  addToTrip(placeId: string, tripId: string, city: string): Promise<void>;
}

/** In-memory places service for dev/tests. Starts EMPTY — no demo data; the list
 *  fills as travellers add places (record) or from a test seed. */
export function createMockPlacesService(seed?: Place[], persistKey?: string): PlacesService {
  const places: Place[] = (persistKey ? loadJSON<Place[]>(persistKey, seed ?? []) : (seed ?? [])).map((p) => ({ ...p }));
  const tick = () => new Promise<void>((r) => setTimeout(r, 0));
  const snap = () => places.map((p) => ({ ...p }));

  const base: PlacesService = {
    async list() { await tick(); return snap().sort((a, b) => (b.adds ?? 0) - (a.adds ?? 0)); },
    async rate(placeId, rating) {
      await tick();
      const i = places.findIndex((p) => p.id === placeId);
      if (i >= 0) places[i] = applyRating(places[i], rating);
      return snap();
    },
    async review(place, rating, comment) {
      await tick();
      const i = places.findIndex((p) => p.id === place.id);
      const base = i >= 0 ? places[i] : { ...place, adds: place.adds ?? 0 };
      const rated = applyRating(base, rating);
      const next = { ...rated, comment: comment.trim() || undefined, commentBy: 'أنا' };
      if (i >= 0) places[i] = next; else places.push(next);
      return snap().sort((a, b) => (b.adds ?? 0) - (a.adds ?? 0));
    },
    async record(place) {
      await tick();
      const i = places.findIndex((p) => p.id === place.id);
      if (i >= 0) places[i] = { ...places[i], ...place, adds: (places[i].adds ?? 0) + 1 };
      else places.push({ ...place, adds: (place.adds ?? 0) + 1 });
    },
    async addToTrip(_placeId, _tripId, _city) {
      await tick();
      // Real add to the itinerary is done by the caller (ExplorePage).
    },
  };
  return persistAfter(base, persistKey, snap);
}

export function createApiPlacesService(getToken?: () => string | undefined): PlacesService {
  const base = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api/v1';
  const client = createApiClient({ baseUrl: base, getToken });
  const list = () => client.apiFetch<Place[]>('/places');
  return {
    list,
    rate: async (placeId, rating) => { await client.apiFetch<void>(`/places/${placeId}/reviews`, { method: 'POST', body: JSON.stringify({ rating }) }); return list(); },
    review: async (place, rating, comment) => { await client.apiFetch<void>(`/places/${place.id}/reviews`, { method: 'POST', body: JSON.stringify({ ...place, rating, comment }) }); return list(); },
    record: async (place) => { await client.apiFetch<void>('/places/record', { method: 'POST', body: JSON.stringify(place) }); },
    addToTrip: async (placeId, tripId, city) => { await client.apiFetch<void>(`/places/${placeId}/add-to-trip`, { method: 'POST', body: JSON.stringify({ tripId, city }) }); },
  };
}

/** Firestore-backed community recommendations. Each place travellers add is
 *  upserted into the shared `places` collection with an incrementing `adds`
 *  counter; Explore reads the most-added ones. */
export function createFirestorePlacesService(): PlacesService {
  const col = () => collection(db(), 'places');
  const ref = (id: string) => doc(db(), 'places', id);

  async function list(): Promise<Place[]> {
    const q = query(col(), orderBy('adds', 'desc'), limit(40));
    const s = await getDocs(q);
    return s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Place, 'id'>) }));
  }
  return {
    list,
    async rate(placeId, rating) {
      // Optimistic: recompute the aggregate on the stored doc.
      const snap = await getDoc(ref(placeId));
      if (snap.exists()) {
        const cur = { id: placeId, ...(snap.data() as Omit<Place, 'id'>) };
        const next = applyRating(cur, rating);
        await setDoc(ref(placeId), { rating: next.rating, ratingCount: next.ratingCount }, { merge: true });
      }
      return list();
    },
    async review(place, rating, comment) {
      const me = currentUser();
      const r = clampRating(rating);
      const parent = await getDoc(ref(place.id));
      const cur = parent.exists() ? (parent.data() as Omit<Place, 'id'>) : undefined;
      // Previous rating by this user (to update the aggregate without double count).
      let prev: number | undefined;
      if (me) {
        const mine = await getDoc(doc(db(), 'places', place.id, 'reviews', me.uid));
        if (mine.exists()) prev = (mine.data() as { rating?: number }).rating;
      }
      const count0 = cur?.ratingCount ?? 0;
      const avg0 = cur?.rating ?? 0;
      const first = prev === undefined;
      const count = first ? count0 + 1 : count0;
      const total = avg0 * count0 - (first ? 0 : (prev ?? 0)) + r;
      const rating_ = count > 0 ? Math.round((total / count) * 10) / 10 : r;
      const trimmed = comment.trim();
      if (me) {
        await setDoc(doc(db(), 'places', place.id, 'reviews', me.uid),
          { rating: r, comment: trimmed || null, by: me.name, at: serverTimestamp() }, { merge: true });
      }
      const { id, ...rest } = place;
      await setDoc(ref(id), {
        ...rest, rating: rating_, ratingCount: count,
        comment: trimmed || cur?.comment || null, commentBy: trimmed ? (me?.name ?? 'مسافر') : (cur?.commentBy ?? null),
        adds: increment(0),
      }, { merge: true });
      return list();
    },
    async record(place) {
      // Merge the place fields and bump the add counter atomically.
      const { id, ...rest } = place;
      await setDoc(ref(id), { ...rest, adds: increment(1) }, { merge: true });
    },
    async addToTrip(_placeId, _tripId, _city) {
      // Real add to the itinerary is done by the caller (ExplorePage).
    },
  };
}

export function createPlacesService(): PlacesService {
  if (firebaseEnabled()) return createFirestorePlacesService();
  return import.meta.env.VITE_API_BASE_URL ? createApiPlacesService() : createMockPlacesService(undefined, 'bp.places.v1');
}
