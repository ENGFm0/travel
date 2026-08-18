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
import { useMemoriesStore } from '@/features/memories/memoriesStore';
import { createMockMemoriesService } from '@/features/memories/memoriesService';
import { validateFile, canDelete, groupMedia, type Media } from '@/features/memories/memoriesModel';

// ── Pure model ────────────────────────────────────────────────────────────────
describe('US-013 memories model', () => {
  it('validates MIME allowlist and size caps (AC6)', () => {
    expect(validateFile('image/jpeg', 1000)).toBeNull();
    expect(validateFile('video/mp4', 1000)).toBeNull();
    expect(validateFile('application/pdf', 10)).toBe('TYPE');
    expect(validateFile('image/png', 11 * 1024 * 1024)).toBe('SIZE');
    expect(validateFile('video/mp4', 101 * 1024 * 1024)).toBe('SIZE');
  });

  it('permits deleting own media; owner deletes any (BR-013-002, AC3)', () => {
    const m: Media = { id: '1', type: 'image', src: '', name: 'x', uploaderUid: 'u2', day: 'Day 1', place: 'A' };
    expect(canDelete(m, 'me', false)).toBe(false);
    expect(canDelete(m, 'u2', false)).toBe(true);
    expect(canDelete(m, 'me', true)).toBe(true); // owner
  });

  it('groups by day or place preserving order (AC2)', () => {
    const media: Media[] = [
      { id: '1', type: 'image', src: '', name: 'a', uploaderUid: 'me', day: 'Day 1', place: 'London' },
      { id: '2', type: 'image', src: '', name: 'b', uploaderUid: 'me', day: 'Day 2', place: 'London' },
    ];
    expect(groupMedia(media, 'day').map((g) => g.label)).toEqual(['Day 1', 'Day 2']);
    expect(groupMedia(media, 'place').map((g) => g.label)).toEqual(['London']);
  });
});

// ── Component ───────────────────────────────────────────────────────────────
const TRIP: Trip = {
  id: 'trip-x', title: 'London Trip', type: 'INTERNATIONAL', dateFrom: '2099-05-01', dateTo: '2099-05-10',
  cities: [{ name: 'London' }], ownerUid: 'me', status: 'ACTIVE', progress: 10,
};
const OWNER: Member = { uid: 'me', displayName: 'Khalid', role: 'OWNER', status: 'ACTIVE' };
const U2: Member = { uid: 'u2', displayName: 'Omar', role: 'MEMBER', status: 'ACTIVE' };

function seed(members: Member[], media: Media[] = []) {
  useTripsStore.getState().setService(createMockTripsService([structuredClone(TRIP)]));
  useMembersStore.getState().setService(createMockMembersService({ 'trip-x': structuredClone(members) }));
  useMemoriesStore.getState().setService(createMockMemoriesService({ 'trip-x': structuredClone(media) }));
}

beforeEach(() => {
  localStorage.clear();
  useUIStore.setState({ theme: 'system', locale: 'en' });
  useAuthStore.setState({ status: 'loading', user: null, modalOpen: false });
  useAuthStore.getState().setProvider(createMockAuthProvider());
  useMembersStore.setState({ tripId: null, members: null, loading: false, error: null });
  useMemoriesStore.setState({ media: null, loading: false, error: null });
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

function file(name: string, type: string) {
  return new File(['x'], name, { type });
}

describe('US-013 Memories UI', () => {
  it('uploads a valid image and rejects an unsupported type (AC6)', async () => {
    const user = userEvent.setup({ applyAccept: false }); // let the handler validate
    await signIn();
    seed([OWNER]);
    renderAt('/trips/trip-x#memories');
    await screen.findByRole('button', { name: /Upload/ });
    await user.upload(screen.getByLabelText('Upload'), file('photo.jpg', 'image/jpeg'));
    expect(await screen.findByAltText('photo.jpg')).toBeInTheDocument();

    await user.upload(screen.getByLabelText('Upload'), file('doc.pdf', 'application/pdf'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Unsupported file type');
  });

  it('toggles grouping between day and place (AC2)', async () => {
    await signIn();
    seed([OWNER], [{ id: '1', type: 'image', src: '', name: 'a', uploaderUid: 'me', day: 'Day 1', place: 'London' }]);
    renderAt('/trips/trip-x#memories');
    expect(await screen.findByRole('heading', { name: 'Day 1', level: 4 })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'By place' }));
    expect(await screen.findByRole('heading', { name: 'London', level: 4 })).toBeInTheDocument();
  });

  it('shows delete only on own media for a member, on all for the owner (AC3)', async () => {
    const media: Media[] = [
      { id: 'a', type: 'image', src: '', name: 'mine', uploaderUid: 'me', day: 'Day 1', place: 'London' },
      { id: 'b', type: 'image', src: '', name: 'theirs', uploaderUid: 'u2', day: 'Day 1', place: 'London' },
    ];
    await signIn();
    seed([{ ...OWNER, role: 'MEMBER' }, { ...U2, role: 'OWNER' }], media);
    renderAt('/trips/trip-x#memories');
    await screen.findByAltText('mine');
    expect(screen.getAllByRole('button', { name: 'Delete media' })).toHaveLength(1); // only own

    // owner sees delete on both
    useMembersStore.getState().setService(createMockMembersService({ 'trip-x': [OWNER, U2] }));
    seed([OWNER, U2], media);
    renderAt('/trips/trip-x#memories');
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Delete media' }).length).toBeGreaterThanOrEqual(2));
  });

  it('exports a report preview with the trip summary (AC5)', async () => {
    await signIn();
    seed([OWNER]);
    renderAt('/trips/trip-x#memories');
    await userEvent.click(await screen.findByRole('button', { name: 'Export report' }));
    const dlg = await screen.findByRole('dialog');
    expect(dlg).toHaveTextContent('London Trip');
    expect(dlg).toHaveTextContent('London');
  });
});
