import { createApiClient } from '@boardingpass/core';
import { applyRating, type Place } from './placesModel';

export interface PlacesService {
  list(): Promise<Place[]>;
  rate(placeId: string, rating: number): Promise<Place[]>;
  addToTrip(placeId: string, tripId: string, city: string): Promise<void>;
}

/** In-memory places service for dev/tests. Real place data is served by a backend
 *  proxy to Maps/Places (keys server-side, cached — BR-012-004); NO client key. */
export function createMockPlacesService(seed?: Place[]): PlacesService {
  const places: Place[] = (seed ?? demoPlaces()).map((p) => ({ ...p }));
  const tick = () => new Promise<void>((r) => setTimeout(r, 0));
  const snap = () => places.map((p) => ({ ...p }));

  return {
    async list() { await tick(); return snap(); },
    async rate(placeId, rating) {
      await tick();
      const i = places.findIndex((p) => p.id === placeId);
      if (i >= 0) places[i] = applyRating(places[i], rating);
      return snap();
    },
    async addToTrip(_placeId, _tripId, _city) {
      await tick();
      // Delegates to US-006 server-side (adds an activity to the trip's itinerary).
    },
  };
}

export function createApiPlacesService(getToken?: () => string | undefined): PlacesService {
  const base = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api/v1';
  const client = createApiClient({ baseUrl: base, getToken });
  const list = () => client.apiFetch<Place[]>('/places');
  return {
    list,
    rate: async (placeId, rating) => { await client.apiFetch<void>(`/places/${placeId}/reviews`, { method: 'POST', body: JSON.stringify({ rating }) }); return list(); },
    addToTrip: async (placeId, tripId, city) => { await client.apiFetch<void>(`/places/${placeId}/add-to-trip`, { method: 'POST', body: JSON.stringify({ tripId, city }) }); },
  };
}

export function demoPlaces(): Place[] {
  return [
    { id: 'p1', name: 'مطعم نجد', category: 'RESTAURANTS', area: 'حي السفارات', city: 'الرياض', rating: 4.6, ratingCount: 210, suggested: true },
    { id: 'p2', name: 'قصر المصمك', category: 'LANDMARKS', area: 'الديرة', city: 'الرياض', rating: 4.8, ratingCount: 1200, suggested: true },
    { id: 'p3', name: 'حديقة الملك عبدالله', category: 'ACTIVITIES', area: 'الملز', city: 'الرياض', rating: 4.3, ratingCount: 540 },
    { id: 'p4', name: 'بوليفارد الرياض', category: 'SHOPPING', area: 'حطين', city: 'الرياض', rating: 4.5, ratingCount: 980, suggested: true },
    { id: 'p5', name: 'كافيه المدينة', category: 'RESTAURANTS', area: 'العليا', city: 'الرياض', rating: 4.1, ratingCount: 88 },
    { id: 'p6', name: 'جبل طويق', category: 'ACTIVITIES', area: 'الحافة', city: 'الرياض', rating: 4.7, ratingCount: 300 },
  ];
}

export function createPlacesService(): PlacesService {
  return import.meta.env.VITE_API_BASE_URL ? createApiPlacesService() : createMockPlacesService();
}
