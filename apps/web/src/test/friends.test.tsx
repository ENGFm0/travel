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
import { useFriendsStore } from '@/features/friends/friendsStore';
import { createMockFriendsService } from '@/features/friends/friendsService';
import { filterFriends, normalizeHandle, type Graph } from '@/features/friends/friendsModel';

// ── Pure model ────────────────────────────────────────────────────────────────
describe('US-010 friends model', () => {
  it('filters by name or username (AC3)', () => {
    const list = [
      { id: '1', name: 'Salem Otaibi', username: 'salem' },
      { id: '2', name: 'Noura Qahtani', username: 'noura' },
    ];
    expect(filterFriends(list, 'nou').map((f) => f.id)).toEqual(['2']);
    expect(filterFriends(list, 'otaibi').map((f) => f.id)).toEqual(['1']);
    expect(filterFriends(list, '')).toHaveLength(2);
  });
  it('normalizes handles (strips @, lowercases)', () => {
    expect(normalizeHandle('@Salem')).toBe('salem');
    expect(normalizeHandle('  NOURA ')).toBe('noura');
  });
});

// ── Component ───────────────────────────────────────────────────────────────
const TRIP: Trip = {
  id: 'trip-x', title: 'My Trip', type: 'DOMESTIC', dateFrom: '2099-05-01',
  cities: [{ name: 'Riyadh' }], ownerUid: 'me', status: 'ACTIVE', progress: 10,
};
const GRAPH: Graph = {
  friends: [
    { id: 'f1', name: 'Salem', username: 'salem' },
    { id: 'f2', name: 'Noura', username: 'noura' },
  ],
  incoming: [{ id: 'r1', name: 'Omar', username: 'omar' }],
};

function seed(graph: Graph) {
  useTripsStore.getState().setService(createMockTripsService([structuredClone(TRIP)]));
  useFriendsStore.getState().setService(createMockFriendsService(structuredClone(graph)));
}

beforeEach(() => {
  localStorage.clear();
  useUIStore.setState({ theme: 'system', locale: 'en' });
  useAuthStore.setState({ status: 'loading', user: null, modalOpen: false });
  useAuthStore.getState().setProvider(createMockAuthProvider());
  useTripsStore.setState({ wizardOpen: false, lastCreated: null, trips: null, loading: false, error: null });
  useFriendsStore.setState({ graph: null, loading: false, error: null });
});
afterEach(() => vi.restoreAllMocks());

function renderFriends() {
  const router = createMemoryRouter(routes, { initialEntries: ['/mytrips#friends'] });
  return render(<ThemeProvider><LocaleProvider><RouterProvider router={router} /></LocaleProvider></ThemeProvider>);
}
async function signIn() {
  await useAuthStore.getState().provider!.signInWithPassword('user@example.com', 'password1');
  await waitFor(() => expect(useAuthStore.getState().status).toBe('authenticated'));
}

describe('US-010 Friends & Group', () => {
  it('accepts an incoming request, adding a friend (AC1)', async () => {
    await signIn();
    seed(GRAPH);
    renderFriends();
    await screen.findByText('Omar');
    await userEvent.click(screen.getByRole('button', { name: 'Accept' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Accept' })).not.toBeInTheDocument());
    expect(screen.getByText('Omar')).toBeInTheDocument(); // now in the friends list
  });

  it('blocks a duplicate friend request (AC2)', async () => {
    await signIn();
    seed(GRAPH);
    renderFriends();
    await screen.findByLabelText('Add a friend');
    await userEvent.type(screen.getByLabelText('Add a friend'), 'salem');
    await userEvent.click(screen.getByRole('button', { name: 'Send request' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("already friends");
  });

  it('filters the friends list by search (AC3)', async () => {
    await signIn();
    seed(GRAPH);
    renderFriends();
    await screen.findByText('Salem');
    await userEvent.type(screen.getByLabelText('Search friends'), 'nou');
    await waitFor(() => expect(screen.queryByText('Salem')).not.toBeInTheDocument());
    expect(screen.getByText('Noura')).toBeInTheDocument();
  });

  it('removes a friend (AC5)', async () => {
    await signIn();
    seed(GRAPH);
    renderFriends();
    await screen.findByText('Salem');
    const salemRow = screen.getByText('Salem').closest('li') as HTMLElement;
    await userEvent.click(salemRow.querySelector('[aria-label="Remove friend"]') as HTMLElement);
    await waitFor(() => expect(screen.queryByText('Salem')).not.toBeInTheDocument());
  });

  it('shows an empty state with a buddies link when there are no friends (AC6)', async () => {
    await signIn();
    seed({ friends: [], incoming: [] });
    renderFriends();
    expect(await screen.findByText('No friends yet. Find people to travel with.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Discover buddies' })).toBeInTheDocument();
  });

  it('invites a friend to an owned trip (AC4)', async () => {
    await signIn();
    seed(GRAPH);
    renderFriends();
    await screen.findByText('Salem');
    // invite control appears once the owned trips load
    const inviteBtn = await screen.findAllByRole('button', { name: 'Invite to trip' });
    await userEvent.click(inviteBtn[0]);
    expect(await screen.findByText('Invited ✓')).toBeInTheDocument();
  });
});
