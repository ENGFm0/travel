import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { TripsList } from '@/features/trips/TripsList';

/** Placeholder section pages for the shell (US-014). Real content is delivered
 *  by later stories (US-001/003/005/006/007/… ) into these routes. */
function Page({ tkey }: { tkey: string }) {
  const { t } = useTranslation();
  return (
    <section className="bp-page">
      <h1>{t(`pages.${tkey}.title`)}</h1>
      <p className="bp-page__lead">{t(`pages.${tkey}.lead`)}</p>
      <div className="bp-card">
        <span className="bp-chip">US-014 · Shell</span>
        <p style={{ marginTop: 12, marginBottom: 0 }}>{t('shellNote')}</p>
      </div>
    </section>
  );
}

export const HomePage = () => <Page tkey="home" />;
export const PlannerPage = () => <Page tkey="planner" />;
export const MemoriesPage = () => <Page tkey="memories" />;
export const MyTripsPage = () => <TripsList />;

export function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <section className="bp-page">
      <h1>{t('pages.notFound.title')}</h1>
      <p className="bp-page__lead">{t('pages.notFound.lead')}</p>
      <Link className="bp-chip" to="/">
        {t('pages.notFound.back')}
      </Link>
    </section>
  );
}
