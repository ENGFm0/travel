import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDate } from '@boardingpass/core';
import { useUIStore } from '@/app/store/uiStore';
import { useAuth } from '@/features/auth/authStore';
import { useTripsList, tripsActions } from '@/features/trips/tripsStore';
import { mapsEnabled, searchPlacesByText, type GmapsPlace } from '@/shared/googleMaps';
import {
  addPlaceToItinerary, getItineraryBoard, formatTime12, periodFromTime,
  type ActivityKind, type Board,
} from '@/features/itinerary/itineraryService';
import {
  categoryFromTypes, CATEGORY_QUERY, citiesOf, filterPlaces,
  PLACE_CATEGORIES, type Place, type PlaceCategory,
} from './placesModel';
import { placesActions, usePlaces } from './placesStore';
import {
  filterPartners, PARTNER_CATEGORIES, PARTNER_ICON, type Partner, type PartnerCategory,
} from '@/features/partners/partnersModel';
import { partnersActions, usePartners } from '@/features/partners/partnersStore';

type Tab = 'places' | 'partners';
type PlaceView = 'maps' | 'picks';
interface TripLite { id: string; title: string; cities: { name: string }[] }

/** PlaceCategory → itinerary ActivityKind (for the real add to the schedule). */
const KIND: Record<PlaceCategory, ActivityKind> = {
  RESTAURANTS: 'FOOD', LANDMARKS: 'SIGHT', ACTIVITIES: 'ACTIVITY', SHOPPING: 'SHOPPING',
};

/** Convert a Google result into our Place shape. */
function toPlace(g: GmapsPlace, city: string): Place {
  return {
    id: g.id,
    name: g.name,
    category: categoryFromTypes(g.types),
    area: g.address ?? '',
    city,
    rating: g.rating ?? 0,
    ratingCount: g.ratingCount ?? 0,
    photoUrl: g.photoUrl,
    mapsUrl: g.mapsUrl,
  };
}

export function ExplorePage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('places');

  useEffect(() => {
    void placesActions.load();
    void partnersActions.load();
  }, []);

  return (
    <section className="bp-page bp-explore">
      <h1>{t('explorePage.title')}</h1>
      <p className="bp-page__lead">{t('explorePage.lead')}</p>

      <div className="bp-seg bp-seg--full" role="tablist" aria-label={t('explorePage.title')}>
        <button role="tab" className={`bp-seg__btn ${tab === 'places' ? 'is-on' : ''}`} aria-selected={tab === 'places'}
          onClick={() => setTab('places')}>{t('explorePage.tabs.places')}</button>
        <button role="tab" className={`bp-seg__btn ${tab === 'partners' ? 'is-on' : ''}`} aria-selected={tab === 'partners'}
          onClick={() => setTab('partners')}>{t('explorePage.tabs.partners')}</button>
      </div>

      {tab === 'places' ? <PlacesTab /> : <PartnersTab />}
    </section>
  );
}

/* ── Places tab ─────────────────────────────────────────────────────────────── */
function PlacesTab() {
  const { t } = useTranslation();
  const { isAuthenticated, openAuth } = useAuth();
  const { places, loading } = usePlaces();
  const { trips } = useTripsList();
  const [tripId, setTripId] = useState('');
  const [category, setCategory] = useState<PlaceCategory | 'ALL'>('ALL');
  const [city, setCity] = useState('');
  const [query, setQuery] = useState('');
  const [view, setView] = useState<PlaceView>(mapsEnabled() ? 'maps' : 'picks');
  const [addPlace, setAddPlace] = useState<Place | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => { if (trips === null) void tripsActions.load(); }, [trips]);

  const myTrips: TripLite[] = useMemo(
    () => (trips ?? []).filter((tr) => tr.status === 'ACTIVE').map((tr) => ({ id: tr.id, title: tr.title, cities: tr.cities })),
    [trips],
  );
  const trip = myTrips.find((tr) => tr.id === tripId) ?? myTrips[0];
  const tripCities = useMemo(() => {
    const seen: string[] = [];
    for (const c of trip?.cities ?? []) if (c.name && !seen.includes(c.name)) seen.push(c.name);
    return seen;
  }, [trip]);

  // Explore follows your trips: default to your first trip + its first city.
  useEffect(() => {
    if (!tripId && myTrips[0]) {
      setTripId(myTrips[0].id);
      setCity(myTrips[0].cities[0]?.name ?? '');
    }
  }, [myTrips, tripId]);

  const communityCities = useMemo(() => citiesOf(places ?? []), [places]);
  const cityOptions = useMemo(() => {
    const s = [...tripCities];
    for (const c of communityCities) if (!s.includes(c)) s.push(c);
    return s;
  }, [tripCities, communityCities]);

  const recommended = useMemo(
    () => filterPlaces(places ?? [], category, query, city ? city : 'ALL'),
    [places, category, query, city],
  );

  function changeTrip(id: string) {
    setTripId(id);
    const tr = myTrips.find((x) => x.id === id);
    setCity(tr?.cities[0]?.name ?? '');
  }
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
    <>
      <div className="bp-explore__filters">
        {myTrips.length > 0 && (
          <select className="bp-input bp-input--sm" value={trip?.id ?? ''} aria-label={t('explorePage.tripLabel')} onChange={(e) => changeTrip(e.target.value)}>
            {myTrips.map((tr) => <option key={tr.id} value={tr.id}>{tr.title}</option>)}
          </select>
        )}
        <input className="bp-input bp-input--sm" list="bp-city-opts" value={city} placeholder={t('explorePage.cityPh')}
          aria-label={t('explorePage.cityLabel')} onChange={(e) => setCity(e.target.value)} />
        <datalist id="bp-city-opts">{cityOptions.map((c) => <option key={c} value={c} />)}</datalist>
        <input className="bp-input bp-input--sm" value={query} placeholder={t('explorePage.search')} aria-label={t('explorePage.search')} onChange={(e) => setQuery(e.target.value)} />
      </div>

      <div className="bp-chips-row">
        <button className={`bp-chip bp-chip--btn ${category === 'ALL' ? 'is-on' : ''}`} aria-pressed={category === 'ALL'} onClick={() => setCategory('ALL')}>{t('explorePage.all')}</button>
        {PLACE_CATEGORIES.map((c) => (
          <button key={c} className={`bp-chip bp-chip--btn ${category === c ? 'is-on' : ''}`} aria-pressed={category === c} onClick={() => setCategory(c)}>{t(`explorePage.cat.${c}`)}</button>
        ))}
      </div>

      {/* Two boxes: Google Maps live results / traveller picks */}
      {mapsEnabled() && (
        <div className="bp-seg bp-seg--full bp-explore__views" role="tablist" aria-label={t('explorePage.title')}>
          <button role="tab" className={`bp-seg__btn ${view === 'maps' ? 'is-on' : ''}`} aria-selected={view === 'maps'} onClick={() => setView('maps')}>
            <span className="material-symbols-outlined" aria-hidden="true">travel_explore</span>{t('explorePage.fromMaps')}
          </button>
          <button role="tab" className={`bp-seg__btn ${view === 'picks' ? 'is-on' : ''}`} aria-selected={view === 'picks'} onClick={() => setView('picks')}>
            <span className="material-symbols-outlined" aria-hidden="true">recommend</span>{t('explorePage.recommended')}
          </button>
        </div>
      )}

      {toast && <div className="bp-banner bp-banner--ok" role="status">{toast}</div>}

      {/* Google Maps live results */}
      {mapsEnabled() && view === 'maps' && (
        <GoogleResults city={city} category={category} query={query}
          canAdd={myTrips.length > 0} onAdd={(g) => openAdd(toPlace(g, city))} />
      )}

      {/* Community recommendations */}
      {(!mapsEnabled() || view === 'picks') && (
        <div className="bp-explore__sec">
          <h2 className="bp-explore__sec-title">
            <span className="material-symbols-outlined" aria-hidden="true">recommend</span>
            {t('explorePage.recommended')}
          </h2>
          <p className="bp-explore__sec-sub">{t('explorePage.recommendedSub')}</p>

          {loading && places === null ? (
            <p className="bp-page__lead">…</p>
          ) : recommended.length === 0 ? (
            <div className="bp-empty bp-empty--sm">
              <span className="material-symbols-outlined bp-empty__icon" aria-hidden="true">travel_explore</span>
              <p>{mapsEnabled() ? t('explorePage.recommendedEmpty') : t('explorePage.empty')}</p>
            </div>
          ) : (
            <ul className="bp-place-grid" role="list">
              {recommended.map((p) => (
                <li key={p.id}>
                  <PlaceCard place={p} canAdd={myTrips.length > 0} onRate={(s) => rate(p, s)} onAdd={() => openAdd(p)} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {addPlace && (
        <AddToTripModal place={addPlace} trips={myTrips} defaultTripId={trip?.id} defaultCity={city}
          onClose={() => setAddPlace(null)}
          onDone={(tripTitle) => { setAddPlace(null); flash(t('explorePage.added', { trip: tripTitle })); }} />
      )}
    </>
  );
}

/* ── Live Google Maps search results ────────────────────────────────────────── */
function GoogleResults({ city, category, query, canAdd, onAdd }: {
  city: string; category: PlaceCategory | 'ALL'; query: string;
  canAdd: boolean; onAdd: (g: GmapsPlace) => void;
}) {
  const { t } = useTranslation();
  const [results, setResults] = useState<GmapsPlace[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const reqId = useRef(0);

  const text = useMemo(() => {
    const parts = [query.trim()];
    if (category !== 'ALL') parts.push(CATEGORY_QUERY[category]);
    if (city.trim()) parts.push(`في ${city.trim()}`);
    return parts.filter(Boolean).join(' ').trim();
  }, [query, category, city]);

  const hasCriteria = Boolean(query.trim() || city.trim() || category !== 'ALL');

  useEffect(() => {
    window.clearTimeout(timer.current);
    if (!hasCriteria) { setResults([]); setErr(false); return; }
    const id = ++reqId.current;
    timer.current = window.setTimeout(async () => {
      try {
        setBusy(true); setErr(false);
        const found = await searchPlacesByText(text, { maxResults: 12 });
        if (id === reqId.current) setResults(found);
      } catch {
        if (id === reqId.current) { setErr(true); setResults([]); }
      } finally {
        if (id === reqId.current) setBusy(false);
      }
    }, 450);
    return () => window.clearTimeout(timer.current);
  }, [text, hasCriteria]);

  return (
    <div className="bp-explore__sec">
      <h2 className="bp-explore__sec-title">
        <span className="material-symbols-outlined" aria-hidden="true">travel_explore</span>
        {t('explorePage.fromMaps')}
      </h2>
      <p className="bp-explore__sec-sub">{t('explorePage.fromMapsSub')}</p>

      {!hasCriteria ? (
        <div className="bp-empty bp-empty--sm"><p>{t('explorePage.mapsHint')}</p></div>
      ) : busy ? (
        <p className="bp-page__lead">{t('explorePage.searching')}</p>
      ) : err ? (
        <div className="bp-empty bp-empty--sm"><p>{t('explorePage.mapsErr')}</p></div>
      ) : results.length === 0 ? (
        <div className="bp-empty bp-empty--sm"><p>{t('explorePage.recommendedEmpty')}</p></div>
      ) : (
        <ul className="bp-place-grid" role="list">
          {results.map((g) => (
            <li key={g.id}>
              <GooglePlaceCard g={g} canAdd={canAdd} onAdd={() => onAdd(g)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function GooglePlaceCard({ g, canAdd, onAdd }: { g: GmapsPlace; canAdd: boolean; onAdd: () => void }) {
  const { t } = useTranslation();
  const cat = categoryFromTypes(g.types);
  return (
    <article className="bp-place-card">
      <div className="bp-place-card__photo">
        {g.photoUrl ? <img src={g.photoUrl} alt={g.name} loading="lazy" /> : <span className="material-symbols-outlined" aria-hidden="true">image</span>}
      </div>
      <div className="bp-place-card__body">
        <div className="bp-place-card__top">
          <span className="bp-chip bp-chip--cat">{t(`explorePage.cat.${cat}`)}</span>
          {typeof g.rating === 'number' && g.rating > 0 && (
            <span className="bp-place-card__rating"><span className="material-symbols-outlined" aria-hidden="true">star</span>{g.rating.toFixed(1)} {g.ratingCount ? <span className="bp-place-card__count">({g.ratingCount})</span> : null}</span>
          )}
        </div>
        <h3 className="bp-place-card__title">{g.name}</h3>
        {g.address && <p className="bp-place-card__area">{g.address}</p>}
        <div className="bp-place-card__actions">
          {canAdd && <button className="bp-btn bp-btn--primary bp-btn--sm" onClick={onAdd}>{t('explorePage.addToTrip')}</button>}
          {g.mapsUrl && (
            <a className="bp-btn bp-btn--outline bp-btn--sm" href={g.mapsUrl} target="_blank" rel="noopener noreferrer">
              <span className="material-symbols-outlined" aria-hidden="true">map</span>{t('explorePage.onMaps')}
            </a>
          )}
        </div>
      </div>
    </article>
  );
}

/* ── Partners tab ───────────────────────────────────────────────────────────── */
function PartnersTab() {
  const { t } = useTranslation();
  const { partners, loading } = usePartners();
  const [category, setCategory] = useState<PartnerCategory | 'ALL'>('ALL');
  const shown = useMemo(() => filterPartners(partners ?? [], category), [partners, category]);

  return (
    <>
      <p className="bp-explore__hint">{t('partners.lead')}</p>
      <div className="bp-chips-row">
        <button className={`bp-chip bp-chip--btn ${category === 'ALL' ? 'is-on' : ''}`} aria-pressed={category === 'ALL'} onClick={() => setCategory('ALL')}>{t('partners.all')}</button>
        {PARTNER_CATEGORIES.map((c) => (
          <button key={c} className={`bp-chip bp-chip--btn ${category === c ? 'is-on' : ''}`} aria-pressed={category === c} onClick={() => setCategory(c)}>{t(`partners.cat.${c}`)}</button>
        ))}
      </div>

      {loading && partners === null ? (
        <p className="bp-page__lead">…</p>
      ) : shown.length === 0 ? (
        <div className="bp-empty"><span className="material-symbols-outlined bp-empty__icon" aria-hidden="true">handshake</span><p>{t('partners.empty')}</p></div>
      ) : (
        <ul className="bp-partner-grid" role="list">
          {shown.map((p) => <li key={p.id}><PartnerCard partner={p} /></li>)}
        </ul>
      )}
    </>
  );
}

function PartnerCard({ partner }: { partner: Partner }) {
  const { t } = useTranslation();
  const coverage = partner.coverage === 'ALL' ? t('partners.nationwide') : partner.coverage;
  return (
    <article className="bp-partner-card">
      <span className={`bp-partner-card__logo bp-partner-card__logo--${partner.category.toLowerCase()}`} aria-hidden="true">
        <span className="material-symbols-outlined">{PARTNER_ICON[partner.category]}</span>
      </span>
      <div className="bp-partner-card__body">
        <div className="bp-partner-card__top">
          <span className="bp-chip bp-chip--cat">{t(`partners.cat.${partner.category}`)}</span>
          {partner.featured && <span className="bp-badge bp-badge--gold">{t('partners.featured')}</span>}
        </div>
        <h3 className="bp-partner-card__title">{partner.name}</h3>
        <p className="bp-partner-card__meta">
          <span className="material-symbols-outlined" aria-hidden="true">location_on</span>{coverage}
        </p>
        <p className="bp-partner-card__tag">{partner.tagline}</p>
      </div>
    </article>
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
      <div className="bp-place-card__photo">
        {place.photoUrl ? <img src={place.photoUrl} alt={place.name} loading="lazy" /> : <span className="material-symbols-outlined" aria-hidden="true">image</span>}
      </div>
      <div className="bp-place-card__body">
        <div className="bp-place-card__top">
          <span className="bp-chip bp-chip--cat">{t(`explorePage.cat.${place.category}`)}</span>
          {place.rating > 0 && (
            <span className="bp-place-card__rating"><span className="material-symbols-outlined" aria-hidden="true">star</span>{place.rating.toFixed(1)} <span className="bp-place-card__count">({place.ratingCount})</span></span>
          )}
        </div>
        <h3 className="bp-place-card__title">{place.name}</h3>
        <p className="bp-place-card__area">{[place.area, place.city].filter(Boolean).join(' · ')}</p>
        {typeof place.adds === 'number' && place.adds > 0 && (
          <p className="bp-place-card__adds"><span className="material-symbols-outlined" aria-hidden="true">group</span>{t('explorePage.addedByN', { n: place.adds })}</p>
        )}
        {place.comment && (
          <p className="bp-place-card__comment">“{place.comment}”{place.commentBy ? <span className="bp-place-card__comment-by"> — {place.commentBy}</span> : null}</p>
        )}
        <Stars value={place.myRating ?? 0} onRate={onRate} />
        {canAdd && <button className="bp-btn bp-btn--outline bp-btn--sm" onClick={onAdd}>{t('explorePage.addToTrip')}</button>}
      </div>
    </article>
  );
}

function AddToTripModal({ place, trips, defaultTripId, defaultCity, onClose, onDone }: {
  place: Place; trips: TripLite[]; defaultTripId?: string; defaultCity?: string;
  onClose: () => void; onDone: (tripTitle: string) => void;
}) {
  const { t } = useTranslation();
  const locale = useUIStore((s) => s.locale);
  const [tripId, setTripId] = useState(defaultTripId || trips[0]?.id || '');
  const trip = trips.find((tr) => tr.id === tripId) ?? trips[0];
  const [city, setCity] = useState(defaultCity || trip?.cities[0]?.name || place.city || '');
  const [board, setBoard] = useState<Board | null>(null);
  const [dayId, setDayId] = useState('');
  const [time, setTime] = useState('');
  const [busy, setBusy] = useState(false);

  // Load the trip's board so we can offer its days.
  useEffect(() => {
    let alive = true;
    setBoard(null);
    if (!tripId) return;
    const seed = (trip?.cities ?? []).map((c) => ({ name: c.name }));
    getItineraryBoard(tripId, seed).then((b) => { if (alive) setBoard(b); }).catch(() => { /* best-effort */ });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId]);

  const cityDays = useMemo(() => board?.cities.find((c) => c.name === city)?.days ?? [], [board, city]);
  useEffect(() => { setDayId(''); }, [city, tripId]);

  function dayLabel(d: { title: string; date?: string }, i: number): string {
    return d.title?.trim()
      || (d.date ? formatDate(d.date, locale, { weekday: 'short', day: 'numeric', month: 'short' }) : t('itinerary.dayN', { n: i + 1 }));
  }

  async function confirm() {
    if (!tripId) return;
    setBusy(true);
    try {
      const targetCity = city || place.city || trip?.cities[0]?.name || '';
      const seed = (trip?.cities ?? []).map((c) => ({ name: c.name }));
      try {
        await addPlaceToItinerary(tripId, seed, targetCity, {
          title: place.name, note: place.area || undefined, kind: KIND[place.category],
          photoUrl: place.photoUrl, mapsUrl: place.mapsUrl, time: time || undefined, period: periodFromTime(time), placeId: place.id,
        }, dayId || undefined);
      } catch { /* itinerary add is best-effort */ }
      await placesActions.record({ ...place, city: targetCity });
      onDone(trip?.title ?? '');
    } finally { setBusy(false); }
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
        <div className="bp-add-grid">
          <div className="bp-field">
            <label htmlFor="bp-add-day">{t('explorePage.chooseDay')}</label>
            <select id="bp-add-day" className="bp-input" value={dayId} onChange={(e) => setDayId(e.target.value)}>
              <option value="">{t('explorePage.dayAuto')}</option>
              {cityDays.map((d, i) => <option key={d.id} value={d.id}>{dayLabel(d, i)}</option>)}
            </select>
          </div>
          <div className="bp-field">
            <label htmlFor="bp-add-time">{t('explorePage.chooseTime')}</label>
            <input id="bp-add-time" className="bp-input" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
        </div>
        {time && <p className="bp-explore__sec-sub">{formatTime12(time, locale)} · {t(`itinerary.period.${periodFromTime(time)}`)}</p>}
        <div className="bp-row-between">
          <button className="bp-btn bp-btn--primary" disabled={busy} onClick={confirm}>{t('explorePage.confirmAdd')}</button>
          <button className="bp-btn bp-btn--outline" onClick={onClose}>{t('trips.close')}</button>
        </div>
      </div>
    </div>
  );
}
