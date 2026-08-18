import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/features/auth/authStore';
import { useTripsList, tripsActions } from '@/features/trips/tripsStore';
import { PLACE_CATEGORIES, filterPlaces, type Place, type PlaceCategory } from './placesModel';
import { placesActions, usePlaces } from './placesStore';

export function ExplorePage() {
  const { t } = useTranslation();
  const { isAuthenticated, openAuth } = useAuth();
  const { places, loading } = usePlaces();
  const { trips } = useTripsList();
  const [category, setCategory] = useState<PlaceCategory | 'ALL'>('ALL');
  const [query, setQuery] = useState('');
  const [addPlace, setAddPlace] = useState<Place | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    void placesActions.load();
    if (trips === null) void tripsActions.load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const shown = useMemo(() => filterPlaces(places ?? [], category, query), [places, category, query]);
  const myTrips = useMemo(() => (trips ?? []).filter((tr) => tr.status === 'ACTIVE'), [trips]);

  function rate(place: Place, stars: number) {
    if (!isAuthenticated) { openAuth(); return; }
    void placesActions.rate(place.id, stars);
  }
  function openAdd(place: Place) {
    if (!isAuthenticated) { openAuth(); return; }
    setAddPlace(place);
  }
  function flash(msg: string) { setToast(msg); window.setTimeout(() => setToast(null), 2500); }

  return (
    <section className="bp-page bp-explore">
      <h1>{t('explorePage.title')}</h1>
      <p className="bp-page__lead">{t('explorePage.lead')}</p>

      <div className="bp-chips-row">
        <button className={`bp-chip bp-chip--btn ${category === 'ALL' ? 'is-on' : ''}`} aria-pressed={category === 'ALL'} onClick={() => setCategory('ALL')}>{t('explorePage.all')}</button>
        {PLACE_CATEGORIES.map((c) => (
          <button key={c} className={`bp-chip bp-chip--btn ${category === c ? 'is-on' : ''}`} aria-pressed={category === c} onClick={() => setCategory(c)}>{t(`explorePage.cat.${c}`)}</button>
        ))}
      </div>

      <input className="bp-input" value={query} placeholder={t('explorePage.search')} aria-label={t('explorePage.search')} onChange={(e) => setQuery(e.target.value)} />

      {toast && <div className="bp-banner bp-banner--ok" role="status">{toast}</div>}

      {loading && places === null ? (
        <p className="bp-page__lead">…</p>
      ) : shown.length === 0 ? (
        <div className="bp-empty"><span className="material-symbols-outlined bp-empty__icon" aria-hidden="true">travel_explore</span><p>{t('explorePage.empty')}</p></div>
      ) : (
        <ul className="bp-place-grid" role="list">
          {shown.map((p) => (
            <li key={p.id}>
              <PlaceCard place={p} canAdd={myTrips.length > 0} onRate={(s) => rate(p, s)} onAdd={() => openAdd(p)} />
            </li>
          ))}
        </ul>
      )}

      {addPlace && (
        <AddToTripModal place={addPlace} trips={myTrips}
          onClose={() => setAddPlace(null)}
          onDone={(tripTitle) => { setAddPlace(null); flash(t('explorePage.added', { trip: tripTitle })); }} />
      )}
    </section>
  );
}

function Stars({ value, onRate }: { value: number; onRate: (n: number) => void }) {
  const { t } = useTranslation();
  return (
    <div className="bp-stars" role="group" aria-label={t('explorePage.rate')}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" className="bp-star" aria-label={t('explorePage.rateN', { n })} aria-pressed={n <= value} onClick={() => onRate(n)}>
          <span className="material-symbols-outlined" style={{ fontVariationSettings: n <= value ? "'FILL' 1" : "'FILL' 0" }} aria-hidden="true">star</span>
        </button>
      ))}
    </div>
  );
}

function PlaceCard({ place, canAdd, onRate, onAdd }: { place: Place; canAdd: boolean; onRate: (n: number) => void; onAdd: () => void }) {
  const { t } = useTranslation();
  return (
    <article className="bp-place-card">
      <div className="bp-place-card__photo" aria-hidden="true"><span className="material-symbols-outlined">image</span></div>
      <div className="bp-place-card__body">
        <div className="bp-place-card__top">
          <span className="bp-chip bp-chip--cat">{t(`explorePage.cat.${place.category}`)}</span>
          <span className="bp-place-card__rating"><span className="material-symbols-outlined" aria-hidden="true">star</span>{place.rating.toFixed(1)} <span className="bp-place-card__count">({place.ratingCount})</span></span>
        </div>
        <h3 className="bp-place-card__title">{place.name}</h3>
        <p className="bp-place-card__area">{place.area} · {place.city}</p>
        <Stars value={place.myRating ?? 0} onRate={onRate} />
        {canAdd && <button className="bp-btn bp-btn--outline bp-btn--sm" onClick={onAdd}>{t('explorePage.addToTrip')}</button>}
      </div>
    </article>
  );
}

function AddToTripModal({ place, trips, onClose, onDone }: {
  place: Place; trips: { id: string; title: string; cities: { name: string }[] }[];
  onClose: () => void; onDone: (tripTitle: string) => void;
}) {
  const { t } = useTranslation();
  const [tripId, setTripId] = useState(trips[0]?.id ?? '');
  const trip = trips.find((tr) => tr.id === tripId) ?? trips[0];
  const [city, setCity] = useState(trip?.cities[0]?.name ?? '');
  const [busy, setBusy] = useState(false);

  async function confirm() {
    if (!tripId) return;
    setBusy(true);
    try { await placesActions.addToTrip(place.id, tripId, city); onDone(trip?.title ?? ''); }
    finally { setBusy(false); }
  }

  return (
    <div className="bp-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bp-modal" role="dialog" aria-modal="true" aria-label={t('explorePage.addToTrip')} onMouseDown={(e) => e.stopPropagation()}>
        <div className="bp-modal__head">
          <h2 className="bp-modal__title">{t('explorePage.addTitle', { name: place.name })}</h2>
          <button className="bp-icon-btn" aria-label={t('trips.close')} onClick={onClose}><span className="material-symbols-outlined" aria-hidden="true">close</span></button>
        </div>
        <div className="bp-field">
          <label htmlFor="bp-add-trip">{t('explorePage.chooseTrip')}</label>
          <select id="bp-add-trip" className="bp-input" value={tripId} onChange={(e) => { setTripId(e.target.value); const tr = trips.find((x) => x.id === e.target.value); setCity(tr?.cities[0]?.name ?? ''); }}>
            {trips.map((tr) => <option key={tr.id} value={tr.id}>{tr.title}</option>)}
          </select>
        </div>
        {(trip?.cities.length ?? 0) > 0 && (
          <div className="bp-field">
            <label htmlFor="bp-add-city">{t('explorePage.chooseCity')}</label>
            <select id="bp-add-city" className="bp-input" value={city} onChange={(e) => setCity(e.target.value)}>
              {trip!.cities.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
            </select>
          </div>
        )}
        <div className="bp-row-between">
          <button className="bp-btn bp-btn--primary" disabled={busy} onClick={confirm}>{t('explorePage.confirmAdd')}</button>
          <button className="bp-btn bp-btn--outline" onClick={onClose}>{t('trips.close')}</button>
        </div>
      </div>
    </div>
  );
}
