import { loadJSON, persistAfter } from '@/shared/persist';
import { createApiClient } from '@boardingpass/core';
import { applyRating, type Place } from './placesModel';

export interface PlacesService {
  list(): Promise<Place[]>;
  rate(placeId: string, rating: number): Promise<Place[]>;
  addToTrip(placeId: string, tripId: string, city: string): Promise<void>;
}

/** In-memory places service for dev/tests. Real place data is served by a backend
 *  proxy to Maps/Places (keys server-side, cached — BR-012-004); NO client key. */
export function createMockPlacesService(seed?: Place[], persistKey?: string): PlacesService {
  const places: Place[] = (persistKey ? loadJSON<Place[]>(persistKey, seed ?? demoPlaces()) : (seed ?? demoPlaces())).map((p) => ({ ...p }));
  const tick = () => new Promise<void>((r) => setTimeout(r, 0));
  const snap = () => places.map((p) => ({ ...p }));

  const base: PlacesService = {
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
  return persistAfter(base, persistKey, snap);
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
    // الرياض
    { id: 'p1', name: 'مطعم نجد', category: 'RESTAURANTS', area: 'حي السفارات', city: 'الرياض', rating: 4.6, ratingCount: 210, suggested: true },
    { id: 'p2', name: 'قصر المصمك', category: 'LANDMARKS', area: 'الديرة', city: 'الرياض', rating: 4.8, ratingCount: 1200, suggested: true },
    { id: 'p3', name: 'حديقة الملك عبدالله', category: 'ACTIVITIES', area: 'الملز', city: 'الرياض', rating: 4.3, ratingCount: 540 },
    { id: 'p4', name: 'بوليفارد الرياض', category: 'SHOPPING', area: 'حطين', city: 'الرياض', rating: 4.5, ratingCount: 980, suggested: true },
    { id: 'p5', name: 'كافيه المدينة', category: 'RESTAURANTS', area: 'العليا', city: 'الرياض', rating: 4.1, ratingCount: 88 },
    { id: 'p6', name: 'جبل طويق', category: 'ACTIVITIES', area: 'الحافة', city: 'الرياض', rating: 4.7, ratingCount: 300 },
    // جدة
    { id: 'p7', name: 'كورنيش جدة', category: 'LANDMARKS', area: 'الشاطئ', city: 'جدة', rating: 4.7, ratingCount: 1500, suggested: true },
    { id: 'p8', name: 'البلد التاريخية', category: 'LANDMARKS', area: 'البلد', city: 'جدة', rating: 4.6, ratingCount: 870 },
    { id: 'p9', name: 'مطعم الطازج للأسماك', category: 'RESTAURANTS', area: 'الحمراء', city: 'جدة', rating: 4.5, ratingCount: 430, suggested: true },
    { id: 'p10', name: 'كافيه بريك', category: 'RESTAURANTS', area: 'الروضة', city: 'جدة', rating: 4.2, ratingCount: 150 },
    { id: 'p11', name: 'مول الرد سي', category: 'SHOPPING', area: 'أبحر', city: 'جدة', rating: 4.4, ratingCount: 610 },
    // العلا
    { id: 'p12', name: 'مدائن صالح (الحِجر)', category: 'LANDMARKS', area: 'العلا', city: 'العلا', rating: 4.9, ratingCount: 2100, suggested: true },
    { id: 'p13', name: 'مرايا', category: 'ACTIVITIES', area: 'أشار', city: 'العلا', rating: 4.8, ratingCount: 640, suggested: true },
    { id: 'p14', name: 'جبل الفيل', category: 'LANDMARKS', area: 'العلا', city: 'العلا', rating: 4.7, ratingCount: 520 },
    { id: 'p15', name: 'مطعم صخرة', category: 'RESTAURANTS', area: 'العلا القديمة', city: 'العلا', rating: 4.5, ratingCount: 180 },
    // أبها
    { id: 'p16', name: 'السودة', category: 'ACTIVITIES', area: 'السودة', city: 'أبها', rating: 4.6, ratingCount: 720, suggested: true },
    { id: 'p17', name: 'قرية المفتاحة', category: 'LANDMARKS', area: 'المفتاحة', city: 'أبها', rating: 4.4, ratingCount: 260 },
    { id: 'p18', name: 'كافيه الضباب', category: 'RESTAURANTS', area: 'أبها الجديدة', city: 'أبها', rating: 4.3, ratingCount: 140 },
    // الدمام
    { id: 'p19', name: 'كورنيش الدمام', category: 'LANDMARKS', area: 'الكورنيش', city: 'الدمام', rating: 4.4, ratingCount: 690 },
    { id: 'p20', name: 'جزيرة المرجان', category: 'ACTIVITIES', area: 'المرجان', city: 'الدمام', rating: 4.3, ratingCount: 310 },
    { id: 'p21', name: 'مطعم بحري الخليج', category: 'RESTAURANTS', area: 'الشاطئ', city: 'الدمام', rating: 4.5, ratingCount: 220, suggested: true },
  ];
}

export function createPlacesService(): PlacesService {
  return import.meta.env.VITE_API_BASE_URL ? createApiPlacesService() : createMockPlacesService(undefined, 'bp.places.v1');
}
