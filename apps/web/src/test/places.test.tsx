import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import '@/shared/i18n';
import { routes } from '@/app/router';
import { ThemeProvider } from '@/app/providers/ThemeProvider';
import { LocaleProvider } from '@/app/providers/LocaleProvider';
import { useUIStore } from '@/app/store/uiStore';
import { useAuthStore } from '@/features/auth/authStore';
import { createMockAuthProvider } from '@/features/auth/providers/mockAuthProvider';
import { useTripsStore } from '@/features/trips/tripsStore';
import { createMockTripsService, type Trip } from '@/features/trips/tripsService';
import { usePlacesStore } from '@/features/places/placesStore';
import { createMockPlacesService } from '@/features/places/placesService';
import { filterPlaces, clampRating, applyRating, type Place } from '@/features/places/placesModel';

function place(over: Partial<Place>): Place {
  return { id: 'p', name: 'P', category: 'RESTAURANTS', area: 'A', city: 'Riyadh', rating: 4, ratingCount: 10, ...over };
}

// ── Pure model ────────────────────────────────────────────────────────────────
describe('US-012 places model', () => {
  it('filters by category + text (AC1)', () => {
    const list = [
      place({ id: '1', name: 'Najd', category: 'RESTAURANTS' }),
      place({ id: '2', name: 'Masmak', category: 'LANDMARKS' }),
    ];
    expect(filterPlaces(list, 'RESTAURANTS', '').map((p) => p.id)).toEqual(['1']);
    expect(filterPlaces(list, 'ALL', 'masm').map((p) => p.id)).toEqual(['2']);
  });
  it('clamps ratings to 1..5', () => {
    expect(clampRating(0)).toBe(1);
    expect(clampRating(9)).toBe(5);
    expect(clampRating(3)).toBe(3);
  });
  it('applies a rating once, updating not duplicating (AC4)', () => {
    const p0 = place({ rating: 4, ratingCount: 10 });
    const p1 = applyRating(p0, 5);
    expect(p1.myRating).toBe(5);
    expect(p1.ratingCount).toBe(11); // first rating grows the count
    const p2 = applyRating(p1, 2);
    expect(p2.myRating).toBe(2);
    expect(p2.ratingCount).toBe(11); // re-rating does NOT add another
  });
});

// ── Component ───────────────────────────────────────────────────────────────
const P1 = place({ id: 'p1', name: 'Najd Restaurant', category: 'RESTAURANTS' });
const P2 = place({ id: 'p2', name: 'Masmak Fort', category: 'LANDMARKS' });
const TRIP: Trip = {
  id: 'trip-x', title: 'My Trip', type: 'DOMESTIC', dateFrom: '2099-05-01',
  cities: [{ name: 'Riyadh' }], ownerUid: 'me', status: 'ACTIVE', progress: 10,
};

function seed(places: Place[], trips: Trip[] = []) {
  usePlacesStore.getState().setService(createMockPlacesService(places));
  useTripsStore.getState().setService(createMockTripsService(trips.map((t) => structuredClone(t))));
}

beforeEach(() => {
  localStorage.clear();
  useUIStore.setState({ theme: 'system', locale: 'en' });
  useAuthStore.setState({ status: 'loading', user: null, modalOpen: false });
  useAuthStore.getState().setProvider(createMockAuthProvider());
  useTripsStore.setState({ wizardOpen: false, lastCreated: null, trips: null, loading: false, error: null });
  usePlacesStore.setState({ places: null, loading: false, error: null });
});
afterEach(() => vi.restoreAllMocks());

function renderExplore() {
  const router = createMemoryRouter(routes, { initialEntries: ['/explore'] });
  return render(<ThemeProvider><LocaleProvider><RouterProvider router={router} /></LocaleProvider></ThemeProvider>);
}
async function signIn() {
  await useAuthStore.getState().provider!.signInWithPassword('user@example.com', 'password1');
  await waitFor(() => expect(useAuthStore.getState().status).toBe('authenticated'));
}
const cardOf = async (title: string) => (await screen.findByText(title)).closest('article') as HTMLElement;

describe('US-012 Explore UI', () => {
  it('filters places by category chip (AC1)', async () => {
    seed([P1, P2]);
    renderExplore();
    await screen.findByText('Najd Restaurant');
    await userEvent.click(screen.getByRole('button', { name: 'Restaurants & cafés' }));
    await waitFor(() => expect(screen.queryByText('Masmak Fort')).not.toBeInTheDocument());
    expect(screen.getByText('Najd Restaurant')).toBeInTheDocument();
  });

  it('lets an authenticated user rate a place (AC4)', async () => {
    await signIn();
    seed([P1]);
    renderExplore();
    const c = await cardOf('Najd Restaurant');
    await userEvent.click(within(c).getByRole('button', { name: 'Rate 4 stars' }));
    await waitFor(() => expect(usePlacesStore.getState().places?.find((p) => p.id === 'p1')?.myRating).toBe(4));
  });

  it('routes a guest to auth when rating (permission)', async () => {
    seed([P1]);
    renderExplore();
    const c = await cardOf('Najd Restaurant');
    await userEvent.click(within(c).getByRole('button', { name: 'Rate 4 stars' }));
    expect(await screen.findByTestId('auth-modal')).toBeInTheDocument();
  });

  it('adds a place to a trip the user belongs to (AC3)', async () => {
    await signIn();
    seed([P1], [TRIP]);
    renderExplore();
    const c = await cardOf('Najd Restaurant');
    await userEvent.click(await within(c).findByRole('button', { name: 'Add to trip' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Add' })); // confirm in modal
    expect(await screen.findByText('Added to My Trip ✓')).toBeInTheDocument();
  });

  it('does not offer add-to-trip when the user has no trips (AC5)', async () => {
    await signIn();
    seed([P1], []); // no trips
    renderExplore();
    await cardOf('Najd Restaurant');
    await waitFor(() => expect(useTripsStore.getState().trips).toEqual([]));
    expect(screen.queryByRole('button', { name: 'Add to trip' })).not.toBeInTheDocument();
  });
});
