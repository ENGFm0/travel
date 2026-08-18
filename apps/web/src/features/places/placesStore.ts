import { create } from 'zustand';
import type { Place } from './placesModel';
import type { PlacesService } from './placesService';
import { createPlacesService } from './placesService';

interface PlacesStore {
  service: PlacesService | null;
  places: Place[] | null;
  loading: boolean;
  error: string | null;
  setService: (s: PlacesService) => void;
  _set: (p: Partial<PlacesStore>) => void;
}

export const usePlacesStore = create<PlacesStore>((set) => ({
  service: null,
  places: null,
  loading: false,
  error: null,
  setService: (service) => set({ service }),
  _set: (p) => set(p),
}));

export function initPlaces(): void {
  if (!usePlacesStore.getState().service) {
    usePlacesStore.getState().setService(createPlacesService());
  }
}

export function usePlaces() {
  const places = usePlacesStore((s) => s.places);
  const loading = usePlacesStore((s) => s.loading);
  const error = usePlacesStore((s) => s.error);
  return { places, loading, error };
}

function svc(): PlacesService {
  const s = usePlacesStore.getState().service;
  if (!s) throw new Error('Places service not initialized');
  return s;
}

export const placesActions = {
  async load(): Promise<void> {
    usePlacesStore.getState()._set({ loading: true, error: null });
    try {
      const places = await svc().list();
      usePlacesStore.getState()._set({ places });
    } catch {
      usePlacesStore.getState()._set({ error: 'GENERIC' });
    } finally {
      usePlacesStore.getState()._set({ loading: false });
    }
  },
  async rate(placeId: string, rating: number): Promise<void> {
    try {
      const places = await svc().rate(placeId, rating);
      usePlacesStore.getState()._set({ places });
    } catch {
      usePlacesStore.getState()._set({ error: 'GENERIC' });
    }
  },
  addToTrip: (placeId: string, tripId: string, city: string) => svc().addToTrip(placeId, tripId, city),
};
