import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

/** Home / landing page. Replaces the shell placeholder with real content:
 *  a hero + primary CTA, quick-action tiles into the main sections, a set of
 *  suggested destinations (marketing), and a "how it works" feature strip.
 *  Purely presentational — the New Trip CTA routes through `/?new=1`, which the
 *  TripsController turns into the create-trip wizard (or the auth modal for
 *  guests). */

const ACTIONS = [
  { key: 'newTrip', to: '/?new=1', icon: 'add_circle' },
  { key: 'myTrips', to: '/mytrips', icon: 'luggage' },
  { key: 'buddies', to: '/buddies', icon: 'diversity_3' },
  { key: 'explore', to: '/explore', icon: 'explore' },
] as const;

const DESTINATIONS = ['alula', 'riyadh', 'jeddah', 'abha', 'istanbul', 'dubai'] as const;

const FEATURES = [
  { key: 'itinerary', icon: 'calendar_month' },
  { key: 'expenses', icon: 'payments' },
  { key: 'tasks', icon: 'checklist' },
  { key: 'memories', icon: 'photo_library' },
] as const;

export function HomePage() {
  const { t } = useTranslation();

  return (
    <section className="bp-page bp-home">
      {/* Hero */}
      <div className="bp-home__hero">
        <h1>{t('pages.home.title')}</h1>
        <p className="bp-page__lead">{t('pages.home.lead')}</p>
        <div className="bp-home__hero-cta">
          <Link className="bp-btn bp-btn--primary" to="/?new=1">
            <span className="material-symbols-outlined" aria-hidden="true">add</span>
            {t('home.heroCta')}
          </Link>
          <Link className="bp-btn bp-btn--outline" to="/explore">
            <span className="material-symbols-outlined" aria-hidden="true">explore</span>
            {t('home.browse')}
          </Link>
        </div>
      </div>

      {/* Quick actions */}
      <h2 className="bp-home__h2">{t('home.quickTitle')}</h2>
      <div className="bp-home__actions">
        {ACTIONS.map((a) => (
          <Link key={a.key} className="bp-action-tile" to={a.to}>
            <span className="material-symbols-outlined bp-action-tile__icon" aria-hidden="true">{a.icon}</span>
            <span className="bp-action-tile__title">{t(`home.actions.${a.key}`)}</span>
            <span className="bp-action-tile__sub">{t(`home.actions.${a.key}Sub`)}</span>
          </Link>
        ))}
      </div>

      {/* Suggested destinations (marketing) */}
      <div className="bp-home__section-head">
        <div>
          <h2 className="bp-home__h2">{t('home.destTitle')}</h2>
          <p className="bp-home__section-sub">{t('home.destSub')}</p>
        </div>
      </div>
      <ul className="bp-dest-grid" role="list">
        {DESTINATIONS.map((d, i) => (
          <li key={d}>
            <Link className="bp-dest-card" to="/?new=1" aria-label={t(`home.dest.${d}.name`)}>
              <span className={`bp-dest-card__art bp-dest-card__art--${i + 1}`} aria-hidden="true">
                <span className="material-symbols-outlined">travel_explore</span>
              </span>
              <span className="bp-dest-card__body">
                <span className="bp-dest-card__name">{t(`home.dest.${d}.name`)}</span>
                <span className="bp-dest-card__tag">{t(`home.dest.${d}.tag`)}</span>
                <span className="bp-dest-card__cta">
                  {t('home.plan')}
                  <span className="material-symbols-outlined" aria-hidden="true">arrow_back</span>
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>

      {/* How it works */}
      <h2 className="bp-home__h2">{t('home.featTitle')}</h2>
      <ul className="bp-feat-grid" role="list">
        {FEATURES.map((f) => (
          <li key={f.key} className="bp-feat">
            <span className="material-symbols-outlined bp-feat__icon" aria-hidden="true">{f.icon}</span>
            <div>
              <p className="bp-feat__t">{t(`home.feat.${f.key}.t`)}</p>
              <p className="bp-feat__d">{t(`home.feat.${f.key}.d`)}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
