import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/features/auth/authStore';
import { useTripsList, tripsActions } from '@/features/trips/tripsStore';
import { mapsEnabled, searchPlacesByText, type GmapsPlace } from '@/shared/googleMaps';
import { addPlaceToItinerary, type ActivityKind } from '@/features/itinerary/itineraryService';
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
  const [category, setCategory] = useState<PlaceCategory | 'ALL'>('ALL');
  const [city, setCity] = useState('');
  const [query, setQuery] = useState('');
  const [addPlace, setAddPlace] = useState<Place | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => { if (trips === null) void tripsActions.load(); }, [trips]);

  const myTrips = useMemo(() => (trips ?? []).filter((tr) => tr.status === 'ACTIVE'), [trips]);
  const tripCities = useMemo(() => {
    const seen: string[] = [];
    for (const tr of myTrips) for (const c of tr.cities) if (c.name && !seen.includes(c.name)) seen.push(c.name);
    return seen;
  }, [myTrips]);

  // Default the city to the first trip city, so Google results are useful at once.
  useEffect(() => { if (!city && tripCities[0]) setCity(tripCities[0]); }, [tripCities, city]);

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
        {cityOptions.length > 0 ? (
          <input className="bp-input bp-input--sm" list="bp-city-opts" value={city} placeholder={t('explorePage.cityPh')}
            aria-label={t('explorePage.cityLabel')} onChange={(e) => setCity(e.target.value)} />
        ) : (
          <input className="bp-input bp-input--sm" value={city} placeholder={t('explorePage.cityPh')}
            aria-label={t('explorePage.cityLabel')} onChange={(e) => setCity(e.target.value)} />
        )}
        <datalist id="bp-city-opts">{cityOptions.map((c) => <option key={c} value={c} />)}</datalist>
        <input className="bp-input bp-input--sm" value={query} placeholder={t('explorePage.search')} aria-label={t('explorePage.search')} onChange={(e) => setQuery(e.target.value)} />
      </div>

      <div className="bp-chips-row">
        <button className={`bp-chip bp-chip--btn ${category === 'ALL' ? 'is-on' : ''}`} aria-pressed={category === 'ALL'} onClick={() => setCategory('ALL')}>{t('explorePage.all')}</button>
        {PLACE_CATEGORIES.map((c) => (
          <button key={c} className={`bp-chip bp-chip--btn ${category === c ? 'is-on' : ''}`} aria-pressed={category === c} onClick={() => setCategory(c)}>{t(`explorePage.cat.${c}`)}</button>
        ))}
      </div>

      {toast && <div className="bp-banner bp-banner--ok" role="status">{toast}</div>}

      {/* Live Google Maps results */}
      {mapsEnabled() && (
        <GoogleResults city={city} category={category} query={query}
          canAdd={myTrips.length > 0} onAdd={(g) => openAdd(toPlace(g, city))} />
      )}

      {/* Community recommendations — places other travellers added */}
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

      {addPlace && (
        <AddToTripModal place={addPlace} trips={myTrips}
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
  const [city, setCity] = useState(trip?.cities[0]?.name ?? place.city ?? '');
  const [busy, setBusy] = useState(false);

  async function confirm() {
    if (!tripId) return;
    setBusy(true);
    try {
      const targetCity = city || place.city || trip?.cities[0]?.name || '';
      // Real add to the trip's schedule (best-effort — recommendations still record).
      try {
        await addPlaceToItinerary(
          tripId,
          (trip?.cities ?? []).map((c) => ({ name: c.name })),
          targetCity,
          { title: place.name, note: place.area || undefined, kind: KIND[place.category], photoUrl: place.photoUrl, mapsUrl: place.mapsUrl },
        );
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
        <div className="bp-row-between">
          <button className="bp-btn bp-btn--primary" disabled={busy} onClick={confirm}>{t('explorePage.confirmAdd')}</button>
          <button className="bp-btn bp-btn--outline" onClick={onClose}>{t('trips.close')}</button>
        </div>
      </div>
    </div>
  );
}
