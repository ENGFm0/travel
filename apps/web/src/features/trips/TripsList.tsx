import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { formatDate } from '@boardingpass/core';
import { useUIStore } from '@/app/store/uiStore';
import { tripsActions, useTripsList, useTripsStore } from './tripsStore';
import { tripIsUpcoming, type Trip } from './tripsService';

type SubTab = 'trips' | 'friends';
type Filter = 'upcoming' | 'past';

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Whole days from today until the trip starts (>=0 while upcoming). */
function daysUntil(dateFrom: string, today: string): number {
  const ms = new Date(dateFrom + 'T00:00:00').getTime() - new Date(today + 'T00:00:00').getTime();
  return Math.round(ms / 86_400_000);
}

export function TripsList() {
  const { t } = useTranslation();
  const locale = useUIStore((s) => s.locale);
  const { hash } = useLocation();
  const { trips, loading, error } = useTripsList();
  const openWizard = useTripsStore((s) => s.openWizard);

  const [sub, setSub] = useState<SubTab>(hash === '#friends' ? 'friends' : 'trips');
  const [filter, setFilter] = useState<Filter>('upcoming');

  useEffect(() => {
    if (hash === '#friends') setSub('friends');
  }, [hash]);

  useEffect(() => {
    void tripsActions.load();
  }, []);

  const today = todayISO();
  const { upcoming, past } = useMemo(() => {
    const list = trips ?? [];
    return {
      upcoming: list.filter((tr) => tripIsUpcoming(tr, today)),
      past: list.filter((tr) => !tripIsUpcoming(tr, today)),
    };
  }, [trips, today]);

  const shown = filter === 'upcoming' ? upcoming : past;

  return (
    <section className="bp-page bp-trips">
      <div className="bp-trips__head">
        <div>
          <h1>{t('pages.mytrips.title')}</h1>
          <p className="bp-page__lead">{t('pages.mytrips.lead')}</p>
        </div>
        <button className="bp-btn bp-btn--primary" onClick={openWizard}>
          <span className="material-symbols-outlined" aria-hidden="true">add</span>
          {t('nav.newTrip')}
        </button>
      </div>

      {/* Sub-tabs: My Trips | Friends & Group (US-010 content lands later) */}
      <div className="bp-subtabs" role="tablist" aria-label={t('pages.mytrips.title')}>
        <button role="tab" aria-selected={sub === 'trips'} className={`bp-subtab ${sub === 'trips' ? 'is-on' : ''}`} onClick={() => setSub('trips')}>
          {t('trips.tabMine')}
        </button>
        <button role="tab" aria-selected={sub === 'friends'} className={`bp-subtab ${sub === 'friends' ? 'is-on' : ''}`} onClick={() => setSub('friends')}>
          {t('trips.tabFriends')}
        </button>
      </div>

      {sub === 'friends' ? (
        <div className="bp-card">
          <span className="bp-chip">US-010 · {t('trips.tabFriends')}</span>
          <p style={{ marginTop: 12, marginBottom: 0 }}>{t('trips.friendsSoon')}</p>
        </div>
      ) : (
        <>
          {/* Upcoming / Past filter */}
          <div className="bp-filter-tabs" role="tablist" aria-label={t('trips.filterLabel')}>
            <button role="tab" aria-selected={filter === 'upcoming'} className={`bp-filter-tab ${filter === 'upcoming' ? 'is-on' : ''}`} onClick={() => setFilter('upcoming')}>
              {t('trips.upcoming')} {upcoming.length > 0 && <span className="bp-count">{upcoming.length}</span>}
            </button>
            <button role="tab" aria-selected={filter === 'past'} className={`bp-filter-tab ${filter === 'past' ? 'is-on' : ''}`} onClick={() => setFilter('past')}>
              {t('trips.past')} {past.length > 0 && <span className="bp-count">{past.length}</span>}
            </button>
          </div>

          {error && <div className="bp-banner" role="alert">{t('trips.errors.LIST_FAILED')}</div>}

          {loading && trips === null ? (
            <div className="bp-trips__grid" aria-busy="true">
              {[0, 1, 2].map((i) => <div key={i} className="bp-trip-card bp-skeleton" aria-hidden="true" />)}
            </div>
          ) : shown.length === 0 ? (
            <EmptyState kind={(trips?.length ?? 0) === 0 ? 'none' : filter} onCreate={openWizard} />
          ) : (
            <ul className="bp-trips__grid" role="list">
              {shown.map((trip) => (
                <li key={trip.id}>
                  <TripCard trip={trip} today={today} locale={locale} isPast={filter === 'past'} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

function TripCard({ trip, today, locale, isPast }: { trip: Trip; today: string; locale: 'ar' | 'en'; isPast: boolean }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const dest = trip.cities.map((c) => c.name).filter(Boolean).join('، ');
  const range = trip.dateTo
    ? `${formatDate(trip.dateFrom, locale)} – ${formatDate(trip.dateTo, locale)}`
    : formatDate(trip.dateFrom, locale);
  const days = daysUntil(trip.dateFrom, today);
  const progress = Math.max(0, Math.min(100, trip.progress ?? 0));
  const domestic = trip.type === 'DOMESTIC';

  async function archive() {
    setBusy(true);
    try { await tripsActions.setStatus(trip.id, 'ARCHIVED'); } finally { setBusy(false); }
  }
  async function remove() {
    if (!window.confirm(t('trips.confirmDelete'))) return;
    setBusy(true);
    try { await tripsActions.remove(trip.id); } finally { setBusy(false); }
  }

  return (
    <article className="bp-trip-card">
      <div className="bp-trip-card__top">
        <span className={`bp-badge ${domestic ? 'bp-badge--green' : 'bp-badge--blue'}`}>
          {t(domestic ? 'trips.domestic' : 'trips.international')}
        </span>
        {!isPast && days >= 0 && (
          <span className="bp-countdown">
            {days === 0 ? t('trips.startsToday') : t('trips.inDays', { count: days })}
          </span>
        )}
      </div>

      <h3 className="bp-trip-card__title">{trip.title}</h3>
      <p className="bp-trip-card__meta">
        <span className="material-symbols-outlined" aria-hidden="true">location_on</span>
        {dest || '—'}
      </p>
      <p className="bp-trip-card__meta">
        <span className="material-symbols-outlined" aria-hidden="true">event</span>
        {range}
      </p>

      <div className="bp-progress" aria-label={t('trips.progress')}>
        <div className="bp-progress__bar" style={{ inlineSize: `${progress}%` }} />
      </div>
      <span className="bp-progress__pct">{t('trips.progressPct', { pct: progress })}</span>

      <div className="bp-trip-actions">
        <button className="bp-btn bp-btn--outline" disabled title={t('common.comingSoon')}>
          {t('trips.open')}
        </button>
        <button className="bp-icon-btn" aria-label={t('trips.archive')} disabled={busy} onClick={archive}>
          <span className="material-symbols-outlined" aria-hidden="true">archive</span>
        </button>
        <button className="bp-icon-btn" aria-label={t('trips.delete')} disabled={busy} onClick={remove}>
          <span className="material-symbols-outlined" aria-hidden="true">delete</span>
        </button>
      </div>
    </article>
  );
}

function EmptyState({ kind, onCreate }: { kind: 'none' | 'upcoming' | 'past'; onCreate: () => void }) {
  const { t } = useTranslation();
  const key = kind === 'none' ? 'emptyNone' : kind === 'upcoming' ? 'emptyUpcoming' : 'emptyPast';
  return (
    <div className="bp-empty">
      <span className="material-symbols-outlined bp-empty__icon" aria-hidden="true">luggage</span>
      <p>{t(`trips.${key}`)}</p>
      {kind !== 'past' && (
        <button className="bp-btn bp-btn--primary" onClick={onCreate}>{t('nav.newTrip')}</button>
      )}
    </div>
  );
}
