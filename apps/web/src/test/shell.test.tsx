import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/shared/i18n';
import { App } from '@/App';
import { useUIStore } from '@/app/store/uiStore';

function boot() {
  return render(<App />);
}

describe('US-014 App Shell', () => {
  beforeEach(() => {
    localStorage.clear();
    // reset shared UI store to defaults so tests are order-independent
    useUIStore.setState({ theme: 'system', locale: 'ar' });
    document.documentElement.removeAttribute('data-theme');
  });

  it('renders header logo and 5 bottom-nav items', async () => {
    await boot();
    const header = document.querySelector('.bp-header') as HTMLElement;
    expect(within(header).getByText('بوردنق باس')).toBeInTheDocument();
    expect(within(header).getByText('BoardingPass')).toBeInTheDocument();
    const nav = document.querySelector('.bp-bottomnav') as HTMLElement;
    expect(nav).toBeTruthy();
    const links = within(nav).getAllByRole('link');
    expect(links).toHaveLength(5);
  });

  it('defaults to Arabic RTL and switches to English LTR', async () => {
    await boot();
    expect(document.documentElement.getAttribute('dir')).toBe('rtl');
    expect(document.documentElement.getAttribute('lang')).toBe('ar');

    const langBtn = screen.getByRole('button', { name: /تغيير اللغة/ });
    await userEvent.click(langBtn);

    expect(document.documentElement.getAttribute('dir')).toBe('ltr');
    expect(document.documentElement.getAttribute('lang')).toBe('en');
    expect(screen.getByText('My Trips')).toBeInTheDocument();
  });

  it('toggles theme light -> dark -> system on data-theme', async () => {
    await boot();
    const themeBtn = screen.getByRole('button', { name: /الوضع الليلي/ });
    // system(default) resolves to light in test (matchMedia=false)
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    await userEvent.click(themeBtn); // -> light
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    await userEvent.click(themeBtn); // -> dark
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    await userEvent.click(themeBtn); // -> system (light)
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('has a skip-to-content link and a labeled main landmark', async () => {
    await boot();
    expect(screen.getByText('تخطَّ إلى المحتوى')).toBeInTheDocument();
    expect(document.getElementById('main')).toBeTruthy();
  });

  it('shows the home page content', async () => {
    await boot();
    expect(screen.getByRole('heading', { name: 'أهلًا بك في بوردنق باس' })).toBeInTheDocument();
  });
});
