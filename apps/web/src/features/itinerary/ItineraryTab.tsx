import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { formatDate } from '@boardingpass/core';
import { useUIStore } from '@/app/store/uiStore';
import { FlightLookup } from '@/features/flights/FlightLookup';
import { flightSummary } from '@/features/flights/flightsModel';
import type { CitySeed, CityStop, Day } from './itineraryService';
import { itineraryActions, useItinerary } from './itineraryStore';
import { estimateWeather, type Clothing } from './weather';

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

      <div className="bp-itin-grid">
        <FlightSection tripId={tripId} city={city} canEdit={canEdit} />
        <HotelSection tripId={tripId} city={city} canEdit={canEdit} />
        <WeatherSection city={city} date={city.dateFrom ?? tripStart} />
      </div>

      <DaysSection tripId={tripId} city={city} canEdit={canEdit} />
    </div>
  );
}

/** ── Flight section ── */
function FlightSection({ tripId, city, canEdit }: { tripId: string; city: CityStop; canEdit: boolean }) {
  const { t } = useTranslation();
  const [v, setV] = useState(city.flight ?? '');
  useEffect(() => setV(city.flight ?? ''), [city.flight]);
  const save = (val: string) => itineraryActions.setCityInfo(tripId, city.id, { flight: val });

  return (
    <section className="bp-itin-sec">
      <div className="bp-itin-sec__head">
        <span className="material-symbols-outlined bp-itin-sec__icon bp-itin-sec__icon--flight" aria-hidden="true">flight</span>
        <h4>{t('itinerary.flight')}</h4>
      </div>
      {canEdit ? (
        <>
          <label className="bp-field">
            <span className="bp-field__label">{t('itinerary.flightNo')}</span>
            <input className="bp-input" value={v} placeholder={t('itinerary.flightPh')} aria-label={t('itinerary.flight')}
              onChange={(e) => setV(e.target.value)} onBlur={() => v !== (city.flight ?? '') && save(v)} />
          </label>
          <FlightLookup onFilled={(info) => { const s = flightSummary(info); setV(s); void save(s); }} />
        </>
      ) : (
        <p className="bp-itin-sec__val">{city.flight || '—'}</p>
      )}
    </section>
  );
}

/** ── Hotel / stay section ── */
function HotelSection({ tripId, city, canEdit }: { tripId: string; city: CityStop; canEdit: boolean }) {
  const { t } = useTranslation();
  const [v, setV] = useState(city.hotel ?? '');
  useEffect(() => setV(city.hotel ?? ''), [city.hotel]);
  const save = (val: string) => itineraryActions.setCityInfo(tripId, city.id, { hotel: val });

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
            <input className="bp-input" value={v} placeholder={t('itinerary.hotelPh')} aria-label={t('itinerary.hotel')}
              onChange={(e) => setV(e.target.value)} onBlur={() => v !== (city.hotel ?? '') && save(v)} />
          </label>
          <Link className="bp-inline-link" to="/explore">
            <span className="material-symbols-outlined" aria-hidden="true">travel_explore</span>
            {t('itinerary.browseHotels')}
          </Link>
        </>
      ) : (
        <p className="bp-itin-sec__val">{city.hotel || '—'}</p>
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
        <Link className="bp-inline-link" to="/explore">
          <span className="material-symbols-outlined" aria-hidden="true">explore</span>
          {t('itinerary.browsePlaces')}
        </Link>
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
