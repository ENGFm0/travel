import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import '@/shared/i18n';
import { routes } from '@/app/router';
import { ThemeProvider } from '@/app/providers/ThemeProvider';
import { LocaleProvider } from '@/app/providers/LocaleProvider';
import { useUIStore } from '@/app/store/uiStore';

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

describe('US-014 routing', () => {
  beforeEach(() => {
    localStorage.clear();
    useUIStore.setState({ theme: 'system', locale: 'ar' });
  });

  it('renders the Explore section at /explore', async () => {
    renderAt('/explore');
    expect(await screen.findByRole('heading', { name: 'استكشف وتوصيات' })).toBeInTheDocument();
  });

  it('renders NotFound for an unknown route', async () => {
    renderAt('/does-not-exist');
    expect(await screen.findByRole('heading', { name: 'الصفحة غير موجودة' })).toBeInTheDocument();
  });
});
