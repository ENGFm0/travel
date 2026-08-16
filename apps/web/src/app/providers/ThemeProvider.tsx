import { useEffect } from 'react';
import { useUIStore } from '@/app/store/uiStore';

/** Resolves theme choice (light/dark/system) to an explicit `data-theme` on
 *  <html>, and keeps "system" in sync with the OS preference live. */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useUIStore((s) => s.theme);

  useEffect(() => {
    const root = document.documentElement;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');

    const apply = () => {
      const resolved = theme === 'system' ? (mql.matches ? 'dark' : 'light') : theme;
      root.setAttribute('data-theme', resolved);
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', resolved === 'dark' ? '#0f1a30' : '#14213d');
    };

    apply();
    if (theme === 'system') {
      mql.addEventListener('change', apply);
      return () => mql.removeEventListener('change', apply);
    }
    return undefined;
  }, [theme]);

  return <>{children}</>;
}
