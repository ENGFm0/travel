// Pure model for "Success Partners" (شركاء النجاح) shown under Explore.
// A curated directory of travel-related businesses (agencies, hotels, car
// rental, flights, activities). Read-only marketing content; real listings will
// come from the backend/Firestore later.

export type PartnerCategory = 'AGENCY' | 'HOTELS' | 'CARS' | 'FLIGHTS' | 'ACTIVITIES';
export const PARTNER_CATEGORIES: PartnerCategory[] = ['AGENCY', 'HOTELS', 'CARS', 'FLIGHTS', 'ACTIVITIES'];

/** Material Symbols icon per partner category (UI hint). */
export const PARTNER_ICON: Record<PartnerCategory, string> = {
  AGENCY: 'travel_explore',
  HOTELS: 'hotel',
  CARS: 'directions_car',
  FLIGHTS: 'flight',
  ACTIVITIES: 'hiking',
};

export interface Partner {
  id: string;
  name: string;
  category: PartnerCategory;
  /** City name, or 'ALL' for nationwide coverage. */
  coverage: string;
  tagline: string;
  url?: string;
  featured?: boolean;
}

/** Filter partners by category (or 'ALL'), featured first. */
export function filterPartners(list: Partner[], category: PartnerCategory | 'ALL'): Partner[] {
  return list
    .filter((p) => category === 'ALL' || p.category === category)
    .slice()
    .sort((a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured)));
}
