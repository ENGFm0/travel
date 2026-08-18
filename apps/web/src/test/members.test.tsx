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
import { useMembersStore } from '@/features/members/membersStore';
import { createMockMembersService, type Member } from '@/features/members/membersService';

const TRIP: Trip = {
  id: 'trip-x', title: 'رحلة الاختبار', type: 'INTERNATIONAL',
  dateFrom: '2099-05-01', dateTo: '2099-05-10', cities: [{ name: 'لندن' }],
  ownerUid: 'me', status: 'ACTIVE', progress: 20,
};

function seed(members: Member[]) {
  useTripsStore.getState().setService(createMockTripsService([structuredClone(TRIP)]));
  useMembersStore.getState().setService(createMockMembersService({ 'trip-x': structuredClone(members) }));
}

const OWNER: Member = { uid: 'me', displayName: 'خالد', role: 'OWNER', status: 'ACTIVE' };
const SALEM: Member = { uid: 'u2', displayName: 'سالم', role: 'MEMBER', status: 'ACTIVE' };

beforeEach(() => {
  localStorage.clear();
  useUIStore.setState({ theme: 'system', locale: 'ar' });
  useAuthStore.setState({ status: 'loading', user: null, modalOpen: false });
  useAuthStore.getState().setProvider(createMockAuthProvider());
  useMembersStore.setState({ tripId: null, members: null, loading: false, error: null });
});

afterEach(() => vi.restoreAllMocks());

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  return render(
    <ThemeProvider>
      <LocaleProvider>
        <RouterProvider router={router} />
      </LocaleProvider>
    </ThemeProvider>,
  );
}

async function signIn() {
  await useAuthStore.getState().provider!.signInWithPassword('user@example.com', 'password1');
  await waitFor(() => expect(useAuthStore.getState().status).toBe('authenticated'));
}

describe('US-009 Members', () => {
  it('renders the trip and its owner with an Amir role chip', async () => {
    await signIn();
    seed([OWNER]);
    renderAt('/trips/trip-x');
    expect(await screen.findByRole('heading', { name: 'رحلة الاختبار' })).toBeInTheDocument();
    expect(await screen.findByText('الأمير')).toBeInTheDocument();
  });

  it('shows a friendly not-found for a missing trip', async () => {
    await signIn();
    seed([OWNER]);
    renderAt('/trips/does-not-exist');
    expect(await screen.findByRole('heading', { name: 'الرحلة غير موجودة' })).toBeInTheDocument();
  });

  it('owner invites someone, adding a pending member', async () => {
    await signIn();
    seed([OWNER]);
    renderAt('/trips/trip-x');
    await screen.findByText('الأمير');
    await userEvent.type(screen.getByLabelText('الاسم'), 'نورة');
    await userEvent.click(screen.getByRole('button', { name: 'دعوة' }));
    expect(await screen.findByText('نورة')).toBeInTheDocument();
    expect(await screen.findByText('معلّق')).toBeInTheDocument();
  });

  it('owner changes a member to viewer', async () => {
    await signIn();
    seed([OWNER, SALEM]);
    renderAt('/trips/trip-x');
    await screen.findByText('سالم');
    await userEvent.click(screen.getByRole('button', { name: 'اجعله مشاهدًا' }));
    expect(await screen.findByText('مشاهد')).toBeInTheDocument();
  });

  it('transfers ownership, keeping exactly one Amir', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await signIn();
    seed([OWNER, SALEM]);
    renderAt('/trips/trip-x');
    await screen.findByText('سالم');
    await userEvent.click(screen.getByRole('button', { name: 'نقل الإمارة' }));
    await waitFor(() => expect(screen.getAllByText('الأمير')).toHaveLength(1));
    // Salem is now the owner; former owner is a member
    expect(screen.getByText('عضو')).toBeInTheDocument();
  });

  it('blocks the owner from leaving while other members exist', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await signIn();
    seed([OWNER, SALEM]);
    renderAt('/trips/trip-x');
    const ownerName = await screen.findByText(/خالد/);
    const ownerRow = ownerName.closest('li') as HTMLElement;
    await userEvent.click(within(ownerRow).getByRole('button', { name: 'مغادرة الرحلة' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('انقل الملكية قبل مغادرة الرحلة');
  });

  it('copies the invite link and shows feedback', async () => {
    await signIn();
    seed([OWNER]);
    renderAt('/trips/trip-x');
    await screen.findByText('الأمير');
    await userEvent.click(screen.getByRole('button', { name: 'نسخ' }));
    expect(await screen.findByText('تم النسخ ✓')).toBeInTheDocument();
  });
});
