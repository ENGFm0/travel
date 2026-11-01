import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/shared/i18n';
import { useUIStore } from '@/app/store/uiStore';
import { useAuthStore } from '@/features/auth/authStore';
import { useMembersStore, membersActions } from '@/features/members/membersStore';
import { createMockMembersService, type Member } from '@/features/members/membersService';
import { useProfileStore } from '@/features/profile/profileStore';
import { createMockProfileService } from '@/features/profile/profileService';
import { IbanGate } from '@/features/members/IbanGate';
import i18next from 'i18next';

const ME: Member = { uid: 'me', displayName: 'Khalid', role: 'OWNER', status: 'ACTIVE' };
const RAJHI = 'SA03 8000 0000 6080 1016 7519';

beforeEach(async () => {
  localStorage.clear();
  useUIStore.setState({ theme: 'system', locale: 'en' });
  await i18next.changeLanguage('en');
  useAuthStore.setState({ status: 'authenticated', user: { uid: 'me', email: 'me@x.co', displayName: 'Khalid', isAnonymous: false, role: 'USER' }, modalOpen: false });
  useMembersStore.setState({ tripId: null, members: null, loading: false, error: null });
  useProfileStore.setState({ profile: null, loading: false, error: null });
  useProfileStore.getState().setService(createMockProfileService());
});

async function seed(member: Member) {
  useMembersStore.getState().setService(createMockMembersService({ 'trip-x': [structuredClone(member)] }));
  await membersActions.load('trip-x');
}

describe('IBAN gate', () => {
  it('detects the bank while typing, confirms the save, stores it on profile + member, then hides', async () => {
    const user = userEvent.setup();
    await seed(ME);
    render(<IbanGate tripId="trip-x" meUid="me" />);

    const input = await screen.findByLabelText('IBAN');
    await user.type(input, 'SA03 80');
    expect(screen.getByText('Al Rajhi Bank')).toBeInTheDocument();   // live bank detection
    await user.clear(input);
    await user.type(input, RAJHI);
    await user.click(screen.getByRole('button', { name: 'Save IBAN' }));

    await screen.findByText('IBAN saved ✅');                         // confirmation shown
    expect(screen.getByText(RAJHI)).toBeInTheDocument();
    expect(useProfileStore.getState().profile?.iban).toBe('SA0380000000608010167519');
    expect(useMembersStore.getState().members?.[0].iban).toBe('SA0380000000608010167519');

    await waitFor(() => expect(screen.queryByText('IBAN saved ✅')).not.toBeInTheDocument(), { timeout: 5000 });
    expect(screen.queryByLabelText('IBAN')).not.toBeInTheDocument(); // banner gone for good
  }, 10000);

  it('rejects an invalid IBAN without saving', async () => {
    const user = userEvent.setup();
    await seed(ME);
    render(<IbanGate tripId="trip-x" meUid="me" />);
    await user.type(await screen.findByLabelText('IBAN'), 'SA03 8000 0000 6080 1016 7518');
    await user.click(screen.getByRole('button', { name: 'Save IBAN' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(useMembersStore.getState().members?.[0].iban).toBeUndefined();
  });

  it('stays hidden when the member already has an IBAN on this trip', async () => {
    await seed({ ...ME, iban: 'SA0380000000608010167519' });
    render(<IbanGate tripId="trip-x" meUid="me" />);
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByLabelText('IBAN')).not.toBeInTheDocument();
  });
});
