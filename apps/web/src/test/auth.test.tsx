import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import '@/shared/i18n';
import { App } from '@/App';
import { routes } from '@/app/router';
import { ThemeProvider } from '@/app/providers/ThemeProvider';
import { LocaleProvider } from '@/app/providers/LocaleProvider';
import { useUIStore } from '@/app/store/uiStore';
import { useAuthStore } from '@/features/auth/authStore';
import { createMockAuthProvider } from '@/features/auth/providers/mockAuthProvider';

beforeEach(() => {
  localStorage.clear();
  useUIStore.setState({ theme: 'system', locale: 'ar' });
  useAuthStore.setState({ status: 'loading', user: null, modalOpen: false });
  // inject the in-memory provider so App.initAuth() short-circuits
  useAuthStore.getState().setProvider(createMockAuthProvider());
});

async function openModal() {
  render(<App />);
  await userEvent.click(screen.getByRole('button', { name: 'الحساب / تسجيل الدخول' }));
  return screen.findByTestId('auth-modal');
}

describe('US-001 Authentication', () => {
  it('profile action opens the auth modal (unauthenticated)', async () => {
    await openModal();
    expect(screen.getByRole('heading', { name: 'تسجيل الدخول أو إنشاء حساب' })).toBeInTheDocument();
  });

  it('routes a REGISTERED email to the login step', async () => {
    await openModal();
    await userEvent.type(screen.getByLabelText('البريد الإلكتروني'), 'user@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'المتابعة بالبريد' }));
    expect(await screen.findByLabelText('كلمة المرور')).toBeInTheDocument();
  });

  it('routes a NEW email to the registration step', async () => {
    await openModal();
    await userEvent.type(screen.getByLabelText('البريد الإلكتروني'), 'new.person@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'المتابعة بالبريد' }));
    expect(await screen.findByLabelText('الاسم الأول')).toBeInTheDocument();
  });

  it('rejects an invalid email', async () => {
    await openModal();
    await userEvent.type(screen.getByLabelText('البريد الإلكتروني'), 'not-an-email');
    await userEvent.click(screen.getByRole('button', { name: 'المتابعة بالبريد' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('البريد الإلكتروني غير صحيح');
  });

  it('shows an error on wrong password, then signs in with the right one', async () => {
    await openModal();
    await userEvent.type(screen.getByLabelText('البريد الإلكتروني'), 'user@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'المتابعة بالبريد' }));
    const pw = await screen.findByLabelText('كلمة المرور');
    await userEvent.type(pw, 'wrongpass');
    await userEvent.click(screen.getByRole('button', { name: 'دخول' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('بيانات الدخول غير صحيحة');

    await userEvent.clear(pw);
    await userEvent.type(pw, 'password1');
    await userEvent.click(screen.getByRole('button', { name: 'دخول' }));
    await waitFor(() => expect(useAuthStore.getState().status).toBe('authenticated'));
    await waitFor(() => expect(screen.queryByTestId('auth-modal')).not.toBeInTheDocument());
  });

  it('registers a new account', async () => {
    await openModal();
    await userEvent.type(screen.getByLabelText('البريد الإلكتروني'), 'sara@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'المتابعة بالبريد' }));
    await userEvent.type(await screen.findByLabelText('الاسم الأول'), 'سارة');
    await userEvent.type(screen.getByLabelText('الاسم الأخير'), 'أحمد');
    await userEvent.type(screen.getByLabelText('كلمة المرور'), 'passw0rd');
    await userEvent.type(screen.getByLabelText('تأكيد كلمة المرور'), 'passw0rd');
    await userEvent.click(screen.getByRole('button', { name: 'إنشاء الحساب' }));
    await waitFor(() => expect(useAuthStore.getState().status).toBe('authenticated'));
  });

  it('supports guest (anonymous) sign-in', async () => {
    await openModal();
    await userEvent.click(screen.getByRole('button', { name: 'المتابعة كضيف' }));
    await waitFor(() => expect(useAuthStore.getState().status).toBe('guest'));
  });
});

describe('US-001 route guard', () => {
  it('blocks /profile when unauthenticated and shows the sign-in prompt', async () => {
    const router = createMemoryRouter(routes, { initialEntries: ['/profile'] });
    render(
      <ThemeProvider>
        <LocaleProvider>
          <RouterProvider router={router} />
        </LocaleProvider>
      </ThemeProvider>,
    );
    expect(await screen.findByRole('heading', { name: 'تحتاج تسجيل الدخول' })).toBeInTheDocument();
  });
});
