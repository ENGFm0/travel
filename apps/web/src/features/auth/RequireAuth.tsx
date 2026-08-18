import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from './authStore';

/** Route guard. Account-only by default; pass allowGuest to permit anonymous
 *  browsing. Frontend guard is UX only — the API enforces access server-side. */
export function RequireAuth({
  children,
  allowGuest = false,
}: {
  children: React.ReactNode;
  allowGuest?: boolean;
}) {
  const { t } = useTranslation();
  const { status, isGuest, openAuth } = useAuth();
  const allowed = status === 'authenticated' || (allowGuest && status === 'guest');

  useEffect(() => {
    if (status !== 'loading' && !allowed) openAuth();
  }, [status, allowed, openAuth]);

  if (status === 'loading') {
    return <div className="bp-page" aria-busy="true">…</div>;
  }
  if (allowed) return <>{children}</>;

  return (
    <section className="bp-page">
      <h1>{t('account.guardTitle')}</h1>
      <p className="bp-page__lead">{isGuest ? t('account.guestGuardLead') : t('account.guardLead')}</p>
      <button className="bp-btn bp-btn--primary" style={{ maxWidth: 220 }} onClick={openAuth}>
        {t('account.signInCta')}
      </button>
    </section>
  );
}
