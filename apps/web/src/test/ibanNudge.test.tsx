import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/shared/i18n';
import { useUIStore } from '@/app/store/uiStore';
import { useAuthStore } from '@/features/auth/authStore';
import { useMembersStore, membersActions } from '@/features/members/membersStore';
import { createMockMembersService, type Member } from '@/features/members/membersService';
import { useProfileStore, profileActions } from '@/features/profile/profileStore';
import { createMockProfileService } from '@/features/profile/profileService';
import { IbanNudge } from '@/features/members/IbanNudge';
import i18next from 'i18next';

const ME: Member = { uid: 'me', displayName: 'Khalid', role: 'OWNER', status: 'ACTIVE' };
const RAJHI = 'SA03 8000 0000 6080 1016 7519';

beforeEach(async () => {
  localStorage.clear();
  sessionStorage.clear();
  useUIStore.setState({ theme: 'system', locale: 'en' });
  await i18next.changeLanguage('en');
  useAuthStore.setState({ status: 'authenticated', user: { uid: 'me', email: 'me@x.co', displayName: 'Khalid', isAnonymous: false, role: 'USER' }, modalOpen: false });
  useMembersStore.setState({ tripId: null, members: null, loading: false, error: null });
  useProfileStore.setState({ profile: null, loading: false, error: null });
  useProfileStore.getState().setService(createMockProfileService());
  await profileActions.load({ uid: 'me', email: 'me@x.co', displayName: 'Khalid' });
});

async function seed(member: Member) {
  useMembersStore.getState().setService(createMockMembersService({ 'trip-x': [structuredClone(member)] }));
  await membersActions.load('trip-x');
}
const renderNudge = () => render(<MemoryRouter><IbanNudge tripId="trip-x" meUid="me" /></MemoryRouter>);

describe('IBAN nudge (settlement time)', () => {
  it('is one line with inline save: detects the bank, confirms, stores on profile + member, then hides', async () => {
    const user = userEvent.setup();
    await seed(ME);
    renderNudge();

    const input = screen.getByLabelText('IBAN');
    await user.type(input, 'SA03 80');
    expect(screen.getByTitle('Al Rajhi Bank')).toBeInTheDocument();   // live bank detection
    await user.clear(input);
    await user.type(input, RAJHI);
    await user.click(screen.getByRole('button', { name: 'Save IBAN' }));

    expect(await screen.findByRole('status')).toHaveTextContent('IBAN saved');
    expect(useProfileStore.getState().profile?.iban).toBe('SA0380000000608010167519');
    expect(useMembersStore.getState().members?.[0].iban).toBe('SA0380000000608010167519');

    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument(), { timeout: 5000 });
    expect(screen.queryByLabelText('IBAN')).not.toBeInTheDocument();
  }, 10000);

  it('rejects an invalid IBAN without saving', async () => {
    const user = userEvent.setup();
    await seed(ME);
    renderNudge();
    await user.type(screen.getByLabelText('IBAN'), 'SA03 8000 0000 6080 1016 7518');
    await user.click(screen.getByRole('button', { name: 'Save IBAN' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(useMembersStore.getState().members?.[0].iban).toBeUndefined();
  });

  it('can be dismissed for the session with ✕', async () => {
    const user = userEvent.setup();
    await seed(ME);
    const { unmount } = renderNudge();
    await user.click(screen.getByRole('button', { name: 'Hide this notice' }));
    expect(screen.queryByLabelText('IBAN')).not.toBeInTheDocument();
    unmount();
    renderNudge(); // stays hidden on re-render within the same session
    expect(screen.queryByLabelText('IBAN')).not.toBeInTheDocument();
  });
});
