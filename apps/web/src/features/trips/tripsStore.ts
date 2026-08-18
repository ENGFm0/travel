import { create } from 'zustand';
import type { TripStatus } from '@boardingpass/types';
import type { CreateTripPayload, Trip, TripsService } from './tripsService';
import { createTripsService } from './tripsService';

interface TripsStore {
  service: TripsService | null;
  wizardOpen: boolean;
  lastCreated: Trip | null;
  /** null = not loaded yet; [] = loaded and empty. */
  trips: Trip[] | null;
  loading: boolean;
  error: string | null;
  setService: (s: TripsService) => void;
  openWizard: () => void;
  closeWizard: () => void;
  setLastCreated: (t: Trip | null) => void;
  _setTrips: (t: Trip[]) => void;
  _setLoading: (v: boolean) => void;
  _setError: (e: string | null) => void;
}

export const useTripsStore = create<TripsStore>((set) => ({
  service: null,
  wizardOpen: false,
  lastCreated: null,
  trips: null,
  loading: false,
  error: null,
  setService: (service) => set({ service }),
  openWizard: () => set({ wizardOpen: true, lastCreated: null }),
  closeWizard: () => set({ wizardOpen: false }),
  setLastCreated: (lastCreated) => set({ lastCreated }),
  _setTrips: (trips) => set({ trips }),
  _setLoading: (loading) => set({ loading }),
  _setError: (error) => set({ error }),
}));

export function initTrips(): void {
  if (!useTripsStore.getState().service) {
    useTripsStore.getState().setService(createTripsService());
  }
}

export function useTripsWizard() {
  const wizardOpen = useTripsStore((s) => s.wizardOpen);
  const openWizard = useTripsStore((s) => s.openWizard);
  const closeWizard = useTripsStore((s) => s.closeWizard);
  return { wizardOpen, openWizard, closeWizard };
}

/** Reactive view of the My Trips list (US-005). */
export function useTripsList() {
  const trips = useTripsStore((s) => s.trips);
  const loading = useTripsStore((s) => s.loading);
  const error = useTripsStore((s) => s.error);
  return { trips, loading, error };
}

function requireService(): TripsService {
  const svc = useTripsStore.getState().service;
  if (!svc) throw new Error('Trips service not initialized');
  return svc;
}

export const tripsActions = {
  async create(payload: CreateTripPayload): Promise<Trip> {
    const trip = await requireService().createTrip(payload);
    const { trips, _setTrips } = useTripsStore.getState();
    if (trips) _setTrips([trip, ...trips]); // keep the loaded list in sync
    return trip;
  },
  /** Loads all non-deleted trips; the page splits upcoming/past client-side. */
  async load(): Promise<void> {
    const s = useTripsStore.getState();
    s._setLoading(true);
    s._setError(null);
    try {
      const list = await requireService().listTrips('all');
      useTripsStore.getState()._setTrips(list);
    } catch {
      useTripsStore.getState()._setError('GENERIC');
    } finally {
      useTripsStore.getState()._setLoading(false);
    }
  },
  async setStatus(id: string, status: TripStatus): Promise<void> {
    await requireService().updateStatus(id, status);
    await this.load();
  },
  async remove(id: string): Promise<void> {
    await requireService().deleteTrip(id);
    await this.load();
  },
};
