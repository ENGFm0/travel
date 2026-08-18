import { create } from 'zustand';
import type { Board, CitySeed, ItineraryService } from './itineraryService';
import { createItineraryService } from './itineraryService';

interface ItineraryStore {
  service: ItineraryService | null;
  board: Board | null;
  loading: boolean;
  error: string | null;
  setService: (s: ItineraryService) => void;
  _set: (p: Partial<ItineraryStore>) => void;
}

export const useItineraryStore = create<ItineraryStore>((set) => ({
  service: null,
  board: null,
  loading: false,
  error: null,
  setService: (service) => set({ service }),
  _set: (p) => set(p),
}));

export function initItinerary(): void {
  if (!useItineraryStore.getState().service) {
    useItineraryStore.getState().setService(createItineraryService());
  }
}

export function useItinerary() {
  const board = useItineraryStore((s) => s.board);
  const loading = useItineraryStore((s) => s.loading);
  const error = useItineraryStore((s) => s.error);
  return { board, loading, error };
}

function svc(): ItineraryService {
  const s = useItineraryStore.getState().service;
  if (!s) throw new Error('Itinerary service not initialized');
  return s;
}

async function apply(fn: () => Promise<Board>): Promise<void> {
  useItineraryStore.getState()._set({ error: null });
  try {
    const board = await fn();
    useItineraryStore.getState()._set({ board });
  } catch {
    useItineraryStore.getState()._set({ error: 'GENERIC' });
  }
}

export const itineraryActions = {
  async load(tripId: string, seed: CitySeed[]): Promise<void> {
    useItineraryStore.getState()._set({ loading: true, error: null });
    try {
      const board = await svc().getBoard(tripId, seed);
      useItineraryStore.getState()._set({ board });
    } catch {
      useItineraryStore.getState()._set({ error: 'GENERIC' });
    } finally {
      useItineraryStore.getState()._set({ loading: false });
    }
  },
  addCity: (tripId: string, name: string) => apply(() => svc().addCity(tripId, name)),
  moveCity: (tripId: string, cityId: string, dir: -1 | 1) => apply(() => svc().moveCity(tripId, cityId, dir)),
  deleteCity: (tripId: string, cityId: string) => apply(() => svc().deleteCity(tripId, cityId)),
  setCityInfo: (tripId: string, cityId: string, info: { flight?: string; hotel?: string }) => apply(() => svc().setCityInfo(tripId, cityId, info)),
  addDay: (tripId: string, cityId: string, title: string, date?: string) => apply(() => svc().addDay(tripId, cityId, title, date)),
  deleteDay: (tripId: string, cityId: string, dayId: string) => apply(() => svc().deleteDay(tripId, cityId, dayId)),
  addActivity: (tripId: string, cityId: string, dayId: string, title: string, time?: string) => apply(() => svc().addActivity(tripId, cityId, dayId, title, time)),
  deleteActivity: (tripId: string, cityId: string, dayId: string, activityId: string) => apply(() => svc().deleteActivity(tripId, cityId, dayId, activityId)),
  reset: () => useItineraryStore.getState()._set({ board: null, error: null }),
};
