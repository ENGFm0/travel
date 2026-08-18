import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import type { GlobalRole } from '@boardingpass/types';
import '@/shared/i18n';
import { routes } from '@/app/router';
import { ThemeProvider } from '@/app/providers/ThemeProvider';
import { LocaleProvider } from '@/app/providers/LocaleProvider';
import { useUIStore } from '@/app/store/uiStore';
import { useAuthStore } from '@/features/auth/authStore';
import { useAdminStore } from '@/features/admin/adminStore';
import { createMockAdminService } from '@/features/admin/adminService';
import { isAdmin, canManageRoles, filterUsers, filterAudit } from '@/features/admin/adminModel';

// ── Pure model ────────────────────────────────────────────────────────────────
describe('US-016 admin model', () => {
  it('gates admin + role management by role (BR-016-002)', () => {
    expect(isAdmin('USER')).toBe(false);
    expect(isAdmin('ADMIN')).toBe(true);
    expect(isAdmin('SUPER_ADMIN')).toBe(true);
    expect(canManageRoles('ADMIN')).toBe(false);
    expect(canManageRoles('SUPER_ADMIN')).toBe(true);
  });
  it('filters users and audit', () => {
    const users = [{ uid: '1', name: 'A', email: 'a@x.co', role: 'USER' as const, status: 'ACTIVE' as const }];
    expect(filterUsers(users, 'a@x')).toHaveLength(1);
    expect(filterUsers(users, 'zzz')).toHaveLength(0);
    const audit = [{ id: '1', actor: 'admin', action: 'USER_SUSPEND', target: 'x', ts: 't' }];
    expect(filterAudit(audit, 'suspend')).toHaveLength(1);
  });
});

// ── Component ───────────────────────────────────────────────────────────────
function asRole(role: GlobalRole | null) {
  if (role === null) { useAuthStore.setState({ status: 'unauthenticated', user: null }); return; }
  useAuthStore.setState({ status: 'authenticated', user: { uid: 'admin', email: 'admin@x.co', displayName: 'Admin', isAnonymous: false, role } });
}

beforeEach(() => {
  localStorage.clear();
  useUIStore.setState({ theme: 'system', locale: 'en' });
  useAuthStore.setState({ status: 'loading', user: null, modalOpen: false });
  useAdminStore.setState({ data: null, loading: false });
  useAdminStore.getState().setService(createMockAdminService());
});
afterEach(() => vi.restoreAllMocks());

function renderAdmin() {
  const router = createMemoryRouter(routes, { initialEntries: ['/admin'] });
  return render(<ThemeProvider><LocaleProvider><RouterProvider router={router} /></LocaleProvider></ThemeProvider>);
}

describe('US-016 Admin console', () => {
  it('denies non-admins (AC6)', async () => {
    asRole('USER');
    renderAdmin();
    expect(await screen.findByRole('heading', { name: 'Access denied' })).toBeInTheDocument();
  });

  it('denies signed-out users', async () => {
    asRole(null);
    renderAdmin();
    expect(await screen.findByRole('heading', { name: 'Access denied' })).toBeInTheDocument();
  });

  it('suspends a user with a reason and audits it (AC2/AC5)', async () => {
    asRole('ADMIN');
    renderAdmin();
    await screen.findByText('khalid@example.com');
    await userEvent.click(screen.getAllByRole('button', { name: 'Suspend' })[0]);
    const dialog = await screen.findByRole('dialog', { name: 'Suspend user' });
    await userEvent.type(within(dialog).getByLabelText('Reason'), 'policy violation');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Suspend' }));
    await waitFor(() => {
      const data = useAdminStore.getState().data!;
      expect(data.users.find((u) => u.uid === 'u1')?.status).toBe('SUSPENDED');
      expect(data.audit.some((a) => a.action === 'USER_SUSPEND')).toBe(true);
    });
  });

  it('removes flagged content with a reason and audits it (AC1/AC5)', async () => {
    asRole('ADMIN');
    renderAdmin();
    await screen.findByText('khalid@example.com');
    await userEvent.click(screen.getByRole('tab', { name: 'Moderation' }));
    await userEvent.click((await screen.findAllByRole('button', { name: 'Remove' }))[0]);
    const dialog = await screen.findByRole('dialog', { name: 'Remove content' });
    await userEvent.type(within(dialog).getByLabelText('Reason'), 'abusive');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Remove' }));
    await waitFor(() => {
      const data = useAdminStore.getState().data!;
      expect(data.flags.find((f) => f.id === 'f1')?.status).toBe('REMOVED');
      expect(data.audit.some((a) => a.action === 'CONTENT_MODERATE')).toBe(true);
    });
  });

  it('blocks role management for a plain ADMIN (AC3)', async () => {
    asRole('ADMIN');
    renderAdmin();
    await screen.findByText('khalid@example.com');
    await userEvent.click(screen.getByRole('tab', { name: 'Roles' }));
    expect(await screen.findByText('Only a super-admin can manage roles.')).toBeInTheDocument();
  });

  it('lets a SUPER_ADMIN assign roles (audited)', async () => {
    asRole('SUPER_ADMIN');
    renderAdmin();
    await screen.findByText('khalid@example.com');
    await userEvent.click(screen.getByRole('tab', { name: 'Roles' }));
    const selects = await screen.findAllByRole('combobox', { name: 'Role' });
    await userEvent.selectOptions(selects[0], 'ADMIN');
    await waitFor(() => expect(useAdminStore.getState().data!.audit.some((a) => a.action === 'ROLE_ASSIGN')).toBe(true));
  });
});
