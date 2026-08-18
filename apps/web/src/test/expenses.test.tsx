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
import { useExpensesStore } from '@/features/expenses/expensesStore';
import { createMockExpensesService, setMockCurrentUser } from '@/features/expenses/expensesService';

const TRIP: Trip = {
  id: 'trip-x', title: 'رحلة', type: 'INTERNATIONAL', dateFrom: '2099-05-01', dateTo: '2099-05-10',
  cities: [{ name: 'لندن' }], ownerUid: 'me', status: 'ACTIVE', progress: 10,
};
const OWNER: Member = { uid: 'me', displayName: 'خالد', role: 'OWNER', status: 'ACTIVE' };
const U2: Member = { uid: 'u2', displayName: 'سالم', role: 'MEMBER', status: 'ACTIVE' };
const U3: Member = { uid: 'u3', displayName: 'نورة', role: 'MEMBER', status: 'ACTIVE' };

function seed(members: Member[]) {
  useTripsStore.getState().setService(createMockTripsService([structuredClone(TRIP)]));
  useMembersStore.getState().setService(createMockMembersService({ 'trip-x': structuredClone(members) }));
  useExpensesStore.getState().setService(createMockExpensesService());
}

beforeEach(() => {
  localStorage.clear();
  useUIStore.setState({ theme: 'system', locale: 'en' }); // predictable currency formatting
  useAuthStore.setState({ status: 'loading', user: null, modalOpen: false });
  useAuthStore.getState().setProvider(createMockAuthProvider());
  useMembersStore.setState({ tripId: null, members: null, loading: false, error: null });
  useExpensesStore.setState({ finance: null, me: 'me', memberUids: [], loading: false, error: null });
});
afterEach(() => vi.restoreAllMocks());

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  return render(<ThemeProvider><LocaleProvider><RouterProvider router={router} /></LocaleProvider></ThemeProvider>);
}
async function signIn() {
  await useAuthStore.getState().provider!.signInWithPassword('user@example.com', 'password1');
  await waitFor(() => expect(useAuthStore.getState().status).toBe('authenticated'));
}

describe('US-007 Expenses UI', () => {
  it('owner sets the kitty total → equal dues, then confirms a payment', async () => {
    await signIn();
    seed([OWNER, U2, U3]);
    renderAt('/trips/trip-x#expenses');
    await screen.findByRole('tab', { name: 'Kitty' });
    await userEvent.type(screen.getByLabelText('Kitty total'), '4500');
    await userEvent.click(screen.getByRole('button', { name: 'Set total' }));
    // three equal dues of 1,500.00
    await waitFor(() => expect(screen.getAllByText(/1,500\.00/).length).toBeGreaterThanOrEqual(3));
    expect(screen.queryByText('Paid')).not.toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('button', { name: 'Confirm paid' })[0]);
    expect(await screen.findByText('Paid')).toBeInTheDocument();
  });

  it('hides owner-only kitty controls from a non-owner (BR-007-001)', async () => {
    await signIn();
    seed([{ ...OWNER, uid: 'me', role: 'MEMBER' }, { ...U2, role: 'OWNER' }, U3]);
    renderAt('/trips/trip-x#expenses');
    await screen.findByRole('tab', { name: 'Kitty' });
    expect(screen.queryByLabelText('Kitty total')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirm paid' })).not.toBeInTheDocument();
  });

  it('adds a group expense to the log', async () => {
    await signIn();
    seed([OWNER, U2, U3]);
    renderAt('/trips/trip-x#expenses');
    await screen.findByRole('tab', { name: 'Kitty' });
    await userEvent.type(screen.getByLabelText('Description'), 'Hotel');
    await userEvent.type(screen.getByLabelText('Amount'), '800');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(await screen.findByText('Hotel')).toBeInTheDocument();
    expect(screen.getAllByText(/800\.00/).length).toBeGreaterThan(0);
  });

  it('computes my net balance in the summary (AC6)', async () => {
    await signIn();
    seed([OWNER, U2, U3]);
    renderAt('/trips/trip-x#expenses');
    await screen.findByRole('tab', { name: 'Kitty' });
    await userEvent.type(screen.getByLabelText('Description'), 'Taxi');
    await userEvent.type(screen.getByLabelText('Amount'), '300'); // paid by me, split 3 → net +200
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    await screen.findByText('Taxi');
    await userEvent.click(screen.getByRole('tab', { name: 'Summary' }));
    expect(await screen.findByText('Owed to you')).toBeInTheDocument();
    expect(screen.getByText(/200\.00/)).toBeInTheDocument();
  });

  it('creates a side kitty among two participants (AC3)', async () => {
    await signIn();
    seed([OWNER, U2, U3]);
    renderAt('/trips/trip-x#expenses');
    await screen.findByRole('tab', { name: 'Kitty' });
    await userEvent.click(screen.getByRole('tab', { name: 'Side kitties' }));
    await userEvent.type(screen.getByLabelText('Title'), 'Airport taxi');
    await userEvent.type(screen.getByLabelText('Amount'), '600');
    const checks = screen.getAllByRole('checkbox');
    await userEvent.click(checks[0]);
    await userEvent.click(checks[1]);
    await userEvent.click(screen.getByRole('button', { name: 'Create side kitty' }));
    expect(await screen.findByText('Airport taxi')).toBeInTheDocument();
    expect(screen.getByText(/300\.00/)).toBeInTheDocument(); // 600 / 2
  });
});

describe('US-007 personal privacy (BR-007-003)', () => {
  it('personal expenses are visible only to their owner', async () => {
    const s = createMockExpensesService();
    const init = { memberUids: ['me', 'u2'], base: 'SAR', dest: 'GBP', rate: 0.2122 };
    setMockCurrentUser('t', 'me');
    await s.getFinance('t', init, 'me');
    await s.addPersonal('t', { desc: 'coffee', amount: 25 });
    const mine = await s.getFinance('t', init, 'me');
    const others = await s.getFinance('t', init, 'u2');
    expect(mine.personal).toHaveLength(1);
    expect(others.personal).toHaveLength(0);
  });
});
