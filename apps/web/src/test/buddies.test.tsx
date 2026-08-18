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
import { useBuddiesStore } from '@/features/buddies/buddiesStore';
import { createMockBuddiesService } from '@/features/buddies/buddiesService';
import { applyFilters, statusOf, canManage, spotsLeft, type BuddyRequest } from '@/features/buddies/buddiesModel';

function req(over: Partial<BuddyRequest>): BuddyRequest {
  return {
    id: 'r', kind: 'FULL_TRIP', title: 'T', city: 'Riyadh', dateFrom: '2099-01-01', dateTo: '2099-01-05',
    category: 'GENERAL', budget: 'MEDIUM', capacity: 4, participantUids: [], ownerUid: 'u1', closed: false, description: '',
    ...over,
  };
}

// ── Pure model ────────────────────────────────────────────────────────────────
describe('US-011 buddies model', () => {
  it('combines mode + city + category + budget filters (AC1)', () => {
    const list = [
      req({ id: '1', kind: 'FULL_TRIP', city: 'Riyadh', category: 'FAMILIES' }),
      req({ id: '2', kind: 'FULL_TRIP', city: 'London', category: 'YOUTH' }),
      req({ id: '3', kind: 'MEETUP', city: 'Riyadh', category: 'FAMILIES' }),
    ];
    const out = applyFilters(list, { kind: 'FULL_TRIP', city: 'riy', category: 'FAMILIES', budget: 'ALL' });
    expect(out.map((r) => r.id)).toEqual(['1']);
  });
  it('derives status + spots and owner rights', () => {
    expect(statusOf(req({ capacity: 2, participantUids: ['a'] }))).toBe('OPEN');
    expect(statusOf(req({ capacity: 1, participantUids: ['a'] }))).toBe('FULL');
    expect(statusOf(req({ closed: true }))).toBe('CLOSED');
    expect(spotsLeft(req({ capacity: 4, participantUids: ['a', 'b'] }))).toBe(2);
    expect(canManage(req({ ownerUid: 'me' }), 'me')).toBe(true);
    expect(canManage(req({ ownerUid: 'x' }), 'me')).toBe(false);
  });
});

// ── Component ───────────────────────────────────────────────────────────────
function seed(list: BuddyRequest[]) {
  useBuddiesStore.getState().setService(createMockBuddiesService(list));
}

beforeEach(() => {
  localStorage.clear();
  useUIStore.setState({ theme: 'system', locale: 'en' });
  useAuthStore.setState({ status: 'loading', user: null, modalOpen: false });
  useAuthStore.getState().setProvider(createMockAuthProvider());
  useBuddiesStore.setState({ requests: null, loading: false, error: null, flagged: null });
});
afterEach(() => vi.restoreAllMocks());

function renderBuddies() {
  const router = createMemoryRouter(routes, { initialEntries: ['/buddies'] });
  return render(<ThemeProvider><LocaleProvider><RouterProvider router={router} /></LocaleProvider></ThemeProvider>);
}
async function signIn() {
  await useAuthStore.getState().provider!.signInWithPassword('user@example.com', 'password1');
  await waitFor(() => expect(useAuthStore.getState().status).toBe('authenticated'));
}
async function findCard(title: string): Promise<HTMLElement> {
  const el = await screen.findByText(title);
  return el.closest('article') as HTMLElement;
}

describe('US-011 Travel Buddies UI', () => {
  it('filters the grid by category (AC1)', async () => {
    seed([
      req({ id: '1', title: 'Riyadh Families', city: 'Riyadh', category: 'FAMILIES', ownerUid: 'u1', participantUids: ['u1'] }),
      req({ id: '2', title: 'London Youth', city: 'London', category: 'YOUTH', ownerUid: 'u2', participantUids: ['u2'] }),
    ]);
    renderBuddies();
    await screen.findByText('Riyadh Families');
    await userEvent.selectOptions(screen.getByLabelText('Category'), 'FAMILIES');
    await waitFor(() => expect(screen.queryByText('London Youth')).not.toBeInTheDocument());
    expect(screen.getByText('Riyadh Families')).toBeInTheDocument();
  });

  it('lets an authenticated user join an open request (AC2)', async () => {
    await signIn();
    seed([req({ id: '2', title: 'London Youth', ownerUid: 'u2', participantUids: ['u2'], capacity: 4 })]);
    renderBuddies();
    const c = await findCard('London Youth');
    await within(c).findByRole('button', { name: 'Join' });
    await userEvent.click(within(c).getByRole('button', { name: 'Join' }));
    await waitFor(() => expect(useBuddiesStore.getState().requests?.find((r) => r.id === '2')?.participantUids).toContain('me'));
    expect(within(c).getByRole('button', { name: 'Leave' })).toBeInTheDocument();
  });

  it('shows FULL and blocks joining when capacity is reached (AC2)', async () => {
    await signIn();
    seed([req({ id: 'f', title: 'Full One', ownerUid: 'u3', participantUids: ['u3'], capacity: 1 })]);
    renderBuddies();
    const btn = await within(await findCard('Full One')).findByRole('button', { name: 'Full' });
    expect(btn).toBeDisabled();
  });

  it('owner can close their request (AC3)', async () => {
    await signIn();
    seed([req({ id: 'm', title: 'Mine Trip', ownerUid: 'me', participantUids: ['me'] })]);
    renderBuddies();
    const cm = await findCard('Mine Trip');
    await userEvent.click(await within(cm).findByRole('button', { name: 'Close request' }));
    expect(await within(cm).findByText('Closed')).toBeInTheDocument();
  });

  it('routes a guest to auth when trying to join (BR-011-004)', async () => {
    seed([req({ id: '2', title: 'London Youth', ownerUid: 'u2', participantUids: ['u2'] })]);
    renderBuddies();
    await userEvent.click(await within(await findCard('London Youth')).findByRole('button', { name: 'Join' }));
    expect(await screen.findByTestId('auth-modal')).toBeInTheDocument();
  });

  it('flags a request for moderation (AC5)', async () => {
    seed([req({ id: '2', title: 'London Youth', ownerUid: 'u2', participantUids: ['u2'] })]);
    renderBuddies();
    await userEvent.click(await within(await findCard('London Youth')).findByRole('button', { name: 'Report' }));
    expect(await screen.findByText('Reported for moderation. Thank you.')).toBeInTheDocument();
  });
});
