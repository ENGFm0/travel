import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { formatDate } from '@boardingpass/core';
import { useUIStore } from '@/app/store/uiStore';
import { FlightLookup } from '@/features/flights/FlightLookup';
import {
  ACTIVITY_KINDS, TRAVEL_MODES, TRIP_KINDS, formatTime12, periodFromTime,
  type Activity, type ActivityKind, type CitySeed, type CityStop, type Day, type FlightLeg, type TravelMode, type TripKind,
} from './itineraryService';
import { itineraryActions, useItinerary } from './itineraryStore';
import { estimateWeather, type Clothing } from './weather';
import { PlaceSearch, type PickedPlace } from './PlaceSearch';
import { mapsEnabled } from '@/shared/googleMaps';
import { placesActions } from '@/features/places/placesStore';
import type { Place, PlaceCategory } from '@/features/places/placesModel';

/** Google Maps search deep-link (no API key; opens the Maps web app). */
function mapsSearch(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

/** Booking.com search deep-link for a city, with check-in/out when known. */
function bookingSearch(city: string, checkin?: string, checkout?: string): string {
  const p = new URLSearchParams({ ss: city });
  if (checkin) p.set('checkin', checkin);
  if (checkout) p.set('checkout', checkout);
  return `https://www.booking.com/searchresults.html?${p.toString()}`;
}
type CitySub = 'days' | 'flight' | 'stay' | 'weather';

/** Icon per travel mode (also used for the "flight" sub-tab). */
const MODE_ICON: Record<TravelMode, string> = { PLANE: 'flight', CAR: 'directions_car', CRUISE: 'directions_boat' };
const LEG_ICON: Record<TravelMode, { go: string; back: string }> = {
  PLANE: { go: 'flight_takeoff', back: 'flight_land' },
  CAR: { go: 'directions_car', back: 'directions_car' },
  CRUISE: { go: 'directions_boat', back: 'directions_boat' },
};

/** Inclusive list of ISO dates between from..to (capped for safety). */
function datesBetween(from?: string, to?: string): string[] {
  if (!from) return [];
  const start = new Date(from);
  const end = to ? new Date(to) : start;
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return [from];
  const out: string[] = [];
  const d = new Date(start);
  while (d <= end && out.length < 60) { out.push(d.toISOString().slice(0, 10)); d.setDate(d.getDate() + 1); }
  return out;
}

export function ItineraryTab({ tripId, seed, canEdit, tripFrom, tripTo }: { tripId: string; seed: CitySeed[]; canEdit: boolean; tripFrom?: string; tripTo?: string }) {
  const { t } = useTranslation();
  const { board, loading } = useItinerary();
  const [active, setActive] = useState(0);
  const [newCity, setNewCity] = useState('');
  const [newFrom, setNewFrom] = useState('');
  const [newTo, setNewTo] = useState('');
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => {
    void itineraryActions.load(tripId, seed);
    return () => itineraryActions.reset();
    // seed is derived from the (stable) trip; tripId is the real dependency
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId]);

  const cities = board?.cities ?? [];
  const activeIdx = Math.min(active, Math.max(0, cities.length - 1));
  const city = cities[activeIdx];
  const tripStart = useMemo(() => seed.find((s) => s.dateFrom)?.dateFrom, [seed]);

  async function addCity() {
    const name = newCity.trim();
    if (!name) return;
    await itineraryActions.addCity(tripId, name, { dateFrom: newFrom || undefined, dateTo: newTo || undefined });
    setNewCity(''); setNewFrom(''); setNewTo(''); setShowAdd(false);
  }

  if (loading && board === null) {
    return <p className="bp-page__lead">…</p>;
  }

  return (
    <div className="bp-itinerary">
      {/* Multi-city timeline */}
      <div className="bp-timeline" role="tablist" aria-label={t('itinerary.timeline')}>
        {cities.map((c, i) => (
          <button
            key={c.id}
            role="tab"
            aria-selected={i === activeIdx}
            className={`bp-stop ${i === activeIdx ? 'is-on' : ''}`}
            onClick={() => setActive(i)}
          >
            <span className="bp-stop__n">{i + 1}</span>
            <span className="bp-stop__name">{c.name}</span>
            {c.dateFrom && <span className="bp-stop__date">{formatDate(c.dateFrom, useUIStore.getState().locale, { month: 'short', day: 'numeric' })}</span>}
          </button>
        ))}
        {canEdit && (
          <button className="bp-stop bp-stop--add" onClick={() => setShowAdd((v) => !v)} aria-expanded={showAdd}>
            <span className="material-symbols-outlined" aria-hidden="true">add</span>
            <span className="bp-stop__name">{t('itinerary.addCity')}</span>
          </button>
        )}
      </div>

      {canEdit && showAdd && (
        <div className="bp-addcity">
          <div className="bp-addcity__row">
            <label className="bp-field bp-addcity__name">
              <span className="bp-field__label">{t('itinerary.cityName')}</span>
              <input className="bp-input" value={newCity} placeholder={t('itinerary.addCityPh')} aria-label={t('itinerary.addCity')}
                onChange={(e) => setNewCity(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), void addCity())} autoFocus />
            </label>
            <label className="bp-field">
              <span className="bp-field__label">{t('itinerary.from')}</span>
              <input className="bp-input" type="date" value={newFrom} onChange={(e) => setNewFrom(e.target.value)} />
            </label>
            <label className="bp-field">
              <span className="bp-field__label">{t('itinerary.to')}</span>
              <input className="bp-input" type="date" value={newTo} onChange={(e) => setNewTo(e.target.value)} />
            </label>
          </div>
          <div className="bp-row-between">
            <button className="bp-btn bp-btn--primary bp-btn--sm" onClick={addCity}>{t('itinerary.addCity')}</button>
            <button className="bp-btn bp-btn--outline bp-btn--sm" onClick={() => setShowAdd(false)}>{t('trips.close')}</button>
          </div>
        </div>
      )}

      {cities.length === 0 ? (
        <div className="bp-empty">
          <span className="material-symbols-outlined bp-empty__icon" aria-hidden="true">map</span>
          <p>{t('itinerary.noCities')}</p>
        </div>
      ) : city ? (
        <CityPanel key={city.id} tripId={tripId} city={city} idx={activeIdx} count={cities.length} canEdit={canEdit}
          tripStart={tripStart} tripFrom={tripFrom} tripTo={tripTo}
          onMoved={(dir) => setActive(activeIdx + dir)} onDeleted={() => setActive(0)} />
      ) : null}
    </div>
  );
}

function CityPanel({ tripId, city, idx, count, canEdit, tripStart, tripFrom, tripTo, onMoved, onDeleted }: {
  tripId: string; city: CityStop; idx: number; count: number; canEdit: boolean;
  tripStart?: string; tripFrom?: string; tripTo?: string;
  onMoved: (dir: -1 | 1) => void; onDeleted: () => void;
}) {
  const { t } = useTranslation();

  const [sub, setSub] = useState<CitySub>('days');
  const TABS: { key: CitySub; icon: string }[] = [
    { key: 'days', icon: 'calendar_month' },
    { key: 'flight', icon: MODE_ICON[city.travelMode ?? 'PLANE'] },
    { key: 'stay', icon: 'hotel' },
    { key: 'weather', icon: 'partly_cloudy_day' },
  ];

  async function move(dir: -1 | 1) { await itineraryActions.moveCity(tripId, city.id, dir); onMoved(dir); }
  async function del() {
    if (!window.confirm(t('itinerary.confirmDeleteCity', { name: city.name }))) return;
    await itineraryActions.deleteCity(tripId, city.id);
    onDeleted();
  }

  return (
    <div className="bp-city-panel">
      <div className="bp-city-panel__head">
        <div className="bp-city-panel__titles">
          <h3>{city.name}</h3>
          <CityDateRange tripId={tripId} city={city} canEdit={canEdit} tripFrom={tripFrom} tripTo={tripTo} />
        </div>
        {canEdit && (
          <div className="bp-city-panel__ord">
            <button className="bp-icon-btn" aria-label={t('itinerary.moveEarlier')} disabled={idx === 0} onClick={() => move(-1)}>
              <span className="material-symbols-outlined" aria-hidden="true">chevron_right</span>
            </button>
            <button className="bp-icon-btn" aria-label={t('itinerary.moveLater')} disabled={idx === count - 1} onClick={() => move(1)}>
              <span className="material-symbols-outlined" aria-hidden="true">chevron_left</span>
            </button>
            <button className="bp-icon-btn" aria-label={t('itinerary.deleteCity')} onClick={del}>
              <span className="material-symbols-outlined" aria-hidden="true">delete</span>
            </button>
          </div>
        )}
      </div>

      {/* Sub-tabs so each area (schedule / flight / stay / weather) stands alone */}
      <div className="bp-citytabs" role="tablist" aria-label={city.name}>
        {TABS.map((tb) => (
          <button key={tb.key} role="tab" aria-selected={sub === tb.key}
            className={`bp-citytab ${sub === tb.key ? 'is-on' : ''}`} onClick={() => setSub(tb.key)}>
            <span className="material-symbols-outlined" aria-hidden="true">{tb.icon}</span>
            {t(`itinerary.tab.${tb.key}`)}
          </button>
        ))}
      </div>

      {/* A city with its own dates always uses them. Only the first stop may
          borrow the trip's overall range, so multi-city stops don't each
          duplicate the whole trip — later stops follow the dates you entered. */}
      {sub === 'days' && <DaysSection tripId={tripId} city={city} canEdit={canEdit}
        rangeFrom={city.dateFrom ?? (idx === 0 ? tripFrom : undefined)}
        rangeTo={city.dateTo ?? (idx === 0 ? tripTo : undefined)} />}
      {sub === 'flight' && <FlightSection tripId={tripId} city={city} canEdit={canEdit} />}
      {sub === 'stay' && <HotelSection tripId={tripId} city={city} canEdit={canEdit} />}
      {sub === 'weather' && <WeatherSection city={city} date={city.dateFrom ?? tripStart} />}
    </div>
  );
}

/** Combine an ISO date + HH:mm into a timestamp (ms), or null. */
function legDeparture(leg?: FlightLeg, fallbackDate?: string): number | null {
  const date = leg?.date || fallbackDate;
  if (!date) return null;
  const time = leg?.time || '00:00';
  const ms = new Date(`${date}T${time}`).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/** Live countdown to the departure. */
function Countdown({ target }: { target: number }) {
  const { t } = useTranslation();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  const diff = target - now;
  if (diff <= 0) {
    return <div className="bp-countdown bp-countdown--past"><span className="material-symbols-outlined" aria-hidden="true">flight_takeoff</span>{t('itinerary.departed')}</div>;
  }
  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor((diff % 86_400_000) / 3_600_000);
  const mins = Math.floor((diff % 3_600_000) / 60_000);
  return (
    <div className="bp-countdown" role="status">
      <span className="material-symbols-outlined" aria-hidden="true">timer</span>
      <span className="bp-countdown__label">{t('itinerary.countdown')}</span>
      <span className="bp-countdown__parts">
        <b>{days}</b> {t('itinerary.days')} · <b>{hours}</b> {t('itinerary.hours')} · <b>{mins}</b> {t('itinerary.mins')}
      </span>
    </div>
  );
}

export function LegForm({ title, icon, leg, onSave, canEdit, mode }: {
  title: string; icon: string; leg: FlightLeg | undefined; onSave: (l: FlightLeg) => void; canEdit: boolean; mode: TravelMode;
}) {
  const { t } = useTranslation();
  const locale = useUIStore((s) => s.locale);
  const [l, setL] = useState<FlightLeg>(leg ?? {});
  useEffect(() => setL(leg ?? {}), [leg]);
  const set = (k: keyof FlightLeg, v: string) => setL((p) => ({ ...p, [k]: v || undefined }));
  const commit = () => onSave(l);
  const carrierLabel = mode === 'CRUISE' ? t('itinerary.cruiseLine') : t('itinerary.airline');
  const noLabel = mode === 'CRUISE' ? t('itinerary.shipName') : t('itinerary.flightNo');
  const showCarrier = mode !== 'CAR';

  if (!canEdit) {
    const has = leg && (leg.airline || leg.no || leg.from || leg.to || leg.date);
    return (
      <div className="bp-leg">
        <div className="bp-leg__head"><span className="material-symbols-outlined" aria-hidden="true">{icon}</span>{title}</div>
        {has ? (
          <p className="bp-leg__ro">{[showCarrier ? leg?.airline : '', showCarrier ? leg?.no : '', leg?.from && leg?.to ? `${leg.from}→${leg.to}` : '', [leg?.date, formatTime12(leg?.time, locale)].filter(Boolean).join(' ')].filter(Boolean).join(' · ')}</p>
        ) : <p className="bp-itin-sec__val">—</p>}
      </div>
    );
  }
  return (
    <div className="bp-leg">
      <div className="bp-leg__head"><span className="material-symbols-outlined" aria-hidden="true">{icon}</span>{title}</div>
      {mode === 'PLANE' && (
        <FlightLookup onFilled={(info) => {
          const dep = info.departure.time;
          const filled: FlightLeg = {
            ...l, airline: info.airline, no: info.code, from: info.departure.iata, to: info.arrival.iata,
            date: dep?.slice(0, 10), time: dep?.slice(11, 16),
          };
          setL(filled); onSave(filled);
        }} />
      )}
      <div className="bp-leg__grid">
        {showCarrier && (
          <label className="bp-field"><span className="bp-field__label">{carrierLabel}</span>
            <input className="bp-input" value={l.airline ?? ''} onChange={(e) => set('airline', e.target.value)} onBlur={commit} /></label>
        )}
        {showCarrier && (
          <label className="bp-field"><span className="bp-field__label">{noLabel}</span>
            <input className="bp-input" value={l.no ?? ''} dir={mode === 'PLANE' ? 'ltr' : undefined} onChange={(e) => set('no', e.target.value)} onBlur={commit} /></label>
        )}
        <label className="bp-field"><span className="bp-field__label">{t('itinerary.from')}</span>
          <input className="bp-input" value={l.from ?? ''} onChange={(e) => set('from', e.target.value)} onBlur={commit} /></label>
        <label className="bp-field"><span className="bp-field__label">{t('itinerary.to')}</span>
          <input className="bp-input" value={l.to ?? ''} onChange={(e) => set('to', e.target.value)} onBlur={commit} /></label>
        <label className="bp-field"><span className="bp-field__label">{t('itinerary.date')}</span>
          <input className="bp-input" type="date" value={l.date ?? ''} onChange={(e) => set('date', e.target.value)} onBlur={commit} /></label>
        <label className="bp-field"><span className="bp-field__label">{t('itinerary.time')}</span>
          <input className="bp-input" type="time" value={l.time ?? ''} onChange={(e) => set('time', e.target.value)} onBlur={commit} /></label>
      </div>
    </div>
  );
}

/** Find the day whose date matches a leg's date; fall back to the nearest
 *  (before-all → first, after-all → last) so a flight always lands sensibly. */
function dayForDate(city: CityStop, date?: string): Day | undefined {
  if (city.days.length === 0) return undefined;
  const dated = city.days.filter((d) => d.date) as (Day & { date: string })[];
  if (!date || dated.length === 0) return city.days[0];
  const exact = dated.find((d) => d.date === date);
  if (exact) return exact;
  if (date < dated[0].date) return dated[0];
  const last = dated[dated.length - 1];
  if (date > last.date) return last;
  return dated.find((d) => d.date >= date) ?? city.days[0];
}

/** ── Travel section: mode (plane/car/cruise) + kind (one-way/round/multi) ── */
function FlightSection({ tripId, city, canEdit }: { tripId: string; city: CityStop; canEdit: boolean }) {
  const { t } = useTranslation();
  const mode: TravelMode = city.travelMode ?? 'PLANE';
  const kind: TripKind = city.tripKind ?? 'ROUND';
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const set = (patch: Parameters<typeof itineraryActions.setCityInfo>[2]) => itineraryActions.setCityInfo(tripId, city.id, patch);
  const saveOut = (l: FlightLeg) => set({ flightOut: l });
  const saveBack = (l: FlightLeg) => set({ flightReturn: l });
  const legs = city.legs ?? [];

  // Publish the travel legs into the day schedule, each on the day matching its
  // date (departure → its day, return → its day), ordered by time.
  async function saveToSchedule() {
    const toPublish: FlightLeg[] = kind === 'MULTI'
      ? legs
      : (kind === 'ONE_WAY' ? [city.flightOut ?? {}] : [city.flightOut ?? {}, city.flightReturn ?? {}]);
    let added = 0;
    for (const leg of toPublish) {
      const has = leg && (leg.airline || leg.no || leg.from || leg.to || leg.date);
      if (!has) continue;
      const day = dayForDate(city, leg.date);
      if (!day) continue;
      const title = [leg.airline, leg.no].filter(Boolean).join(' ') || t('itinerary.flightActivity');
      const route = leg.from && leg.to ? `${leg.from} → ${leg.to}` : undefined;
      const pid = `flight-${leg.no ?? ''}-${leg.date ?? ''}`;
      if (day.activities.some((a) => a.placeId === pid)) continue;
      await itineraryActions.addActivity(tripId, city.id, day.id, {
        title, note: route, time: leg.time, period: periodFromTime(leg.time), kind: 'ARRIVAL', placeId: pid,
      });
      added += 1;
    }
    setSavedMsg(added > 0 ? t('itinerary.savedToSchedule', { count: added }) : t('itinerary.nothingToSave'));
    window.setTimeout(() => setSavedMsg(null), 3000);
  }
  const depMs = legDeparture(kind === 'MULTI' ? legs[0] : city.flightOut, city.dateFrom);
  const goTitle = mode === 'PLANE' ? t('itinerary.outbound') : t('itinerary.legGo');
  const backTitle = mode === 'PLANE' ? t('itinerary.returnLeg') : t('itinerary.legBack');

  // Prefill the leg's date from the city's dates so it's based on the trip.
  const outLeg: FlightLeg = city.flightOut ?? { date: city.dateFrom };
  const backLeg: FlightLeg = city.flightReturn ?? { date: city.dateTo };

  function saveLeg(i: number, l: FlightLeg) {
    const next = [...legs];
    next[i] = l;
    set({ legs: next });
  }
  function addLeg() { set({ legs: [...legs, { date: legs.length === 0 ? city.dateFrom : undefined }] }); }
  function removeLeg(i: number) { set({ legs: legs.filter((_, idx) => idx !== i) }); }

  return (
    <section className="bp-itin-sec">
      <div className="bp-itin-sec__head">
        <span className="material-symbols-outlined bp-itin-sec__icon bp-itin-sec__icon--flight" aria-hidden="true">{MODE_ICON[mode]}</span>
        <h4>{t('itinerary.travel')}</h4>
      </div>

      {canEdit && (
        <div className="bp-modes" role="group" aria-label={t('itinerary.travelMode')}>
          {TRAVEL_MODES.map((m) => (
            <button key={m} type="button" className={`bp-mode ${mode === m ? 'is-on' : ''}`} aria-pressed={mode === m} onClick={() => set({ travelMode: m })}>
              <span className="material-symbols-outlined" aria-hidden="true">{MODE_ICON[m]}</span>
              {t(`itinerary.mode.${m}`)}
            </button>
          ))}
        </div>
      )}

      {canEdit && (
        <div className="bp-kinds" role="group" aria-label={t('itinerary.tripKindLabel')}>
          {TRIP_KINDS.map((k) => (
            <button key={k} type="button" className={`bp-chip bp-chip--btn ${kind === k ? 'is-on' : ''}`} aria-pressed={kind === k} onClick={() => set({ tripKind: k })}>
              {t(`itinerary.tripKind.${k}`)}
            </button>
          ))}
        </div>
      )}

      {depMs && <Countdown target={depMs} />}

      {kind === 'MULTI' ? (
        <>
          {legs.map((l, i) => (
            <div key={i} className="bp-leg-wrap">
              <LegForm title={t('itinerary.legN', { n: i + 1 })} icon={LEG_ICON[mode].go} leg={l} onSave={(x) => saveLeg(i, x)} canEdit={canEdit} mode={mode} />
              {canEdit && <button className="bp-icon-btn bp-icon-btn--xs bp-leg-rm" aria-label={t('itinerary.removeLeg')} onClick={() => removeLeg(i)}><span className="material-symbols-outlined" aria-hidden="true">close</span></button>}
            </div>
          ))}
          {legs.length === 0 && <p className="bp-itin-sec__note">{t('itinerary.noLegs')}</p>}
          {canEdit && <button className="bp-btn bp-btn--outline bp-btn--sm" onClick={addLeg}>+ {t('itinerary.addLeg')}</button>}
        </>
      ) : (
        <>
          <LegForm title={goTitle} icon={LEG_ICON[mode].go} leg={outLeg} onSave={saveOut} canEdit={canEdit} mode={mode} />
          {kind === 'ROUND' && <LegForm title={backTitle} icon={LEG_ICON[mode].back} leg={backLeg} onSave={saveBack} canEdit={canEdit} mode={mode} />}
        </>
      )}

      {canEdit && (
        <div className="bp-save-row">
          <button className="bp-btn bp-btn--primary bp-btn--sm" onClick={saveToSchedule}>
            <span className="material-symbols-outlined" aria-hidden="true">event_available</span>
            {t('itinerary.saveToSchedule')}
          </button>
          {savedMsg && <span className="bp-save-row__msg">{savedMsg}</span>}
        </div>
      )}
      <p className="bp-itin-sec__note">{t('itinerary.saveToScheduleHint')}</p>
    </section>
  );
}

/** ── Hotel / stay section ── */
function HotelSection({ tripId, city, canEdit }: { tripId: string; city: CityStop; canEdit: boolean }) {
  const { t } = useTranslation();
  const [name, setName] = useState(city.hotel ?? '');
  const [url, setUrl] = useState(city.hotelUrl ?? '');
  useEffect(() => { setName(city.hotel ?? ''); setUrl(city.hotelUrl ?? ''); }, [city.hotel, city.hotelUrl]);
  const saveName = () => name !== (city.hotel ?? '') && itineraryActions.setCityInfo(tripId, city.id, { hotel: name });
  const saveUrl = () => url !== (city.hotelUrl ?? '') && itineraryActions.setCityInfo(tripId, city.id, { hotelUrl: url });

  return (
    <section className="bp-itin-sec">
      <div className="bp-itin-sec__head">
        <span className="material-symbols-outlined bp-itin-sec__icon bp-itin-sec__icon--hotel" aria-hidden="true">hotel</span>
        <h4>{t('itinerary.hotel')}</h4>
      </div>
      {canEdit ? (
        <>
          <label className="bp-field">
            <span className="bp-field__label">{t('itinerary.hotelName')}</span>
            <input className="bp-input" value={name} placeholder={t('itinerary.hotelPh')} aria-label={t('itinerary.hotel')}
              onChange={(e) => setName(e.target.value)} onBlur={saveName} />
          </label>
          <label className="bp-field">
            <span className="bp-field__label">{t('itinerary.hotelLink')}</span>
            <input className="bp-input" value={url} placeholder="https://…" dir="ltr" aria-label={t('itinerary.hotelLink')}
              onChange={(e) => setUrl(e.target.value)} onBlur={saveUrl} />
          </label>
          {mapsEnabled() && (
            <PlaceSearch city={`فنادق ${city.name}`} onPick={(p) => {
              itineraryActions.setCityInfo(tripId, city.id, { hotel: p.name, hotelUrl: p.mapsUrl });
            }} />
          )}
          <p className="bp-itin-sec__note">{t('itinerary.hotelHint')}</p>
          <div className="bp-map-links">
            <a className="bp-map-chip" href={mapsSearch(`فنادق ${city.name}`)} target="_blank" rel="noopener noreferrer">
              <span className="material-symbols-outlined" aria-hidden="true">map</span>
              {t('itinerary.hotelsOnMaps')}
            </a>
            <a className="bp-map-chip" href={bookingSearch(city.name, city.dateFrom, city.dateTo)} target="_blank" rel="noopener noreferrer">
              <span className="material-symbols-outlined" aria-hidden="true">hotel</span>
              {t('itinerary.hotelsOnBooking')}
            </a>
            <Link className="bp-map-chip bp-map-chip--explore" to="/explore">
              <span className="material-symbols-outlined" aria-hidden="true">travel_explore</span>
              {t('itinerary.browseHotels')}
            </Link>
          </div>
        </>
      ) : (
        <>
          <p className="bp-itin-sec__val">{city.hotel || '—'}</p>
          {city.hotelUrl && (
            <a className="bp-inline-link" href={city.hotelUrl} target="_blank" rel="noopener noreferrer">
              <span className="material-symbols-outlined" aria-hidden="true">open_in_new</span>{t('itinerary.openLink')}
            </a>
          )}
        </>
      )}
    </section>
  );
}

/** ── Weather (seasonal estimate + clothing) ── */
const CLOTHING_ICON: Record<Clothing, string> = {
  LIGHT: 'checkroom', SHORTS: 'checkroom', HAT_SUN: 'wb_sunny', SUNSCREEN: 'wb_sunny',
  LIGHT_JACKET: 'checkroom', LAYERS: 'layers', JACKET: 'checkroom', COAT: 'checkroom',
  SCARF: 'checkroom', UMBRELLA: 'umbrella', COMFY_SHOES: 'footprint',
};
function WeatherSection({ city, date }: { city: CityStop; date?: string }) {
  const { t } = useTranslation();
  const w = useMemo(() => estimateWeather(city.name, date), [city.name, date]);
  return (
    <section className="bp-itin-sec bp-itin-sec--weather">
      <div className="bp-itin-sec__head">
        <span className="material-symbols-outlined bp-itin-sec__icon bp-itin-sec__icon--weather" aria-hidden="true">partly_cloudy_day</span>
        <h4>{t('itinerary.weatherTitle')}</h4>
      </div>
      <div className="bp-weather">
        <span className="bp-weather__emoji" aria-hidden="true">{w.emoji}</span>
        <div className="bp-weather__main">
          <span className="bp-weather__temp">{w.tempMin}°–{w.tempMax}°</span>
          <span className="bp-weather__cond">
            {t(`itinerary.season.${w.season}`)} · {t(`itinerary.cond.${w.condition}`)}
            {w.humid ? ` · ${t('itinerary.humid')}` : ''}{w.wet ? ` · ${t('itinerary.wet')}` : ''}
          </span>
        </div>
      </div>
      <div className="bp-clothing">
        <span className="bp-clothing__label">{t('itinerary.clothingTitle')}</span>
        <ul className="bp-clothing__list">
          {w.clothing.map((c) => (
            <li key={c} className="bp-clothing__chip">
              <span className="material-symbols-outlined" aria-hidden="true">{CLOTHING_ICON[c]}</span>
              {t(`itinerary.clothes.${c}`)}
            </li>
          ))}
        </ul>
      </div>
      <p className="bp-itin-sec__note">{w.known ? t('itinerary.weatherEstimate') : t('itinerary.weatherGeneric')}</p>
    </section>
  );
}

const ACTIVITY_ICON: Record<ActivityKind, string> = {
  ARRIVAL: 'flight_land', HOTEL: 'hotel', FOOD: 'restaurant', SHOPPING: 'shopping_bag',
  SIGHT: 'attractions', TRANSPORT: 'directions_car', ACTIVITY: 'hiking', OTHER: 'push_pin',
};

/** Activity kind → Explore place category (for rating → recommendations). */
const KIND_TO_CAT: Record<ActivityKind, PlaceCategory> = {
  FOOD: 'RESTAURANTS', SHOPPING: 'SHOPPING', SIGHT: 'LANDMARKS', ARRIVAL: 'LANDMARKS',
  ACTIVITY: 'ACTIVITIES', TRANSPORT: 'ACTIVITIES', HOTEL: 'ACTIVITIES', OTHER: 'ACTIVITIES',
};

/** Stable community-place id from a name + city (Arabic kept; slashes stripped). */
function placeSlug(name: string, city: string): string {
  return `${name} ${city}`.trim().replace(/[/\s]+/g, '-').slice(0, 200);
}

/** Add N days to an ISO date. */
function addDaysIso(iso: string, n: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function DaysSection({ tripId, city, canEdit, rangeFrom, rangeTo }: {
  tripId: string; city: CityStop; canEdit: boolean; rangeFrom?: string; rangeTo?: string;
}) {
  const { t } = useTranslation();
  const dates = useMemo(() => datesBetween(rangeFrom, rangeTo), [rangeFrom, rangeTo]);
  const syncedOnce = useRef(false);

  // Once per city: make the day list match the date range — add any missing
  // dates and clear leftover empty dateless days (data from earlier edits).
  useEffect(() => {
    if (!canEdit || syncedOnce.current || dates.length === 0) return;
    syncedOnce.current = true;
    const have = new Set(city.days.filter((d) => d.date).map((d) => d.date));
    const missing = dates.some((dt) => !have.has(dt));
    const emptyDateless = city.days.some((d) => !d.date && d.activities.length === 0);
    if (missing || emptyDateless) void itineraryActions.generateDays(tripId, city.id, dates);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city.id]);

  function addDay() {
    const lastDated = [...city.days].reverse().find((d) => d.date)?.date;
    const next = lastDated ? addDaysIso(lastDated, 1)
      : rangeFrom ? addDaysIso(rangeFrom, city.days.length) : undefined;
    void itineraryActions.addDay(tripId, city.id, '', next);
  }

  return (
    <div className="bp-days">
      <div className="bp-days__head">
        <h4 className="bp-days__title">
          <span className="material-symbols-outlined bp-itin-sec__icon" aria-hidden="true">calendar_month</span>
          {t('itinerary.daysTitle')}
        </h4>
      </div>

      {city.days.length === 0 ? (
        <div className="bp-empty bp-empty--sm"><p>{t('itinerary.noDays')}</p></div>
      ) : (
        <ol className="bp-day-list" role="list">
          {city.days.map((d, i) => (
            <DayCard key={d.id} tripId={tripId} cityId={city.id} cityName={city.name} day={d} n={i + 1} canEdit={canEdit} />
          ))}
        </ol>
      )}

      {canEdit && (
        <button className="bp-btn bp-btn--outline bp-btn--sm" onClick={addDay}>
          + {t('itinerary.addDay')}
        </button>
      )}
    </div>
  );
}

/** City date range shown right under the city name. Editing it sets the city's
 *  dates (so they appear on the stop chip) and regenerates its day list. */
function CityDateRange({ tripId, city, canEdit, tripFrom, tripTo }: { tripId: string; city: CityStop; canEdit: boolean; tripFrom?: string; tripTo?: string }) {
  const { t } = useTranslation();
  const locale = useUIStore((s) => s.locale);
  const [from, setFrom] = useState(city.dateFrom ?? '');
  const [to, setTo] = useState(city.dateTo ?? '');
  useEffect(() => { setFrom(city.dateFrom ?? ''); setTo(city.dateTo ?? ''); }, [city.dateFrom, city.dateTo]);

  async function save(nextFrom = from, nextTo = to) {
    if (nextFrom === (city.dateFrom ?? '') && nextTo === (city.dateTo ?? '')) return;
    await itineraryActions.setCityInfo(tripId, city.id, { dateFrom: nextFrom || undefined, dateTo: nextTo || undefined });
    if (nextFrom) await itineraryActions.generateDays(tripId, city.id, datesBetween(nextFrom, nextTo || nextFrom));
  }

  if (!canEdit) {
    if (!city.dateFrom) return null;
    const opts = { day: 'numeric', month: 'short' } as const;
    const label = city.dateTo && city.dateTo !== city.dateFrom
      ? `${formatDate(city.dateFrom, locale, opts)} – ${formatDate(city.dateTo, locale, opts)}`
      : formatDate(city.dateFrom, locale, opts);
    return <p className="bp-city-dates__ro"><span className="material-symbols-outlined" aria-hidden="true">event</span>{label}</p>;
  }

  return (
    <div className="bp-city-dates">
      <span className="material-symbols-outlined bp-city-dates__ic" aria-hidden="true">event</span>
      <input className="bp-input bp-input--sm" type="date" value={from} aria-label={t('itinerary.from')}
        min={tripFrom || undefined} max={to || tripTo || undefined}
        onChange={(e) => { setFrom(e.target.value); void save(e.target.value, to); }} />
      <span className="bp-city-dates__sep">→</span>
      <input className="bp-input bp-input--sm" type="date" value={to} aria-label={t('itinerary.to')}
        min={from || tripFrom || undefined} max={tripTo || undefined}
        onChange={(e) => { setTo(e.target.value); void save(from, e.target.value); }} />
    </div>
  );
}

function DayCard({ tripId, cityId, cityName, day, n, canEdit }: { tripId: string; cityId: string; cityName: string; day: Day; n: number; canEdit: boolean }) {
  const { t } = useTranslation();
  const locale = useUIStore((s) => s.locale);
  const [title, setTitle] = useState('');
  const [time, setTime] = useState('');
  const [note, setNote] = useState('');
  const [kind, setKind] = useState<ActivityKind>('ACTIVITY');
  const [photoUrl, setPhotoUrl] = useState<string | undefined>();
  const [mapsUrl, setMapsUrl] = useState<string | undefined>();
  const [placeId, setPlaceId] = useState<string | undefined>();
  const [open, setOpen] = useState(false);

  function reset() {
    setTitle(''); setTime(''); setNote(''); setKind('ACTIVITY');
    setPhotoUrl(undefined); setMapsUrl(undefined); setPlaceId(undefined); setOpen(false);
  }

  async function addActivity() {
    if (!title.trim()) return;
    await itineraryActions.addActivity(tripId, cityId, day.id, {
      // period is derived from the time on display — no manual selection.
      title: title.trim(), time: time || undefined, period: periodFromTime(time), note: note || undefined, kind, photoUrl, mapsUrl, placeId,
    });
    reset();
  }

  // A place chosen from Google search pre-fills the form (name/address/kind/photo)
  // and opens it, so the user can set the time / "when I'll go" before saving.
  function prefillFromPlace(p: PickedPlace) {
    setTitle(p.name);
    setNote(p.address ?? '');
    setKind(p.kind);
    setPhotoUrl(p.photoUrl);
    setMapsUrl(p.mapsUrl);
    setPlaceId(p.placeId);
    setOpen(true);
  }

  const heading = day.title?.trim()
    || (day.date ? `${t('itinerary.dayN', { n })} · ${formatDate(day.date, locale, { weekday: 'short', day: 'numeric', month: 'short' })}` : t('itinerary.dayN', { n }));

  return (
    <li className="bp-day-card">
      <div className="bp-day-card__head">
        <h4 className="bp-day-card__title">
          <span className="bp-day-card__n">{n}</span>{heading}
        </h4>
        {canEdit && (
          <button className="bp-icon-btn" aria-label={t('itinerary.deleteDay')} onClick={() => { if (window.confirm(t('itinerary.confirmDeleteDay'))) void itineraryActions.deleteDay(tripId, cityId, day.id); }}>
            <span className="material-symbols-outlined" aria-hidden="true">delete</span>
          </button>
        )}
      </div>

      {day.activities.length > 0 ? (
        <ul className="bp-timeline-list" role="list">
          {day.activities.map((a) => (
            <TlItem key={a.id} tripId={tripId} cityId={cityId} cityName={cityName} dayId={day.id} a={a} canEdit={canEdit} />
          ))}
        </ul>
      ) : (
        <p className="bp-day-card__empty">{t('itinerary.noActivities')}</p>
      )}

      {canEdit && mapsEnabled() && (
        <PlaceSearch city={cityName} onPick={prefillFromPlace} />
      )}

      {canEdit && (
        <div className="bp-browse">
          <span className="bp-browse__label">{t('itinerary.browseLabel')}</span>
          <div className="bp-browse__links">
            <a className="bp-map-chip" href={mapsSearch(`اماكن سياحية ${cityName}`)} target="_blank" rel="noopener noreferrer">
              <span className="material-symbols-outlined" aria-hidden="true">map</span>{t('itinerary.openMaps')}
            </a>
            <Link className="bp-map-chip bp-map-chip--explore" to="/explore">
              <span className="material-symbols-outlined" aria-hidden="true">travel_explore</span>{t('itinerary.openExplore')}
            </Link>
          </div>
        </div>
      )}

      {canEdit && (open ? (
        <div className="bp-act-form">
          {photoUrl && (
            <div className="bp-act-form__photo">
              <img src={photoUrl} alt={title} />
              <button type="button" className="bp-icon-btn bp-icon-btn--xs bp-act-form__photo-rm" aria-label={t('itinerary.removePhoto')} onClick={() => setPhotoUrl(undefined)}>
                <span className="material-symbols-outlined" aria-hidden="true">close</span>
              </button>
            </div>
          )}
          <div className="bp-act-form__kinds" role="group" aria-label={t('itinerary.activityKind')}>
            {ACTIVITY_KINDS.map((k) => (
              <button key={k} type="button" className={`bp-kind ${kind === k ? 'is-on' : ''}`} aria-pressed={kind === k} onClick={() => setKind(k)} title={t(`itinerary.kind.${k}`)}>
                <span className="material-symbols-outlined" aria-hidden="true">{ACTIVITY_ICON[k]}</span>
                <span className="bp-kind__label">{t(`itinerary.kind.${k}`)}</span>
              </button>
            ))}
          </div>
          <input className="bp-input" value={title} placeholder={t('itinerary.addActivityPh')} aria-label={t('itinerary.addActivity')}
            onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), void addActivity())} autoFocus />
          <div className="bp-act-form__row">
            <label className="bp-field bp-act-form__time">
              <span className="bp-field__label">{t('itinerary.whenLabel')}</span>
              <input className="bp-input" type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-label={t('itinerary.whenLabel')} />
            </label>
            <label className="bp-field" style={{ flex: 1 }}>
              <span className="bp-field__label">{t('itinerary.activityNote')}</span>
              <input className="bp-input" value={note} placeholder={t('itinerary.activityNotePh')} aria-label={t('itinerary.activityNote')}
                onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), void addActivity())} />
            </label>
          </div>
          {time && <p className="bp-act-form__hint">{formatTime12(time, locale)} · {t(`itinerary.period.${periodFromTime(time)}`)}</p>}
          <div className="bp-row-between">
            <button className="bp-btn bp-btn--primary bp-btn--sm" onClick={addActivity}>{t('itinerary.add')}</button>
            <button className="bp-btn bp-btn--outline bp-btn--sm" onClick={reset}>{t('trips.close')}</button>
          </div>
        </div>
      ) : (
        <button className="bp-add-activity" onClick={() => setOpen(true)}>
          <span className="material-symbols-outlined" aria-hidden="true">add</span>{t('itinerary.addActivity')}
        </button>
      ))}
    </li>
  );
}

/** One timeline row + an inline "rate & comment" form that promotes the place
 *  into the community recommendations (اختيارات المسافرين). */
function TlItem({ tripId, cityId, cityName, dayId, a, canEdit }: {
  tripId: string; cityId: string; cityName: string; dayId: string; a: Activity; canEdit: boolean;
}) {
  const { t } = useTranslation();
  const locale = useUIStore((s) => s.locale);
  const [open, setOpen] = useState(false);
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [failed, setFailed] = useState(false);

  const period = a.period ?? periodFromTime(a.time);
  const when = a.time
    ? `${formatTime12(a.time, locale)}${period ? ` · ${t(`itinerary.period.${period}`)}` : ''}`
    : (period ? t(`itinerary.period.${period}`) : '');

  async function save() {
    if (!stars) return;
    setBusy(true); setFailed(false);
    try {
      const place: Place = {
        id: a.placeId || placeSlug(a.title, cityName),
        name: a.title, category: KIND_TO_CAT[a.kind ?? 'OTHER'],
        area: a.note ?? '', city: cityName, rating: 0, ratingCount: 0,
        photoUrl: a.photoUrl, mapsUrl: a.mapsUrl,
      };
      const ok = await placesActions.review(place, stars, comment);
      if (ok) { setDone(true); setOpen(false); } else { setFailed(true); }
    } finally { setBusy(false); }
  }

  return (
    <li className="bp-tl-item">
      <span className="bp-tl-item__icon" aria-hidden="true">
        <span className="material-symbols-outlined">{ACTIVITY_ICON[a.kind ?? 'OTHER']}</span>
      </span>
      <div className="bp-tl-item__body">
        <div className="bp-tl-item__line">
          {when && <span className="bp-tl-item__time">{when}</span>}
          <span className="bp-tl-item__title">{a.title}</span>
        </div>
        {a.note && <p className="bp-tl-item__note">{a.note}</p>}
        {a.photoUrl && <img className="bp-tl-item__photo" src={a.photoUrl} alt={a.title} loading="lazy" />}

        {canEdit && !done && (
          <button className="bp-tl-item__rate-btn" onClick={() => setOpen((v) => !v)}>
            <span className="material-symbols-outlined" aria-hidden="true">rate_review</span>{t('itinerary.ratePlace')}
          </button>
        )}
        {done && <p className="bp-tl-item__thanks"><span className="material-symbols-outlined" aria-hidden="true">check_circle</span>{t('itinerary.rateThanks')}</p>}

        {open && (
          <div className="bp-rate-box">
            <div className="bp-stars" role="group" aria-label={t('itinerary.ratePlace')}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" className="bp-star" aria-label={t('explorePage.rateN', { n })} aria-pressed={n <= stars} onClick={() => setStars(n)}>
                  <span className="material-symbols-outlined" style={{ fontVariationSettings: n <= stars ? "'FILL' 1" : "'FILL' 0" }} aria-hidden="true">star</span>
                </button>
              ))}
            </div>
            <input className="bp-input" value={comment} placeholder={t('itinerary.commentPh')} aria-label={t('itinerary.comment')}
              onChange={(e) => setComment(e.target.value)} />
            {failed && <p className="bp-rate-box__err">{t('itinerary.rateFailed')}</p>}
            <div className="bp-row-between">
              <button className="bp-btn bp-btn--primary bp-btn--sm" disabled={busy || !stars} onClick={save}>{t('itinerary.publishReview')}</button>
              <button className="bp-btn bp-btn--outline bp-btn--sm" onClick={() => setOpen(false)}>{t('trips.close')}</button>
            </div>
          </div>
        )}
      </div>
      <a className="bp-icon-btn bp-icon-btn--xs" href={a.mapsUrl ?? mapsSearch(`${a.title} ${cityName}`)} target="_blank" rel="noopener noreferrer"
        aria-label={t('itinerary.viewOnMaps')} title={t('itinerary.viewOnMaps')}>
        <span className="material-symbols-outlined" aria-hidden="true">location_on</span>
      </a>
      {canEdit && (
        <button className="bp-icon-btn bp-icon-btn--xs" aria-label={t('itinerary.deleteActivity')} onClick={() => itineraryActions.deleteActivity(tripId, cityId, dayId, a.id)}>
          <span className="material-symbols-outlined" aria-hidden="true">close</span>
        </button>
      )}
    </li>
  );
}
