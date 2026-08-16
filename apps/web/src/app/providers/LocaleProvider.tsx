import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useUIStore } from '@/app/store/uiStore';
import { dirForLocale } from '@boardingpass/types';

/** Keeps i18next language and the <html lang/dir> in sync with the locale
 *  choice. Direction is derived from locale (ar→rtl, en→ltr) — components must
 *  stay direction-agnostic (logical CSS props). */
export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const locale = useUIStore((s) => s.locale);
  const { i18n } = useTranslation();

  useEffect(() => {
    if (i18n.language !== locale) void i18n.changeLanguage(locale);
    const root = document.documentElement;
    root.setAttribute('lang', locale);
    root.setAttribute('dir', dirForLocale(locale));
  }, [locale, i18n]);

  return <>{children}</>;
}
