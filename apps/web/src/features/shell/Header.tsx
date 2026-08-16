import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Logo } from '@/shared/ui/Logo';
import { useUIStore } from '@/app/store/uiStore';
import { ROUTES } from './nav.model';

/** Unified header: logo (start/right in RTL) + actions (dark-mode, language,
 *  account). No hamburger — navigation lives in the bottom nav (US-014). */
export function Header() {
  const { t } = useTranslation();
  const { theme, toggleTheme, locale, toggleLocale } = useUIStore();

  return (
    <header className="bp-header">
      <div className="bp-header__inner">
        <Logo />
        <div className="bp-header__actions">
          <button
            type="button"
            className="bp-icon-btn"
            onClick={toggleLocale}
            aria-label={t('header.toggleLang')}
            title={t('header.toggleLang')}
            style={{ width: 'auto', minWidth: 42, fontWeight: 700, fontSize: 14 }}
          >
            {locale === 'ar' ? 'EN' : 'AR'}
          </button>
          <button
            type="button"
            className="bp-icon-btn"
            onClick={toggleTheme}
            aria-label={t('header.toggleTheme')}
            title={`${t('header.toggleTheme')} · ${t(`theme.${theme}`)}`}
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              {theme === 'dark' ? 'light_mode' : theme === 'light' ? 'dark_mode' : 'brightness_auto'}
            </span>
          </button>
          <Link
            className="bp-icon-btn"
            to={ROUTES.profile}
            aria-label={t('header.account')}
            title={t('header.account')}
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              account_circle
            </span>
          </Link>
        </div>
      </div>
    </header>
  );
}
