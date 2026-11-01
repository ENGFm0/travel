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
  categoryFromTypes, filterPlaces,
  type Place, type PlaceCategory,
} from './placesModel';
import { placesActions, usePlaces } from './placesStore';
import {
  filterPartners, PARTNER_ICON, type Partner,
} from '@/features/partners/partnersModel';
import { partnersActions, usePartners } from '@/features/partners/partnersStore';

type Tab = 'places' | 'partners';
interface TripLite { id: string; title: string; cities: { name: string }[] }

/** Place-type options for the Explore search dropdown. `q` is the Google Maps
 *  search term; `cat` maps to a community-picks category for filtering. */
const FIND_OPTIONS: { key: string; q: string; en: string; cat: PlaceCategory | 'ALL' }[] = [
  { key: 'all', q: '', en: '', cat: 'ALL' },
  { key: 'restaurants', q: 'مطاعم', en: 'restaurants', cat: 'RESTAURANTS' },
  { key: 'cafes', q: 'مقاهي', en: 'cafes coffee', cat: 'RESTAURANTS' },
  { key: 'museums', q: 'متاحف', en: 'museums', cat: 'LANDMARKS' },
  { key: 'landmarks', q: 'معالم سياحية', en: 'tourist attractions', cat: 'LANDMARKS' },
  { key: 'parks', q: 'حدائق ومتنزهات', en: 'parks', cat: 'ACTIVITIES' },
  { key: 'activities', q: 'أنشطة ترفيهية', en: 'things to do', cat: 'ACTIVITIES' },
  { key: 'shopping', q: 'مولات وتسوق', en: 'shopping malls', cat: 'SHOPPING' },
];
const PAGE_SIZE = 12;
const PER_QUERY = 20; // Google's maximum per text search

/** The text searches to run for a city + filter. "All" fans out across every
 *  category (so the city's restaurants, sights, parks … all come back, not
 *  just the city itself); a single category runs Arabic + English variants.
 *  Results are merged and de-duplicated by place id. */
function queriesFor(city: string, findKey: string, free: string): string[] {
  const c = city.trim();
  if (free.trim()) return [c ? `${free.trim()} في ${c}` : free.trim()];
  if (!c) return [];
  const opts = findKey === 'all' ? FIND_OPTIONS.filter((o) => o.key !== 'all') : FIND_OPTIONS.filter((o) => o.key === findKey);
  const out: string[] = [];
  for (const o of opts) {
    out.push(`${o.q} في ${c}`);
    if (findKey !== 'all') { out.push(`أفضل ${o.q} ${c}`); out.push(`${o.en} in ${c}`); }
  }
  return out;
}

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
  // '' = free search (no trip): any city in the world, not tied to a plan.
  const [tripId, setTripId] = useState<string>('');
  const [picked, setPicked] = useState(false); // user chose explicitly (don't auto-default again)
  const [city, setCity] = useState('');
  const [find, setFind] = useState('all');
  const [free, setFree] = useState(''); // free-text search ("برج إيفل", "سوق")
  const sel = FIND_OPTIONS.find((o) => o.key === find) ?? FIND_OPTIONS[0];
  const [addPlace, setAddPlace] = useState<Place | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => { if (trips === null) void tripsActions.load(); }, [trips]);

  const myTrips: TripLite[] = useMemo(
    () => (trips ?? []).filter((tr) => tr.status === 'ACTIVE').map((tr) => ({ id: tr.id, title: tr.title, cities: tr.cities })),
    [trips],
  );
  const trip = tripId ? myTrips.find((tr) => tr.id === tripId) : undefined;

  // Explore follows your trips by default: first trip + its first city — but
  // only until you pick something yourself (a trip, "no trip", or a city).
  useEffect(() => {
    if (!picked && !tripId && myTrips[0]) {
      setTripId(myTrips[0].id);
      setCity(myTrips[0].cities[0]?.name ?? '');
    }
  }, [myTrips, tripId, picked]);

  const recommended = useMemo(
    () => filterPlaces(places ?? [], sel.cat, '', city ? city : 'ALL'),
    [places, sel.cat, city],
  );

  function changeTrip(id: string) {
    setPicked(true);
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
      {myTrips.length > 0 && (
        <label className="bp-field bp-explore__trip">
          <span className="bp-field__label">{t('explorePage.tripLabel')}</span>
          <select className="bp-input bp-input--sm" value={trip?.id ?? ''} aria-label={t('explorePage.tripLabel')} onChange={(e) => changeTrip(e.target.value)}>
            <option value="">{t('explorePage.noTrip')}</option>
            {myTrips.map((tr) => <option key={tr.id} value={tr.id}>{tr.title}</option>)}
          </select>
        </label>
      )}
      {trip && trip.cities.length > 0 && (
        <div className="bp-chips-row">
          {Array.from(new Set(trip.cities.map((c) => c.name).filter(Boolean))).map((c) => (
            <button key={c} type="button" className={`bp-chip bp-chip--btn ${city === c ? 'is-on' : ''}`} aria-pressed={city === c} onClick={() => { setPicked(true); setCity(c); }}>{c}</button>
          ))}
        </div>
      )}
      <div className="bp-explore__filters">
        <div className="bp-clearable">
          <input className="bp-input bp-input--sm" type="search" value={city} placeholder={t('explorePage.cityPh')}
            aria-label={t('explorePage.cityLabel')} onChange={(e) => { setPicked(true); setCity(e.target.value); }} />
          {city && (
            <button type="button" className="bp-clearable__x" aria-label={t('explorePage.clearCity')} onClick={() => { setPicked(true); setCity(''); }}>
              <span className="material-symbols-outlined" aria-hidden="true">close</span>
            </button>
          )}
        </div>
        <select className="bp-input bp-input--sm" value={find} aria-label={t('explorePage.findLabel')} onChange={(e) => setFind(e.target.value)}>
          {FIND_OPTIONS.map((o) => <option key={o.key} value={o.key}>{t(`explorePage.find.${o.key}`)}</option>)}
        </select>
      </div>
      <div className="bp-explore__filters">
        <input className="bp-input bp-input--sm" type="search" value={free} placeholder={t('explorePage.freePh')}
          aria-label={t('explorePage.freeLabel')} onChange={(e) => setFree(e.target.value)} />
      </div>
      <p className="bp-explore__hint">{t('explorePage.cityHint')}</p>

      {toast && <div className="bp-banner bp-banner--ok" role="status">{toast}</div>}

      {/* Traveller picks come first so they don't get buried under a long list
          of live results. Shown only when there's content (or when Maps is off,
          as the sole source). */}
      {(!mapsEnabled() || recommended.length > 0) && (
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
              <p>{t('explorePage.empty')}</p>
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

      {/* Live Google Maps results (real places, photos, ratings) */}
      {mapsEnabled() && (
        <GoogleResults city={city} findKey={find} free={free}
          canAdd={myTrips.length > 0} onAdd={(g) => openAdd(toPlace(g, city))} />
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
function GoogleResults({ city, findKey, free, canAdd, onAdd }: {
  city: string; findKey: string; free: string;
  canAdd: boolean; onAdd: (g: GmapsPlace) => void;
}) {
  const { t } = useTranslation();
  const [results, setResults] = useState<GmapsPlace[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  const [page, setPage] = useState(1);
  const timer = useRef<number | undefined>(undefined);
  const reqId = useRef(0);
  const secRef = useRef<HTMLDivElement>(null);

  const queries = useMemo(() => queriesFor(city, findKey, free), [city, findKey, free]);
  const key = queries.join('|');
  const hasCriteria = queries.length > 0;

  useEffect(() => {
    window.clearTimeout(timer.current);
    setPage(1);
    if (!hasCriteria) { setResults([]); setErr(false); return; }
    const id = ++reqId.current;
    timer.current = window.setTimeout(async () => {
      try {
        setBusy(true); setErr(false);
        // Fan out, merge, de-duplicate by place id; best-known places first.
        const batches = await Promise.all(queries.map((q) => searchPlacesByText(q, { maxResults: PER_QUERY }).catch(() => [] as GmapsPlace[])));
        if (id !== reqId.current) return;
        const seen = new Set<string>();
        const merged: GmapsPlace[] = [];
        for (const b of batches) for (const g of b) { if (!seen.has(g.id)) { seen.add(g.id); merged.push(g); } }
        merged.sort((a, b) => (b.ratingCount ?? 0) - (a.ratingCount ?? 0));
        if (merged.length === 0 && batches.every((b) => b.length === 0) && queries.length > 0) {
          // Every query failed or returned nothing: a plain empty state (the
          // catch above swallowed errors) — try one more time without the fan-out.
          const single = await searchPlacesByText(queries[0], { maxResults: PER_QUERY });
          if (id === reqId.current) setResults(single);
        } else {
          setResults(merged);
        }
      } catch {
        if (id === reqId.current) { setErr(true); setResults([]); }
      } finally {
        if (id === reqId.current) setBusy(false);
      }
    }, 450);
    return () => window.clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, hasCriteria]);

  const pages = Math.max(1, Math.ceil(results.length / PAGE_SIZE));
  const shown = results.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  function goto(p: number) {
    setPage(Math.min(pages, Math.max(1, p)));
    secRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  return (
    <div className="bp-explore__sec" ref={secRef}>
      <h2 className="bp-explore__sec-title">
        <span className="material-symbols-outlined" aria-hidden="true">travel_explore</span>
        {t('explorePage.fromMaps')}
        {results.length > 0 && !busy && <span className="bp-explore__count">{t('explorePage.resultsCount', { count: results.length })}</span>}
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
        <>
          <ul className="bp-place-grid" role="list">
            {shown.map((g) => (
              <li key={g.id}>
                <GooglePlaceCard g={g} canAdd={canAdd} onAdd={() => onAdd(g)} />
              </li>
            ))}
          </ul>
          {pages > 1 && <Pager page={page} pages={pages} onGoto={goto} />}
        </>
      )}
    </div>
  );
}

/** Previous / page numbers / next. */
function Pager({ page, pages, onGoto }: { page: number; pages: number; onGoto: (p: number) => void }) {
  const { t } = useTranslation();
  const nums = Array.from({ length: pages }, (_, i) => i + 1).filter((n) => n === 1 || n === pages || Math.abs(n - page) <= 1);
  return (
    <nav className="bp-pager" aria-label={t('explorePage.pager')}>
      <button type="button" className="bp-btn bp-btn--outline bp-btn--sm" disabled={page <= 1} onClick={() => onGoto(page - 1)}>{t('explorePage.prev')}</button>
      <ol className="bp-pager__nums">
        {nums.map((n, i) => (
          <li key={n}>
            {i > 0 && nums[i - 1] !== n - 1 && <span className="bp-pager__gap">…</span>}
            <button type="button" className={`bp-pager__n ${n === page ? 'is-on' : ''}`} aria-current={n === page ? 'page' : undefined} onClick={() => onGoto(n)}>{n}</button>
          </li>
        ))}
      </ol>
      <button type="button" className="bp-btn bp-btn--outline bp-btn--sm" disabled={page >= pages} onClick={() => onGoto(page + 1)}>{t('explorePage.next')}</button>
    </nav>
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
  const shown = useMemo(() => filterPartners(partners ?? [], 'ALL'), [partners]);

  return (
    <>
      <p className="bp-explore__hint">{t('partners.lead')}</p>

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
      {partner.logoUrl ? (
        <img className="bp-partner-card__logo bp-partner-card__logo--img" src={partner.logoUrl} alt={partner.name} loading="lazy" />
      ) : (
        <span className={`bp-partner-card__logo bp-partner-card__logo--${partner.category.toLowerCase()}`} aria-hidden="true">
          <span className="material-symbols-outlined">{PARTNER_ICON[partner.category]}</span>
        </span>
      )}
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
        {(partner.url || partner.whatsapp) && (
          <div className="bp-partner-card__actions">
            {partner.url && (
              <a className="bp-partner-card__link" href={partner.url} target="_blank" rel="noopener noreferrer">
                <span className="material-symbols-outlined" aria-hidden="true">open_in_new</span>{t('partners.visit')}
              </a>
            )}
            {partner.whatsapp && (
              <a className="bp-partner-card__link bp-partner-card__link--wa" href={`https://wa.me/${partner.whatsapp}`} target="_blank" rel="noopener noreferrer">
                <span className="material-symbols-outlined" aria-hidden="true">chat</span>{t('partners.whatsapp')}
              </a>
            )}
          </div>
        )}
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
              {/* A place found in a city outside the trip: add it as a new stop. */}
              {place.city && !trip!.cities.some((c) => c.name === place.city) && (
                <option value={place.city}>{t('explorePage.newCityOpt', { city: place.city })}</option>
              )}
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
