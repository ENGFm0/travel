import { create } from 'zustand';
import type { FlightInfo } from './flightsModel';
import { FlightsError, type FlightsErrorCode, type FlightsService } from './flightsService';
import { createFlightsService } from './flightsService';

interface FlightsStore {
  service: FlightsService | null;
  setService: (s: FlightsService) => void;
}

export const useFlightsStore = create<FlightsStore>((set) => ({
  service: null,
  setService: (service) => set({ service }),
}));

export function initFlights(): void {
  if (!useFlightsStore.getState().service) {
    useFlightsStore.getState().setService(createFlightsService());
  }
}

export type LookupResult =
  | { kind: 'found'; info: FlightInfo }
  | { kind: 'empty' }
  | { kind: 'error'; code: FlightsErrorCode };

export const flightsActions = {
  async lookup(code: string): Promise<LookupResult> {
    const svc = useFlightsStore.getState().service;
    if (!svc) throw new Error('Flights service not initialized');
    try {
      const info = await svc.lookup(code);
      return info ? { kind: 'found', info } : { kind: 'empty' };
    } catch (e) {
      return { kind: 'error', code: e instanceof FlightsError ? e.code : 'GENERIC' };
    }
  },
};
