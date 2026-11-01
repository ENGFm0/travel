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
import { useExpensesStore, expensesActions } from '@/features/expenses/expensesStore';
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
    await userEvent.click(screen.getByRole('tab', { name: 'Expense log' }));
    await userEvent.type(screen.getByLabelText('Description'),'Hotel');
    await userEvent.type(screen.getByLabelText('Amount'), '800');
    await userEvent.selectOptions(screen.getByLabelText('Category'), 'FOOD');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(await screen.findByText('Hotel')).toBeInTheDocument();
    expect(screen.getAllByText(/800\.00/).length).toBeGreaterThan(0);
  });

  it('OPEN kitty: an expense I paid for everyone → my net is +200 in the summary (AC6)', async () => {
    await signIn();
    seed([OWNER, U2, U3]);
    renderAt('/trips/trip-x#expenses');
    await screen.findByRole('tab', { name: 'Kitty' });
    await expensesActions.setKittyMode('OPEN');
    await userEvent.click(screen.getByRole('tab', { name: 'Expense log' }));
    await screen.findByText('Who was with you?');
    await userEvent.click(screen.getByRole('tab', { name: 'Expense log' }));
    await userEvent.type(screen.getByLabelText('Description'),'Taxi');
    await userEvent.type(screen.getByLabelText('Amount'), '300'); // paid by me, everyone selected → split 3 → net +200
    await userEvent.selectOptions(screen.getByLabelText('Category'), 'FOOD');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    await screen.findByText('Taxi');
    await userEvent.click(screen.getByRole('tab', { name: 'Summary' }));
    expect(await screen.findByText('Owed to you')).toBeInTheDocument();
    expect(document.querySelector('[data-testid="my-net"] .bp-net__val')?.textContent).toMatch(/200\.00/);
  });

  it('FIXED kitty: pot-paid expenses are paid by the holder; the settlement is on actual spend', async () => {
    await signIn();
    seed([OWNER, U2, U3]);
    renderAt('/trips/trip-x#expenses');
    await screen.findByRole('tab', { name: 'Kitty' });
    await userEvent.type(screen.getByLabelText('Kitty total'), '900');
    await userEvent.click(screen.getByRole('button', { name: 'Set total' }));
    await userEvent.click(screen.getByRole('tab', { name: 'Expense log' }));
    // "Who paid?" defaults to the pot (held by the owner).
    expect((screen.getByLabelText('Who paid?') as HTMLSelectElement).value).toBe('__pot__');
    await userEvent.type(screen.getByLabelText('Description'), 'Dinner');
    await userEvent.type(screen.getByLabelText('Amount'), '300');
    await userEvent.selectOptions(screen.getByLabelText('Category'), 'FOOD');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(await screen.findByText('Dinner')).toBeInTheDocument();
    expect(screen.getByText('From the pot')).toBeInTheDocument();      // payer column
    await userEvent.click(screen.getByRole('tab', { name: 'Kitty' }));  // pot figures live on the Kitty tab
    expect(await screen.findByText('Spent from the pot')).toBeInTheDocument();
    await waitFor(() => {
      const f = useExpensesStore.getState().finance!;
      expect(f.group[0].payerUid).toBe('__pot__');
    });
    // Remaining is cash in hand (collected − spent): nothing collected yet → −300, flagged as a shortfall.
    expect(document.querySelector('.bp-stat--neg .bp-stat__val')?.textContent).toMatch(/300\.00/);
    expect(screen.getByText(/covered it out of pocket/)).toBeInTheDocument();
    // Settlement: 300 ÷ 3 = 100 each; the two others owe me 100 each → +200.
    await userEvent.click(screen.getByRole('tab', { name: 'Summary' }));
    await screen.findByText('Owed to you');
    expect(document.querySelector('[data-testid="my-net"] .bp-net__val')?.textContent).toMatch(/200\.00/);
  });

  it('FIXED kitty, reviewer scenario in the UI: 1,000 pot, all 3 paid in, 1,100 spent → 33.34 each to the holder', async () => {
    await signIn();
    seed([OWNER, U2, U3]);
    renderAt('/trips/trip-x#expenses');
    await screen.findByRole('tab', { name: 'Kitty' });
    await userEvent.type(screen.getByLabelText('Kitty total'), '1000');
    await userEvent.click(screen.getByRole('button', { name: 'Set total' }));
    // Dues are halala-exact and add up to exactly 1,000.
    expect(await screen.findByText(/333\.34/)).toBeInTheDocument();
    expect(screen.getAllByText(/333\.33/).length).toBeGreaterThanOrEqual(2);
    for (let i = 0; i < 3; i++) await userEvent.click(screen.getAllByRole('button', { name: 'Confirm paid' })[0]);
    await waitFor(() => expect(screen.getAllByText('Paid').length).toBe(3));
    await userEvent.click(screen.getByRole('tab', { name: 'Expense log' }));
    await userEvent.type(screen.getByLabelText('Description'),'Hotel');
    await userEvent.type(screen.getByLabelText('Amount'), '1100');
    await userEvent.selectOptions(screen.getByLabelText('Category'), 'HOUSING');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    await screen.findByText('Hotel');
    await userEvent.click(screen.getByRole('tab', { name: 'Summary' }));
    await screen.findByText('Owed to you');
    expect(document.querySelector('[data-testid="my-net"] .bp-net__val')?.textContent).toMatch(/66\.68/);
    expect(screen.getAllByText(/33\.34/).length).toBeGreaterThanOrEqual(2); // the two transfers to me
  });

  it('two members who both paid into an untouched pot are even — nobody owes anybody (user report)', async () => {
    await signIn();
    seed([OWNER, U2]);
    renderAt('/trips/trip-x#expenses');
    await screen.findByRole('tab', { name: 'Kitty' });
    await userEvent.type(screen.getByLabelText('Kitty total'), '1000');
    await userEvent.click(screen.getByRole('button', { name: 'Set total' }));
    await screen.findByText('Spent from the pot');
    for (let i = 0; i < 2; i++) await userEvent.click(screen.getAllByRole('button', { name: 'Confirm paid' })[0]);
    await waitFor(() => expect(screen.getAllByText('Paid').length).toBe(2));
    await userEvent.click(screen.getByRole('tab', { name: 'Summary' }));
    expect(await screen.findByText('All settled — no transfers needed')).toBeInTheDocument();
    expect(document.querySelector('[data-testid="my-net"] .bp-net__val')?.textContent).toMatch(/0\.00/);
    // The pot balance section shows each has 500 in the pot — shared, not a debt.
    expect(screen.getAllByText(/yours in the pot/).length).toBe(2);
  }, 15000);

  it('keeps a change log every member can see, and closing the pot refunds what is left', async () => {
    await signIn();
    seed([OWNER, U2]);
    renderAt('/trips/trip-x#expenses');
    await screen.findByRole('tab', { name: 'Kitty' });
    await userEvent.type(screen.getByLabelText('Kitty total'), '1000');
    await userEvent.click(screen.getByRole('button', { name: 'Set total' }));
    expect(await screen.findByText(/set the pot total/)).toBeInTheDocument();
    // Editing the total is allowed and logged with the previous value.
    const totalInput = screen.getByLabelText('Kitty total');
    await userEvent.clear(totalInput);
    await userEvent.type(totalInput, '800');
    await userEvent.click(screen.getByRole('button', { name: 'Update total' }));
    expect((await screen.findAllByText(/changed the pot total from .*1,000\.00.* to .*800\.00/)).length).toBeGreaterThanOrEqual(1);
    for (let i = 0; i < 2; i++) await userEvent.click(screen.getAllByRole('button', { name: 'Confirm paid' })[0]);
    await waitFor(() => expect(screen.getAllByText(/confirmed .* paid their pot share/).length).toBe(2));
    // Close the pot (behind the ⋮ confirm) → the holder refunds the friend's 400.
    await userEvent.click(screen.getByRole('button', { name: 'More options' }));
    await userEvent.click(screen.getByRole('menuitem', { name: /Close the pot/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(await screen.findByText(/closed the pot/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'Summary' }));
    await screen.findByText('You owe');
    expect(document.querySelector('[data-testid="my-net"] .bp-net__val')?.textContent).toMatch(/400\.00/);
  }, 15000);

  it('refuses to add an expense without a category (no silent "Food")', async () => {
    await signIn();
    seed([OWNER, U2, U3]);
    renderAt('/trips/trip-x#expenses');
    await screen.findByRole('tab', { name: 'Kitty' });
    await userEvent.click(screen.getByRole('tab', { name: 'Expense log' }));
    await userEvent.type(screen.getByLabelText('Description'),'Paris hotel');
    await userEvent.type(screen.getByLabelText('Amount'), '500');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/category/i);
    expect(useExpensesStore.getState().finance?.group.length ?? 0).toBe(0);
  });

  it('deletes an expense only through the ⋮ menu after confirming', async () => {
    await signIn();
    seed([OWNER, U2, U3]);
    renderAt('/trips/trip-x#expenses');
    await screen.findByRole('tab', { name: 'Kitty' });
    await userEvent.click(screen.getByRole('tab', { name: 'Expense log' }));
    await userEvent.type(screen.getByLabelText('Description'),'Taxi');
    await userEvent.type(screen.getByLabelText('Amount'), '90');
    await userEvent.selectOptions(screen.getByLabelText('Category'), 'TRANSPORT');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    await screen.findByText('Taxi');
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument(); // not exposed inline
    await userEvent.click(screen.getByRole('button', { name: 'More options' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(screen.queryByText('Taxi')).not.toBeInTheDocument());
  });

  it('edits a group expense in place (BR-007-008)', async () => {
    await signIn();
    seed([OWNER, U2, U3]);
    renderAt('/trips/trip-x#expenses');
    await screen.findByRole('tab', { name: 'Kitty' });
    await userEvent.click(screen.getByRole('tab', { name: 'Expense log' }));
    await userEvent.type(screen.getByLabelText('Description'),'Taxi');
    await userEvent.type(screen.getByLabelText('Amount'), '300');
    await userEvent.selectOptions(screen.getByLabelText('Category'), 'FOOD');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    await screen.findByText('Taxi');

    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    const amount = screen.getAllByLabelText('Amount')[0]; // the inline edit row
    await userEvent.clear(amount);
    await userEvent.type(amount, '600');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => {
      const g = useExpensesStore.getState().finance?.group.find((x) => x.desc === 'Taxi');
      expect(g?.amount).toBe(600);
    });
  });

  it('OPEN kitty: an expense for a subset is split among exactly those people (AC3)', async () => {
    await signIn();
    seed([OWNER, U2, U3]);
    renderAt('/trips/trip-x#expenses');
    await screen.findByRole('tab', { name: 'Kitty' });
    await expensesActions.setKittyMode('OPEN');
    await userEvent.click(screen.getByRole('tab', { name: 'Expense log' }));
    await screen.findByText('Who was with you?');
    await userEvent.click(screen.getByRole('tab', { name: 'Expense log' }));
    await userEvent.type(screen.getByLabelText('Description'),'Airport taxi');
    await userEvent.type(screen.getByLabelText('Amount'), '600');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Everyone' })); // → just the payer (me)
    await userEvent.click(screen.getByRole('checkbox', { name: 'سالم' }));    // + Salem
    await userEvent.selectOptions(screen.getByLabelText('Category'), 'FOOD');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(await screen.findByText('Airport taxi')).toBeInTheDocument();
    expect(screen.getByText(/300\.00/)).toBeInTheDocument(); // 600 / 2
    await waitFor(() => {
      const s = useExpensesStore.getState().finance!.sides[0];
      expect(s.participantUids.sort()).toEqual(['me', 'u2']);
      expect(s.category).toBe('FOOD');
    });
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

describe('Expenses first-run + settlement nudge (UX review items 12 and 1)', () => {
  it('starts with a 3-step starter instead of zero tiles, and no "Confirm paid" until a pot exists', async () => {
    await signIn();
    seed([OWNER, U2, U3]);
    renderAt('/trips/trip-x#expenses');
    await screen.findByRole('tab', { name: 'Kitty' });
    expect(screen.getByRole('list', { name: 'Getting started' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Set the kitty total' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirm paid' })).not.toBeInTheDocument();
    expect(screen.queryByText('Spent from the pot')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Set total' })).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Kitty total'), '900');
    await userEvent.click(screen.getByRole('button', { name: 'Set total' }));
    await screen.findByText('Spent from the pot');
    expect(screen.queryByRole('list', { name: 'Getting started' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Confirm paid' }).length).toBe(3);
  });

  it('asks me for an IBAN only in the summary, and only when someone owes me', async () => {
    await signIn();
    seed([OWNER, U2, U3]);
    renderAt('/trips/trip-x#expenses');
    await screen.findByRole('tab', { name: 'Kitty' });
    // No IBAN banner anywhere on the trip page up front.
    expect(screen.queryByText(/Add your IBAN/)).not.toBeInTheDocument();
    await expensesActions.setKittyMode('OPEN');
    await userEvent.click(screen.getByRole('tab', { name: 'Expense log' }));
    await screen.findByText('Who was with you?');
    await userEvent.click(screen.getByRole('tab', { name: 'Expense log' }));
    await userEvent.type(screen.getByLabelText('Description'),'Taxi');
    await userEvent.type(screen.getByLabelText('Amount'), '300');
    await userEvent.selectOptions(screen.getByLabelText('Category'), 'FOOD');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    await screen.findByText('Taxi');
    await userEvent.click(screen.getByRole('tab', { name: 'Summary' }));
    expect(await screen.findByText(/Add your IBAN so others can transfer to you/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Hide this notice' }));
    expect(screen.queryByText(/Add your IBAN so others can transfer to you/)).not.toBeInTheDocument();
  });
});
