import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import '@/shared/i18n';
import { routes } from '@/app/router';
import { ThemeProvider } from '@/app/providers/ThemeProvider';
import { LocaleProvider } from '@/app/providers/LocaleProvider';
import { useUIStore } from '@/app/store/uiStore';

function boot() {
  const router = createMemoryRouter(routes, { initialEntries: ['/'] });
  return render(
    <ThemeProvider>
      <LocaleProvider>
        <RouterProvider router={router} />
      </LocaleProvider>
    </ThemeProvider>,
  );
}

describe('Home page', () => {
  beforeEach(() => {
    localStorage.clear();
    useUIStore.setState({ theme: 'system', locale: 'ar' });
  });

  it('renders the hero, a New Trip CTA linking to the wizard, and quick actions', () => {
    boot();
    expect(screen.getByRole('heading', { level: 1, name: 'أهلًا بك في بوردنق باس' })).toBeInTheDocument();
    const cta = screen.getByRole('link', { name: /ابدأ رحلة جديدة/ });
    expect(cta).toHaveAttribute('href', expect.stringContaining('new=1'));
    // quick-action tiles are present (scoped: "رحلاتي" also appears in the nav)
    const actions = document.querySelector('.bp-home__actions') as HTMLElement;
    expect(within(actions).getByText('رحلاتي')).toBeInTheDocument();
    expect(within(actions).getByText('رفقاء السفر')).toBeInTheDocument();
  });

  it('lists suggested destinations that link into the create flow', () => {
    boot();
    const grid = document.querySelector('.bp-dest-grid') as HTMLElement;
    expect(grid).toBeTruthy();
    const cards = within(grid).getAllByRole('link');
    expect(cards.length).toBe(6);
    expect(within(grid).getByText('العلا')).toBeInTheDocument();
    cards.forEach((c) => expect(c).toHaveAttribute('href', expect.stringContaining('new=1')));
  });
});
