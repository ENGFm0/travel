import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import '@/shared/i18n';
import { routes } from '@/app/router';
import { ThemeProvider } from '@/app/providers/ThemeProvider';
import { LocaleProvider } from '@/app/providers/LocaleProvider';
import { useUIStore } from '@/app/store/uiStore';
import { useAuthStore } from '@/features/auth/authStore';
import { createMockAuthProvider } from '@/features/auth/providers/mockAuthProvider';
import { usePlacesStore } from '@/features/places/placesStore';
import { createMockPlacesService } from '@/features/places/placesService';
import { usePartnersStore } from '@/features/partners/partnersStore';
import { createMockPartnersService } from '@/features/partners/partnersService';
import { filterPartners, type Partner } from '@/features/partners/partnersModel';
import { filterPlaces, citiesOf, type Place } from '@/features/places/placesModel';

const place = (o: Partial<Place>): Place =>
  ({ id: 'p', name: 'P', category: 'RESTAURANTS', area: 'A', city: 'Riyadh', rating: 4, ratingCount: 1, ...o });
const partner = (o: Partial<Partner>): Partner =>
  ({ id: 'x', name: 'X', category: 'AGENCY', coverage: 'ALL', tagline: 't', ...o });

function renderExplore() {
  const router = createMemoryRouter(routes, { initialEntries: ['/explore'] });
  return render(<ThemeProvider><LocaleProvider><RouterProvider router={router} /></LocaleProvider></ThemeProvider>);
}

beforeEach(() => {
  localStorage.clear();
  useUIStore.setState({ theme: 'system', locale: 'en' });
  useAuthStore.setState({ status: 'loading', user: null, modalOpen: false });
  useAuthStore.getState().setProvider(createMockAuthProvider());
  usePlacesStore.setState({ places: null, loading: false, error: null });
  usePartnersStore.setState({ partners: null, loading: false, error: null });
});

describe('partners model', () => {
  it('filters by category and puts featured first', () => {
    const list = [
      partner({ id: '1', category: 'HOTELS' }),
      partner({ id: '2', category: 'AGENCY' }),
      partner({ id: '3', category: 'AGENCY', featured: true }),
    ];
    expect(filterPartners(list, 'AGENCY').map((p) => p.id)).toEqual(['3', '2']);
    expect(filterPartners(list, 'HOTELS').map((p) => p.id)).toEqual(['1']);
  });
});

describe('places city helpers', () => {
  it('lists unique cities and filters by city', () => {
    const list = [place({ id: '1', city: 'Riyadh' }), place({ id: '2', city: 'Jeddah' }), place({ id: '3', city: 'Riyadh' })];
    expect(citiesOf(list)).toEqual(['Riyadh', 'Jeddah']);
    expect(filterPlaces(list, 'ALL', '', 'Jeddah').map((p) => p.id)).toEqual(['2']);
  });
});

describe('Explore tabs UI', () => {
  it('switches to the Success Partners tab and filters partners by category', async () => {
    usePlacesStore.getState().setService(createMockPlacesService([place({ id: 'p1', name: 'Najd' })]));
    usePartnersStore.getState().setService(createMockPartnersService([
      partner({ id: 'a1', name: 'Wings Air', category: 'FLIGHTS' }),
      partner({ id: 'a2', name: 'Oasis Hotels', category: 'HOTELS' }),
    ]));
    renderExplore();

    await userEvent.click(await screen.findByRole('tab', { name: 'Success Partners' }));
    expect(await screen.findByText('Wings Air')).toBeInTheDocument();
    expect(screen.getByText('Oasis Hotels')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Flights' }));
    await waitFor(() => expect(screen.queryByText('Oasis Hotels')).not.toBeInTheDocument());
    expect(screen.getByText('Wings Air')).toBeInTheDocument();
  });

  it('filters places by the city selector', async () => {
    usePlacesStore.getState().setService(createMockPlacesService([
      place({ id: 'p1', name: 'Najd', city: 'Riyadh' }),
      place({ id: 'p2', name: 'Corniche', city: 'Jeddah' }),
    ]));
    usePartnersStore.getState().setService(createMockPartnersService([]));
    renderExplore();

    await screen.findByText('Najd');
    const cityInput = screen.getByLabelText('City');
    await userEvent.clear(cityInput);
    await userEvent.type(cityInput, 'Jeddah');
    await waitFor(() => expect(screen.queryByText('Najd')).not.toBeInTheDocument());
    expect(screen.getByText('Corniche')).toBeInTheDocument();
  });
});
