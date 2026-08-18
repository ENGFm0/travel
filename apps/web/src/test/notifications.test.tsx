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
import { useNotificationsStore } from '@/features/notifications/notificationsStore';
import { createMockNotificationsService } from '@/features/notifications/notificationsService';
import { unreadCount, deepLinkFor, iconFor, type AppNotification } from '@/features/notifications/notificationsModel';

const SEED: AppNotification[] = [
  { id: 'n1', type: 'TRIP_INVITE', read: false, ts: '2026-08-18T09:00:00', actor: 'Salem', tripId: 'trip-demo-1' },
  { id: 'n2', type: 'FRIEND_REQUEST', read: false, ts: '2026-08-17T18:30:00', actor: 'Noura' },
  { id: 'n3', type: 'PAYMENT_REMINDER', read: true, ts: '2026-08-16T12:00:00', tripId: 'trip-demo-1' },
];

// ── Pure model ────────────────────────────────────────────────────────────────
describe('US-015 notifications model', () => {
  it('counts unread', () => {
    expect(unreadCount(SEED)).toBe(2);
    expect(unreadCount(SEED.map((n) => ({ ...n, read: true })))).toBe(0);
  });
  it('maps types to deep-links and icons', () => {
    expect(deepLinkFor(SEED[0])).toBe('/trips/trip-demo-1#members');
    expect(deepLinkFor(SEED[1])).toBe('/mytrips#friends');
    expect(deepLinkFor(SEED[2])).toBe('/trips/trip-demo-1#expenses');
    expect(iconFor('BUDDY_JOIN')).toBe('diversity_3');
  });
});

// ── Component ───────────────────────────────────────────────────────────────
beforeEach(() => {
  localStorage.clear();
  useUIStore.setState({ theme: 'system', locale: 'en' });
  useAuthStore.setState({ status: 'loading', user: null, modalOpen: false });
  useAuthStore.getState().setProvider(createMockAuthProvider());
  useNotificationsStore.setState({ items: null, loading: false });
  useNotificationsStore.getState().setService(createMockNotificationsService(SEED));
});
afterEach(() => vi.restoreAllMocks());

function renderApp() {
  const router = createMemoryRouter(routes, { initialEntries: ['/'] });
  return render(<ThemeProvider><LocaleProvider><RouterProvider router={router} /></LocaleProvider></ThemeProvider>);
}
async function signIn() {
  await useAuthStore.getState().provider!.signInWithPassword('user@example.com', 'password1');
  await waitFor(() => expect(useAuthStore.getState().status).toBe('authenticated'));
}

describe('US-015 Notification center', () => {
  it('shows an unread badge and lists notifications (AC4)', async () => {
    await signIn();
    renderApp();
    const bell = await screen.findByRole('button', { name: /2 unread/ });
    await userEvent.click(bell);
    expect(await screen.findByRole('dialog', { name: 'Notifications' })).toBeInTheDocument();
    expect(screen.getByText('Salem invited you to a trip')).toBeInTheDocument();
  });

  it('marks all read, clearing the badge (AC4)', async () => {
    await signIn();
    renderApp();
    await userEvent.click(await screen.findByRole('button', { name: /2 unread/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Mark all read' }));
    await waitFor(() => expect(unreadCount(useNotificationsStore.getState().items ?? [])).toBe(0));
    expect(screen.queryByRole('button', { name: /unread/ })).not.toBeInTheDocument();
  });

  it('marks a single notification read on open', async () => {
    await signIn();
    renderApp();
    await userEvent.click(await screen.findByRole('button', { name: /2 unread/ }));
    await userEvent.click(screen.getByText('Noura sent you a friend request'));
    await waitFor(() => expect(useNotificationsStore.getState().items?.find((n) => n.id === 'n2')?.read).toBe(true));
  });

  it('does not show the bell for signed-out users', async () => {
    renderApp();
    await waitFor(() => expect(useAuthStore.getState().status).toBe('unauthenticated'));
    expect(screen.queryByRole('button', { name: /Notifications/ })).not.toBeInTheDocument();
  });
});
