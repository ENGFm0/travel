import { create } from 'zustand';
import type { CreateTripPayload, Trip, TripsService } from './tripsService';
import { createTripsService } from './tripsService';

interface TripsStore {
  service: TripsService | null;
  wizardOpen: boolean;
  lastCreated: Trip | null;
  setService: (s: TripsService) => void;
  openWizard: () => void;
  closeWizard: () => void;
  setLastCreated: (t: Trip | null) => void;
}

export const useTripsStore = create<TripsStore>((set) => ({
  service: null,
  wizardOpen: false,
  lastCreated: null,
  setService: (service) => set({ service }),
  openWizard: () => set({ wizardOpen: true, lastCreated: null }),
  closeWizard: () => set({ wizardOpen: false }),
  setLastCreated: (lastCreated) => set({ lastCreated }),
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

export const tripsActions = {
  create(payload: CreateTripPayload): Promise<Trip> {
    const svc = useTripsStore.getState().service;
    if (!svc) throw new Error('Trips service not initialized');
    return svc.createTrip(payload);
  },
};
