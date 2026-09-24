import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { formatDate } from '@boardingpass/core';
import { useUIStore } from '@/app/store/uiStore';
import { FlightLookup } from '@/features/flights/FlightLookup';
import type { CitySeed, CityStop, Day, FlightLeg } from './itineraryService';
import { itineraryActions, useItinerary } from './itineraryStore';
import { estimateWeather, type Clothing } from './weather';

/** Google Maps search deep-link (no API key; opens the Maps web app). */
function mapsSearch(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
type CitySub = 'days' | 'flight' | 'stay' | 'weather';

export function ItineraryTab({ tripId, seed, canEdit }: { tripId: string; seed: CitySeed[]; canEdit: boolean }) {
  const { t } = useTranslation();
  const { board, loading } = useItinerary();
  const [active, setActive] = useState(0);
  const [newCity, setNewCity] = useState('');

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
    await itineraryActions.addCity(tripId, name);
    setNewCity('');
    setActive(cities.length); // focus the newly added city
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
          <div className="bp-stop bp-stop--add">
            <input
              className="bp-input"
              value={newCity}
              placeholder={t('itinerary.addCityPh')}
              onChange={(e) => setNewCity(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), void addCity())}
              aria-label={t('itinerary.addCity')}
            />
            <button className="bp-icon-btn" aria-label={t('itinerary.addCity')} onClick={addCity}>
              <span className="material-symbols-outlined" aria-hidden="true">add</span>
            </button>
          </div>
        )}
      </div>

      {cities.length === 0 ? (
        <div className="bp-empty">
          <span className="material-symbols-outlined bp-empty__icon" aria-hidden="true">map</span>
          <p>{t('itinerary.noCities')}</p>
        </div>
      ) : city ? (
        <CityPanel tripId={tripId} city={city} idx={activeIdx} count={cities.length} canEdit={canEdit} tripStart={tripStart}
          onMoved={(dir) => setActive(activeIdx + dir)} onDeleted={() => setActive(0)} />
      ) : null}
    </div>
  );
}

function CityPanel({ tripId, city, idx, count, canEdit, tripStart, onMoved, onDeleted }: {
  tripId: string; city: CityStop; idx: number; count: number; canEdit: boolean; tripStart?: string;
  onMoved: (dir: -1 | 1) => void; onDeleted: () => void;
}) {
  const { t } = useTranslation();

  const [sub, setSub] = useState<CitySub>('days');
  const TABS: { key: CitySub; icon: string }[] = [
    { key: 'days', icon: 'calendar_month' },
    { key: 'flight', icon: 'flight' },
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
        <h3>{city.name}</h3>
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
      <div className="bp-subtabs" role="tablist" aria-label={city.name}>
        {TABS.map((tb) => (
          <button key={tb.key} role="tab" aria-selected={sub === tb.key}
            className={`bp-subtab ${sub === tb.key ? 'is-on' : ''}`} onClick={() => setSub(tb.key)}>
            <span className="material-symbols-outlined" aria-hidden="true">{tb.icon}</span>
            {t(`itinerary.tab.${tb.key}`)}
          </button>
        ))}
      </div>

      {sub === 'days' && <DaysSection tripId={tripId} city={city} canEdit={canEdit} />}
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

function LegForm({ title, icon, leg, onSave, canEdit }: {
  title: string; icon: string; leg: FlightLeg | undefined; onSave: (l: FlightLeg) => void; canEdit: boolean;
}) {
  const { t } = useTranslation();
  const [l, setL] = useState<FlightLeg>(leg ?? {});
  useEffect(() => setL(leg ?? {}), [leg]);
  const set = (k: keyof FlightLeg, v: string) => setL((p) => ({ ...p, [k]: v || undefined }));
  const commit = () => onSave(l);

  if (!canEdit) {
    const has = leg && (leg.airline || leg.no || leg.from || leg.to || leg.date);
    return (
      <div className="bp-leg">
        <div className="bp-leg__head"><span className="material-symbols-outlined" aria-hidden="true">{icon}</span>{title}</div>
        {has ? (
          <p className="bp-leg__ro">{[leg?.airline, leg?.no, leg?.from && leg?.to ? `${leg.from}→${leg.to}` : '', [leg?.date, leg?.time].filter(Boolean).join(' ')].filter(Boolean).join(' · ')}</p>
        ) : <p className="bp-itin-sec__val">—</p>}
      </div>
    );
  }
  return (
    <div className="bp-leg">
      <div className="bp-leg__head"><span className="material-symbols-outlined" aria-hidden="true">{icon}</span>{title}</div>
      <div className="bp-leg__grid">
        <label className="bp-field"><span className="bp-field__label">{t('itinerary.airline')}</span>
          <input className="bp-input" value={l.airline ?? ''} onChange={(e) => set('airline', e.target.value)} onBlur={commit} /></label>
        <label className="bp-field"><span className="bp-field__label">{t('itinerary.flightNo')}</span>
          <input className="bp-input" value={l.no ?? ''} placeholder="SV1020" dir="ltr" onChange={(e) => set('no', e.target.value)} onBlur={commit} /></label>
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

/** ── Flight section: outbound + return legs, lookup autofill, countdown ── */
function FlightSection({ tripId, city, canEdit }: { tripId: string; city: CityStop; canEdit: boolean }) {
  const { t } = useTranslation();
  const saveOut = (l: FlightLeg) => itineraryActions.setCityInfo(tripId, city.id, { flightOut: l });
  const saveBack = (l: FlightLeg) => itineraryActions.setCityInfo(tripId, city.id, { flightReturn: l });
  const depMs = legDeparture(city.flightOut, city.dateFrom);

  return (
    <section className="bp-itin-sec">
      <div className="bp-itin-sec__head">
        <span className="material-symbols-outlined bp-itin-sec__icon bp-itin-sec__icon--flight" aria-hidden="true">flight</span>
        <h4>{t('itinerary.flight')}</h4>
      </div>

      {depMs && <Countdown target={depMs} />}

      {canEdit && (
        <FlightLookup onFilled={(info) => {
          const dep = info.departure.time ? info.departure.time.slice(0, 16) : undefined;
          const leg: FlightLeg = {
            airline: info.airline, no: info.code, from: info.departure.iata, to: info.arrival.iata,
            date: dep?.slice(0, 10), time: dep?.slice(11, 16),
          };
          void saveOut(leg);
        }} />
      )}

      <LegForm title={t('itinerary.outbound')} icon="flight_takeoff" leg={city.flightOut} onSave={saveOut} canEdit={canEdit} />
      <LegForm title={t('itinerary.returnLeg')} icon="flight_land" leg={city.flightReturn} onSave={saveBack} canEdit={canEdit} />
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
          <p className="bp-itin-sec__note">{t('itinerary.hotelHint')}</p>
          <div className="bp-map-links">
            <a className="bp-inline-link" href={mapsSearch(`فنادق ${city.name}`)} target="_blank" rel="noopener noreferrer">
              <span className="material-symbols-outlined" aria-hidden="true">map</span>
              {t('itinerary.hotelsOnMaps')}
            </a>
            <Link className="bp-inline-link" to="/explore">
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

function DaysSection({ tripId, city, canEdit }: { tripId: string; city: CityStop; canEdit: boolean }) {
  const { t } = useTranslation();
  const [dayTitle, setDayTitle] = useState('');

  async function addDay() {
    const title = dayTitle.trim() || t('itinerary.dayN', { n: city.days.length + 1 });
    await itineraryActions.addDay(tripId, city.id, title);
    setDayTitle('');
  }

  return (
    <div className="bp-days">
      <div className="bp-days__head">
        <h4 className="bp-days__title">
          <span className="material-symbols-outlined bp-itin-sec__icon" aria-hidden="true">calendar_month</span>
          {t('itinerary.daysTitle')}
        </h4>
      </div>
      {/* Discover places to add — Google Maps (broad) + our Explore directory */}
      <div className="bp-discover">
        <span className="bp-discover__label">{t('itinerary.discover')}</span>
        <div className="bp-discover__links">
          <a className="bp-map-chip" href={mapsSearch(`مطاعم ${city.name}`)} target="_blank" rel="noopener noreferrer">
            <span className="material-symbols-outlined" aria-hidden="true">restaurant</span>{t('itinerary.mapsRestaurants')}
          </a>
          <a className="bp-map-chip" href={mapsSearch(`أنشطة سياحية ${city.name}`)} target="_blank" rel="noopener noreferrer">
            <span className="material-symbols-outlined" aria-hidden="true">hiking</span>{t('itinerary.mapsActivities')}
          </a>
          <a className="bp-map-chip" href={mapsSearch(`معالم سياحية ${city.name}`)} target="_blank" rel="noopener noreferrer">
            <span className="material-symbols-outlined" aria-hidden="true">attractions</span>{t('itinerary.mapsLandmarks')}
          </a>
          <Link className="bp-map-chip bp-map-chip--explore" to="/explore">
            <span className="material-symbols-outlined" aria-hidden="true">travel_explore</span>{t('itinerary.exploreShort')}
          </Link>
        </div>
      </div>
      {city.days.length === 0 ? (
        <div className="bp-empty bp-empty--sm">
          <p>{t('itinerary.noDays')}</p>
        </div>
      ) : (
        <ul className="bp-day-list" role="list">
          {city.days.map((d) => (
            <DayCard key={d.id} tripId={tripId} cityId={city.id} day={d} canEdit={canEdit} />
          ))}
        </ul>
      )}

      {canEdit && (
        <div className="bp-add-row">
          <input className="bp-input" value={dayTitle} placeholder={t('itinerary.addDayPh')}
            onChange={(e) => setDayTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), void addDay())} aria-label={t('itinerary.addDay')} />
          <button className="bp-btn bp-btn--outline bp-btn--sm" onClick={addDay}>+ {t('itinerary.addDay')}</button>
        </div>
      )}
    </div>
  );
}

function DayCard({ tripId, cityId, day, canEdit }: { tripId: string; cityId: string; day: Day; canEdit: boolean }) {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [time, setTime] = useState('');

  async function addActivity() {
    if (!title.trim()) return;
    await itineraryActions.addActivity(tripId, cityId, day.id, title.trim(), time || undefined);
    setTitle(''); setTime('');
  }

  return (
    <li className="bp-day-card">
      <div className="bp-day-card__head">
        <h4>{day.title}</h4>
        {canEdit && (
          <button className="bp-icon-btn" aria-label={t('itinerary.deleteDay')} onClick={() => { if (window.confirm(t('itinerary.confirmDeleteDay'))) void itineraryActions.deleteDay(tripId, cityId, day.id); }}>
            <span className="material-symbols-outlined" aria-hidden="true">delete</span>
          </button>
        )}
      </div>
      {day.activities.length > 0 && (
        <ul className="bp-activity-list" role="list">
          {day.activities.map((a) => (
            <li key={a.id} className="bp-activity">
              {a.time && <span className="bp-activity__time">{a.time}</span>}
              <span className="bp-activity__title">{a.title}</span>
              {canEdit && (
                <button className="bp-icon-btn bp-icon-btn--xs" aria-label={t('itinerary.deleteActivity')} onClick={() => itineraryActions.deleteActivity(tripId, cityId, day.id, a.id)}>
                  <span className="material-symbols-outlined" aria-hidden="true">close</span>
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canEdit && (
        <div className="bp-add-row bp-add-row--activity">
          <input className="bp-input" type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-label={t('itinerary.activityTime')} style={{ maxInlineSize: 110 }} />
          <input className="bp-input" value={title} placeholder={t('itinerary.addActivityPh')} onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), void addActivity())} aria-label={t('itinerary.addActivity')} />
          <button className="bp-btn bp-btn--outline bp-btn--sm" onClick={addActivity}>{t('itinerary.add')}</button>
        </div>
      )}
    </li>
  );
}
