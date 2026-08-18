import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
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
import { useTripsStore } from '@/features/trips/tripsStore';
import { createMockTripsService, type Trip } from '@/features/trips/tripsService';
import { useMembersStore } from '@/features/members/membersStore';
import { createMockMembersService, type Member } from '@/features/members/membersService';
import { useItineraryStore } from '@/features/itinerary/itineraryStore';
import { createMockItineraryService } from '@/features/itinerary/itineraryService';

const TRIP: Trip = {
  id: 'trip-x', title: 'رحلة أوروبا', type: 'INTERNATIONAL',
  dateFrom: '2099-05-01', dateTo: '2099-05-20',
  cities: [{ name: 'باريس' }, { name: 'روما' }, { name: 'برلين' }],
  ownerUid: 'me', status: 'ACTIVE', progress: 10,
};
const OWNER: Member = { uid: 'me', displayName: 'خالد', role: 'OWNER', status: 'ACTIVE' };
const VIEWER: Member = { uid: 'me', displayName: 'خالد', role: 'VIEWER', status: 'ACTIVE' };

function seed(members: Member[]) {
  useTripsStore.getState().setService(createMockTripsService([structuredClone(TRIP)]));
  useMembersStore.getState().setService(createMockMembersService({ 'trip-x': structuredClone(members) }));
  useItineraryStore.getState().setService(createMockItineraryService());
}

beforeEach(() => {
  localStorage.clear();
  useUIStore.setState({ theme: 'system', locale: 'ar' });
  useAuthStore.setState({ status: 'loading', user: null, modalOpen: false });
  useAuthStore.getState().setProvider(createMockAuthProvider());
  useMembersStore.setState({ tripId: null, members: null, loading: false, error: null });
  useItineraryStore.setState({ board: null, loading: false, error: null });
});
afterEach(() => vi.restoreAllMocks());

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  return render(
    <ThemeProvider><LocaleProvider><RouterProvider router={router} /></LocaleProvider></ThemeProvider>,
  );
}
async function signIn() {
  await useAuthStore.getState().provider!.signInWithPassword('user@example.com', 'password1');
  await waitFor(() => expect(useAuthStore.getState().status).toBe('authenticated'));
}

describe('US-006 Itinerary dashboard', () => {
  it('renders the timeline from the trip cities and switches active city', async () => {
    await signIn();
    seed([OWNER]);
    renderAt('/trips/trip-x');
    // active city defaults to the first stop
    expect(await screen.findByRole('heading', { name: 'باريس', level: 3 })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: /روما/ }));
    expect(await screen.findByRole('heading', { name: 'روما', level: 3 })).toBeInTheDocument();
  });

  it('deep-links to the Members tab via #members', async () => {
    await signIn();
    seed([OWNER]);
    renderAt('/trips/trip-x#members');
    expect(await screen.findByRole('heading', { name: 'الأعضاء', level: 2 })).toBeInTheDocument();
  });

  it('adds a day and an activity', async () => {
    await signIn();
    seed([OWNER]);
    renderAt('/trips/trip-x');
    await screen.findByRole('heading', { name: 'باريس', level: 3 });
    expect(screen.getByText('لا توجد أيام بعد. أضف يومًا لبدء التخطيط.')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('أضف يومًا'), 'يوم اللوفر{enter}');
    expect(await screen.findByRole('heading', { name: 'يوم اللوفر', level: 4 })).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('أضف نشاطًا'), 'زيارة متحف اللوفر{enter}');
    expect(await screen.findByText('زيارة متحف اللوفر')).toBeInTheDocument();
  });

  it('hides edit controls for a viewer (read-only)', async () => {
    await signIn();
    seed([VIEWER]);
    renderAt('/trips/trip-x');
    await screen.findByRole('heading', { name: 'باريس', level: 3 });
    expect(screen.queryByLabelText('أضف يومًا')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('أضف مدينة')).not.toBeInTheDocument();
  });

  it('deletes a city (cascade), removing it from the timeline', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await signIn();
    seed([OWNER]);
    renderAt('/trips/trip-x');
    await screen.findByRole('heading', { name: 'باريس', level: 3 });
    await userEvent.click(screen.getByRole('button', { name: 'حذف المدينة' }));
    // active resets to the first remaining city
    await waitFor(() => expect(screen.queryByRole('tab', { name: /^1\s*باريس/ })).not.toBeInTheDocument());
    expect(screen.getByRole('heading', { name: 'روما', level: 3 })).toBeInTheDocument();
  });
});
