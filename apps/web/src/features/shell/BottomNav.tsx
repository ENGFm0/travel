import { useTranslation } from 'react-i18next';
import { NavLink, useLocation } from 'react-router-dom';
import { BOTTOM_NAV } from './nav.model';

/** Fixed bottom navigation (5 items + centered CTA). Present on all breakpoints
 *  since the header carries no section links (per the minimal-header decision). */
export function BottomNav() {
  const { t } = useTranslation();
  const { pathname } = useLocation();

  return (
    <nav className="bp-bottomnav" aria-label={t('common.openMenu')}>
      <div className="bp-bottomnav__inner">
        {BOTTOM_NAV.map((item) => {
          // active by pathname (ignore query for the CTA)
          const base = item.path.split('?')[0];
          const active = base === '/' ? pathname === '/' : pathname.startsWith(base);
          return (
            <NavLink
              key={item.key}
              to={item.path}
              className={`bp-tab${item.cta ? ' bp-tab--cta' : ''}`}
              aria-current={active ? 'page' : undefined}
            >
              {item.cta ? (
                <span className="bp-fab" aria-hidden="true">
                  <span className="material-symbols-outlined">{item.icon}</span>
                </span>
              ) : (
                <span className="material-symbols-outlined" aria-hidden="true">
                  {item.icon}
                </span>
              )}
              <span>{t(item.labelKey)}</span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
