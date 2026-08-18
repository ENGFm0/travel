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
import { useTripsStore } from '@/features/trips/tripsStore';
import { createMockTripsService, type Trip } from '@/features/trips/tripsService';

beforeEach(() => {
  localStorage.clear();
  useUIStore.setState({ theme: 'system', locale: 'ar' });
  useAuthStore.setState({ status: 'loading', user: null, modalOpen: false });
  useAuthStore.getState().setProvider(createMockAuthProvider());
  useTripsStore.setState({ wizardOpen: false, lastCreated: null, trips: null, loading: false, error: null });
  useTripsStore.getState().setService(createMockTripsService());
});

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

async function fillStep1() {
  await userEvent.type(screen.getByLabelText('عنوان الرحلة'), 'رحلة أوروبا');
  await userEvent.click(screen.getByRole('button', { name: 'داخلية' }));
  await userEvent.type(screen.getByLabelText('من'), '2026-09-01');
  await userEvent.click(screen.getByRole('button', { name: 'التالي' }));
}

describe('US-003 create-trip gating', () => {
  it('opens the wizard when an authenticated user arrives with ?new=1', async () => {
    await signIn();
    renderAt('/planner?new=1');
    expect(await screen.findByTestId('trip-wizard')).toBeInTheDocument();
  });

  it('routes an unauthenticated user to the auth modal instead of the wizard', async () => {
    renderAt('/planner?new=1');
    expect(await screen.findByTestId('auth-modal')).toBeInTheDocument();
    expect(screen.queryByTestId('trip-wizard')).not.toBeInTheDocument();
  });
});

describe('US-003 wizard flow', () => {
  it('walks the 3 steps and creates a trip', async () => {
    await signIn();
    renderAt('/planner?new=1');
    await screen.findByTestId('trip-wizard');

    await fillStep1();
    // Step 2: destinations
    await userEvent.type(await screen.findByLabelText('المدينة'), 'باريس');
    await userEvent.click(screen.getByRole('button', { name: 'التالي' }));
    // Step 3: invite + create
    await userEvent.click(await screen.findByRole('button', { name: 'إنشاء الرحلة' }));

    expect(await screen.findByRole('heading', { name: /تم إنشاء رحلتك/ })).toBeInTheDocument();
    await waitFor(() => {
      const t = useTripsStore.getState().lastCreated;
      expect(t?.title).toBe('رحلة أوروبا');
      expect(t?.type).toBe('DOMESTIC');
      expect(t?.cities[0]?.name).toBe('باريس');
    });
  });

  it('blocks step 1 with a missing title', async () => {
    await signIn();
    renderAt('/planner?new=1');
    await screen.findByTestId('trip-wizard');
    await userEvent.click(screen.getByRole('button', { name: 'التالي' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('اكتب عنوان الرحلة');
  });

  it('reveals per-city date inputs in multi-city mode', async () => {
    await signIn();
    renderAt('/planner?new=1');
    await screen.findByTestId('trip-wizard');
    await fillStep1();
    await screen.findByLabelText('المدينة');
    expect(screen.queryByLabelText('التواريخ')).not.toBeInTheDocument();
    await userEvent.click(screen.getByLabelText('رحلة متعددة المدن'));
    expect(await screen.findByLabelText('التواريخ')).toBeInTheDocument();
  });
});

function seededService(trips: Trip[]) {
  // deep-clone so the mock's in-place status mutations can't leak across tests
  useTripsStore.getState().setService(createMockTripsService(structuredClone(trips)));
}

const UPCOMING: Trip = {
  id: 'trip-up', title: 'رحلة قادمة', type: 'INTERNATIONAL',
  dateFrom: '2099-01-01', dateTo: '2099-01-10', cities: [{ name: 'طوكيو' }],
  ownerUid: 'me', status: 'ACTIVE', progress: 30,
};
const PAST: Trip = {
  id: 'trip-past', title: 'رحلة سابقة', type: 'DOMESTIC',
  dateFrom: '2000-01-01', dateTo: '2000-01-05', cities: [{ name: 'جدة' }],
  ownerUid: 'me', status: 'ACTIVE', progress: 100,
};

describe('US-005 My Trips', () => {
  it('requires auth: unauthenticated /mytrips shows the sign-in guard', async () => {
    renderAt('/mytrips');
    expect(await screen.findByRole('heading', { name: 'تحتاج تسجيل الدخول' })).toBeInTheDocument();
  });

  it('splits upcoming and past by the filter tabs', async () => {
    await signIn();
    seededService([UPCOMING, PAST]);
    renderAt('/mytrips');
    // default filter = upcoming
    expect(await screen.findByText('رحلة قادمة')).toBeInTheDocument();
    expect(screen.queryByText('رحلة سابقة')).not.toBeInTheDocument();
    // switch to past
    await userEvent.click(screen.getByRole('tab', { name: /السابقة/ }));
    expect(await screen.findByText('رحلة سابقة')).toBeInTheDocument();
    expect(screen.queryByText('رحلة قادمة')).not.toBeInTheDocument();
  });

  it('shows a friendly empty state with a create CTA when there are no trips', async () => {
    await signIn();
    seededService([]);
    renderAt('/mytrips');
    expect(await screen.findByText('لا توجد رحلات بعد. أنشئ أول رحلة لك للبدء.')).toBeInTheDocument();
  });

  it('owner can archive a trip, removing it from the active list', async () => {
    await signIn();
    seededService([UPCOMING]);
    renderAt('/mytrips');
    await screen.findByText('رحلة قادمة');
    await userEvent.click(screen.getByRole('button', { name: 'أرشفة' }));
    await waitFor(() => expect(screen.queryByText('رحلة قادمة')).not.toBeInTheDocument());
  });

  it('opens the Friends sub-tab from the #friends deep-link', async () => {
    await signIn();
    seededService([]);
    renderAt('/mytrips#friends');
    expect(await screen.findByText('أدر قروب السفر والأصدقاء من هنا — يأتي مع ستوري الأصدقاء.')).toBeInTheDocument();
  });

  it('renders the correct type badge per trip', async () => {
    await signIn();
    seededService([UPCOMING]);
    renderAt('/mytrips');
    expect(await screen.findByText('خارجية')).toBeInTheDocument();
  });
});
