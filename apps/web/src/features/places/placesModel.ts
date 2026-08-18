// Pure model + helpers for US-012 (explore & recommendations).
// NOTE: no Maps/Places API key ever lives in the client (AC6) — place data comes
// from a backend proxy (keys server-side, cached); the mock stands in for it.

export type PlaceCategory = 'RESTAURANTS' | 'LANDMARKS' | 'ACTIVITIES' | 'SHOPPING';
export const PLACE_CATEGORIES: PlaceCategory[] = ['RESTAURANTS', 'LANDMARKS', 'ACTIVITIES', 'SHOPPING'];

export interface Place {
  id: string;
  name: string;
  category: PlaceCategory;
  area: string;
  city: string;
  rating: number; // aggregate 0–5
  ratingCount: number;
  suggested?: boolean;
  myRating?: number; // the current user's rating, if any
}

/** Filter by category (or 'ALL') + free-text over name/area/city (FR-012-001). */
export function filterPlaces(list: Place[], category: PlaceCategory | 'ALL', query: string): Place[] {
  const q = query.trim().toLowerCase();
  return list.filter((p) =>
    (category === 'ALL' || p.category === category) &&
    (!q || p.name.toLowerCase().includes(q) || p.area.toLowerCase().includes(q) || p.city.toLowerCase().includes(q)),
  );
}

/** Clamp a rating to the valid 1–5 range (VR-012-001). */
export function clampRating(n: number): number {
  return Math.min(5, Math.max(1, Math.round(n)));
}

/** Apply a user's rating to a place: first rating grows the count, a re-rating
 *  updates in place without duplicating (BR-012-002, AC4). Returns a new Place. */
export function applyRating(place: Place, rating: number): Place {
  const r = clampRating(rating);
  const firstTime = place.myRating === undefined;
  const count = firstTime ? place.ratingCount + 1 : place.ratingCount;
  const prev = place.myRating ?? 0;
  // Aggregate: add a new sample, or swap the user's previous sample in place.
  const total = place.rating * place.ratingCount - (firstTime ? 0 : prev) + r;
  const rating_ = count > 0 ? Math.round((total / count) * 10) / 10 : r;
  return { ...place, myRating: r, ratingCount: count, rating: rating_ };
}
