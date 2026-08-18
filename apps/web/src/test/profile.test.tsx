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
import { useProfileStore } from '@/features/profile/profileStore';
import { createMockProfileService } from '@/features/profile/profileService';
import { validateAvatar, validateName, fullName } from '@/features/profile/profileModel';

// ── Pure model ────────────────────────────────────────────────────────────────
describe('US-002 profile model', () => {
  it('validates avatars (type + 5MB cap, AC5)', () => {
    expect(validateAvatar('image/png', 1000)).toBeNull();
    expect(validateAvatar('image/gif', 1000)).toBe('TYPE');
    expect(validateAvatar('image/jpeg', 6 * 1024 * 1024)).toBe('SIZE');
  });
  it('validates names', () => {
    expect(validateName('Sara', 'Ali')).toBeNull();
    expect(validateName('', 'Ali')).toBe('REQUIRED');
    expect(validateName('x'.repeat(51), 'Ali')).toBe('TOO_LONG');
  });
  it('composes a full name skipping blanks', () => {
    expect(fullName({ firstName: 'Sara', middleName: '', lastName: 'Ali' })).toBe('Sara Ali');
  });
});

// ── Component ───────────────────────────────────────────────────────────────
function seedService(blockedUids: string[] = []) {
  useProfileStore.getState().setService(createMockProfileService({ blockedUids }));
}

beforeEach(() => {
  localStorage.clear();
  useUIStore.setState({ theme: 'system', locale: 'en' });
  useAuthStore.setState({ status: 'loading', user: null, modalOpen: false });
  useAuthStore.getState().setProvider(createMockAuthProvider());
  useProfileStore.setState({ profile: null, loading: false, error: null });
});
afterEach(() => vi.restoreAllMocks());

function renderProfile() {
  const router = createMemoryRouter(routes, { initialEntries: ['/profile'] });
  return render(<ThemeProvider><LocaleProvider><RouterProvider router={router} /></LocaleProvider></ThemeProvider>);
}
async function signIn() {
  await useAuthStore.getState().provider!.signInWithPassword('user@example.com', 'password1');
  await waitFor(() => expect(useAuthStore.getState().status).toBe('authenticated'));
}

describe('US-002 Profile & Settings', () => {
  it('loads the profile and saves an edited name (AC1)', async () => {
    await signIn();
    seedService();
    renderProfile();
    const first = await screen.findByLabelText('First name');
    await userEvent.clear(first);
    await userEvent.type(first, 'Sara');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Saved ✓')).toBeInTheDocument();
    await waitFor(() => expect(useProfileStore.getState().profile?.firstName).toBe('Sara'));
  });

  it('blocks saving when the name is incomplete', async () => {
    await signIn();
    seedService();
    renderProfile();
    const last = await screen.findByLabelText('Last name');
    await userEvent.clear(last);
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('First and last name are required');
  });

  it('switches language and theme via preferences (AC2/AC3)', async () => {
    await signIn();
    seedService();
    renderProfile();
    await screen.findByRole('button', { name: 'العربية' });
    await userEvent.click(screen.getByRole('button', { name: 'العربية' }));
    expect(useUIStore.getState().locale).toBe('ar');
    // theme buttons re-localize to Arabic now; click the dark option
    await userEvent.click(screen.getByRole('button', { name: 'داكن' }));
    expect(useUIStore.getState().theme).toBe('dark');
  });

  it('rejects an invalid avatar file (AC5)', async () => {
    const user = userEvent.setup({ applyAccept: false });
    await signIn();
    seedService();
    renderProfile();
    await screen.findByLabelText('First name');
    await user.upload(screen.getByLabelText('Change photo'), new File(['x'], 'a.pdf', { type: 'application/pdf' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Use a JPG, PNG, or WEBP image');
  });

  it('blocks account deletion for a sole owner and shows the transfer prompt (AC4)', async () => {
    await signIn();
    seedService(['seed-user']); // the mock-auth signed-in uid
    renderProfile();
    await screen.findByRole('button', { name: 'Delete my account' });
    await userEvent.click(screen.getByRole('button', { name: 'Delete my account' }));
    await userEvent.click(screen.getByRole('button', { name: 'Yes, delete' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('sole owner of an active trip');
  });
});
