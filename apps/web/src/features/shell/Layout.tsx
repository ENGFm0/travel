import { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Header } from './Header';
import { Footer } from './Footer';
import { BottomNav } from './BottomNav';

/** App shell layout: skip-link + header + routed main + footer + bottom nav. */
export function Layout() {
  const { t } = useTranslation();
  return (
    <div className="bp-app">
      <a className="bp-skip-link" href="#main">
        {t('header.skipToContent')}
      </a>
      <Header />
      <main id="main" className="bp-main" tabIndex={-1}>
        <Suspense fallback={<div aria-busy="true">…</div>}>
          <Outlet />
        </Suspense>
      </main>
      <Footer />
      <BottomNav />
    </div>
  );
}
