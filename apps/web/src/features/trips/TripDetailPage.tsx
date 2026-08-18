import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { formatDate } from '@boardingpass/core';
import { useUIStore } from '@/app/store/uiStore';
import { MembersPanel } from '@/features/members/MembersPanel';
import { tripsActions } from './tripsStore';
import type { Trip } from './tripsService';

type LoadState = 'loading' | 'ready' | 'missing';

/** Minimal trip dashboard shell (US-006 will add itinerary/tasks/expenses tabs).
 *  Today it hosts the Members panel (US-009). */
export function TripDetailPage() {
  const { t } = useTranslation();
  const locale = useUIStore((s) => s.locale);
  const { id = '' } = useParams();
  const [state, setState] = useState<LoadState>('loading');
  const [trip, setTrip] = useState<Trip | null>(null);

  useEffect(() => {
    let live = true;
    setState('loading');
    tripsActions
      .get(id)
      .then((tr) => {
        if (!live) return;
        setTrip(tr);
        setState(tr ? 'ready' : 'missing');
      })
      .catch(() => live && setState('missing'));
    return () => { live = false; };
  }, [id]);

  if (state === 'loading') {
    return <section className="bp-page" aria-busy="true"><p className="bp-page__lead">…</p></section>;
  }

  if (state === 'missing' || !trip) {
    return (
      <section className="bp-page">
        <h1>{t('tripDetail.notFoundTitle')}</h1>
        <p className="bp-page__lead">{t('tripDetail.notFoundLead')}</p>
        <Link className="bp-chip" to="/mytrips">{t('tripDetail.backToTrips')}</Link>
      </section>
    );
  }

  const domestic = trip.type === 'DOMESTIC';
  const dest = trip.cities.map((c) => c.name).filter(Boolean).join('، ');
  const range = trip.dateTo
    ? `${formatDate(trip.dateFrom, locale)} – ${formatDate(trip.dateTo, locale)}`
    : formatDate(trip.dateFrom, locale);

  return (
    <section className="bp-page bp-trip-detail">
      <Link className="bp-back" to="/mytrips">
        <span className="material-symbols-outlined" aria-hidden="true">arrow_back</span>
        {t('tripDetail.backToTrips')}
      </Link>

      <header className="bp-trip-detail__head">
        <div className="bp-trip-detail__titles">
          <span className={`bp-badge ${domestic ? 'bp-badge--green' : 'bp-badge--blue'}`}>
            {t(domestic ? 'trips.domestic' : 'trips.international')}
          </span>
          <h1>{trip.title}</h1>
          <p className="bp-trip-detail__meta">
            <span className="material-symbols-outlined" aria-hidden="true">location_on</span>{dest || '—'}
            <span className="bp-sep" aria-hidden="true">·</span>
            <span className="material-symbols-outlined" aria-hidden="true">event</span>{range}
          </p>
        </div>
      </header>

      {/* Dashboard tabs are delivered by US-006; the Members section is US-009. */}
      <MembersPanel tripId={trip.id} />
    </section>
  );
}
