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
import { useTasksStore } from '@/features/tasks/tasksStore';
import { createMockTasksService } from '@/features/tasks/tasksService';
import { dedupeAppend, effectiveAssignee, progress, type Task } from '@/features/tasks/tasksModel';

// ── Pure model ────────────────────────────────────────────────────────────────
describe('US-008 tasks model', () => {
  it('dedupes template items by label+category (BR-008-002, AC3)', () => {
    const existing = [{ label: 'Passport', category: 'DOCS' as const }];
    const incoming = [
      { label: 'Passport', category: 'DOCS' as const }, // dup
      { label: 'Passport', category: 'CLOTHES' as const }, // different cat → kept
      { label: 'Tickets', category: 'DOCS' as const },
    ];
    const add = dedupeAppend(existing, incoming);
    expect(add).toEqual([
      { label: 'Passport', category: 'CLOTHES' },
      { label: 'Tickets', category: 'DOCS' },
    ]);
    // applying the same template twice adds nothing the second time
    expect(dedupeAppend([...existing, ...add], incoming)).toEqual([]);
  });

  it('reads a task assigned to a removed member as unassigned (BR-008-001, AC4)', () => {
    const t: Task = { id: '1', title: 'x', assigneeUid: 'gone', done: false };
    expect(effectiveAssignee(t, ['a', 'b'])).toBeNull();
    expect(effectiveAssignee({ ...t, assigneeUid: 'a' }, ['a', 'b'])).toBe('a');
  });

  it('computes progress percentage', () => {
    expect(progress(0, 0)).toBe(0);
    expect(progress(4, 1)).toBe(25);
    expect(progress(3, 3)).toBe(100);
  });
});

// ── Component ───────────────────────────────────────────────────────────────
const TRIP: Trip = {
  id: 'trip-x', title: 'رحلة', type: 'INTERNATIONAL', dateFrom: '2099-05-01', dateTo: '2099-05-10',
  cities: [{ name: 'لندن' }], ownerUid: 'me', status: 'ACTIVE', progress: 10,
};
const OWNER: Member = { uid: 'me', displayName: 'خالد', role: 'OWNER', status: 'ACTIVE' };
const OMAR: Member = { uid: 'u2', displayName: 'عمر', role: 'MEMBER', status: 'ACTIVE' };

function seed(members: Member[]) {
  useTripsStore.getState().setService(createMockTripsService([structuredClone(TRIP)]));
  useMembersStore.getState().setService(createMockMembersService({ 'trip-x': structuredClone(members) }));
  useTasksStore.getState().setService(createMockTasksService());
}

beforeEach(() => {
  localStorage.clear();
  useUIStore.setState({ theme: 'system', locale: 'en' });
  useAuthStore.setState({ status: 'loading', user: null, modalOpen: false });
  useAuthStore.getState().setProvider(createMockAuthProvider());
  useMembersStore.setState({ tripId: null, members: null, loading: false, error: null });
  useTasksStore.setState({ board: null, loading: false, error: null });
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

describe('US-008 Tasks & Packing UI', () => {
  it('adds a task with an assignee and toggles it complete (AC1/AC2)', async () => {
    await signIn();
    seed([OWNER, OMAR]);
    renderAt('/trips/trip-x#tasks');
    await screen.findByRole('heading', { name: 'Tasks', level: 3 });
    await userEvent.type(screen.getByLabelText('Tasks'), 'Book a car');
    await userEvent.selectOptions(screen.getByLabelText('Assignee'), 'u2');
    await userEvent.click(screen.getAllByRole('button', { name: 'Add' })[0]); // tasks Add
    expect(await screen.findByText('Book a car')).toBeInTheDocument();
    expect(screen.getAllByText('عمر').length).toBeGreaterThan(0); // assignee chip (+ select options)
    const cb = screen.getByRole('checkbox', { name: /Book a car/ });
    await userEvent.click(cb);
    await waitFor(() => expect(cb).toBeChecked());
  });

  it('applies a packing template idempotently — no duplicates (AC3)', async () => {
    await signIn();
    seed([OWNER, OMAR]);
    renderAt('/trips/trip-x#tasks');
    await screen.findByRole('heading', { name: 'Packing list', level: 3 });
    await userEvent.click(screen.getByRole('button', { name: 'Essentials' }));
    // "Tickets" is packing-only (bookings has no such item), so it's unambiguous
    await waitFor(() => expect(screen.getAllByText('Tickets').length).toBe(1));
    await userEvent.click(screen.getByRole('button', { name: 'Essentials' }));
    // still exactly one after a second apply (dedupe)
    await waitFor(() => expect(useTasksStore.getState().board?.packing.filter((p) => p.label === 'Tickets')).toHaveLength(1));
  });

  it('hides edit controls for a viewer (AC5)', async () => {
    await signIn();
    seed([{ ...OWNER, role: 'VIEWER' }, OMAR]);
    renderAt('/trips/trip-x#tasks');
    await screen.findByRole('heading', { name: 'Tasks', level: 3 });
    expect(screen.queryByLabelText('Tasks')).not.toBeInTheDocument(); // no add-task input
    expect(screen.queryByRole('button', { name: 'Essentials' })).not.toBeInTheDocument();
  });
});
