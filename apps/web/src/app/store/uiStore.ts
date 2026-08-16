import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ThemeChoice, Locale } from '@boardingpass/types';

export type { ThemeChoice, Locale };

interface UIState {
  theme: ThemeChoice;
  locale: Locale;
  setTheme: (t: ThemeChoice) => void;
  toggleTheme: () => void; // cycles light -> dark -> system
  setLocale: (l: Locale) => void;
  toggleLocale: () => void;
}

/**
 * UI store — only cross-cutting UI state (theme + locale). Server state lives
 * in TanStack Query (later stories); form state in RHF. Persisted to
 * localStorage so preference survives reloads; server remains source of truth
 * once the user is authenticated (US-002).
 */
export const useUIStore = create<UIState>()(
  persist(
    (set, get) => ({
      theme: 'system',
      locale: 'ar',
      setTheme: (theme) => set({ theme }),
      toggleTheme: () => {
        const order: ThemeChoice[] = ['light', 'dark', 'system'];
        const next = order[(order.indexOf(get().theme) + 1) % order.length];
        set({ theme: next });
      },
      setLocale: (locale) => set({ locale }),
      toggleLocale: () => set({ locale: get().locale === 'ar' ? 'en' : 'ar' }),
    }),
    { name: 'bp.ui.v1' },
  ),
);
