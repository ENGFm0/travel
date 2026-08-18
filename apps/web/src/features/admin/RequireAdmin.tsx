import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useAuth } from '@/features/auth/authStore';
import { isAdmin } from './adminModel';

/** Admin route guard (US-016). Frontend gate is UX only — the `/api/v1/admin/*`
 *  endpoints enforce ADMIN/SUPER_ADMIN server-side and return 403 otherwise
 *  (AC6). Non-admins (incl. signed-out) see a denied page, never the console. */
export function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const { status, user } = useAuth();

  if (status === 'loading') return <div className="bp-page" aria-busy="true">…</div>;

  if (status !== 'authenticated' || !user || !isAdmin(user.role)) {
    return (
      <section className="bp-page">
        <h1>{t('admin.deniedTitle')}</h1>
        <p className="bp-page__lead">{t('admin.deniedLead')}</p>
        <Link className="bp-chip" to="/">{t('pages.notFound.back')}</Link>
      </section>
    );
  }
  return <>{children}</>;
}
