import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { createTripSchema } from '@boardingpass/validation';
import { isApiError } from '@boardingpass/core';
import type { TripType } from '@boardingpass/types';
import type { Trip, TripCity, TripTravelMode, TripState } from './tripsService';
import { useTripsWizard, tripsActions, useTripsStore } from './tripsStore';
import { useProfile } from '@/features/profile/profileStore';
import { currencyOf, guessCountry } from '@/shared/countries';
import { getItineraryBoard, TRIP_KINDS, type FlightLeg, type TripKind } from '@/features/itinerary/itineraryService';
import { LegForm } from '@/features/itinerary/ItineraryTab';
import { PlaceSearch } from '@/features/itinerary/PlaceSearch';
import { mapsEnabled } from '@/shared/googleMaps';
import { setTripKitty } from '@/features/expenses/expensesService';

const mapsHotelSearch = (city: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`فنادق ${city}`)}`;
function bookingHotelSearch(city: string, checkin?: string, checkout?: string): string {
  const p = new URLSearchParams({ ss: city });
  if (checkin) p.set('checkin', checkin);
  if (checkout) p.set('checkout', checkout);
  return `https://www.booking.com/searchresults.html?${p.toString()}`;
}

type Row = { name: string; dateFrom: string; dateTo: string; hotel: string; hotelUrl: string };

const STEPS = 6;
const STATES: { key: TripState; icon: string }[] = [
  { key: 'PLANNING', icon: 'edit_calendar' },
  { key: 'CONFIRMED', icon: 'task_alt' },
  { key: 'DONE', icon: 'verified' },
];

export function CreateTripWizard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { wizardOpen, closeWizard } = useTripsWizard();
  const setLastCreated = useTripsStore((s) => s.setLastCreated);
  const { profile } = useProfile();
  const homeCurrency = currencyOf(profile?.country) ?? 'SAR';

  const [step, setStep] = useState(1);
  const [title, setTitle] = useState('');
  const [type, setType] = useState<TripType | ''>('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [rows, setRows] = useState<Row[]>([{ name: '', dateFrom: '', dateTo: '', hotel: '', hotelUrl: '' }]);
  const travelMode: TripTravelMode = 'PLANE';
  const [tripKind, setTripKind] = useState<TripKind>('ROUND');
  const [flight, setFlight] = useState<FlightLeg>({});
  const [flightBack, setFlightBack] = useState<FlightLeg>({});
  const [legs, setLegs] = useState<FlightLeg[]>([{}]);
  const [state, setState] = useState<TripState>('PLANNING');
  const [budget, setBudget] = useState('');
  const [inviteInput, setInviteInput] = useState('');
  const [invitees, setInvitees] = useState<string[]>([]);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Trip | null>(null);

  const firstRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (wizardOpen) {
      setStep(1); setTitle(''); setType(''); setDateFrom(''); setDateTo('');
      setRows([{ name: '', dateFrom: '', dateTo: '', hotel: '', hotelUrl: '' }]); setTripKind('ROUND');
      setFlight({}); setFlightBack({}); setLegs([{}]); setState('PLANNING');
      setBudget('');
      setInviteInput(''); setInvitees([]); setErrorCode(null); setBusy(false); setDone(null);
    }
  }, [wizardOpen]);

  useEffect(() => {
    if (!wizardOpen) return;
    firstRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeWizard();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [wizardOpen, step, closeWizard]);

  if (!wizardOpen) return null;

  const err = errorCode ? t(`trips.errors.${errorCode}`, t('trips.errors.GENERIC')) : null;
  const namedCities = rows.filter((r) => r.name.trim());
  // Currency is automatic: your currency from your country; the destination
  // currency guessed from the cities (international trips only).
  const destCountry = namedCities.map((r) => guessCountry(r.name)).find(Boolean);
  const autoCurrency = homeCurrency;
  const autoDest = type === 'INTERNATIONAL' ? (destCountry?.currency ?? '') : '';

  function validateStep1(): boolean {
    if (title.trim().length < 2) { setErrorCode('TITLE_REQUIRED'); return false; }
    if (!type) { setErrorCode('TYPE_REQUIRED'); return false; }
    // Dates are optional here — they can be entered per city in the next step.
    if (dateFrom && dateTo && dateTo < dateFrom) { setErrorCode('END_BEFORE_START'); return false; }
    return true;
  }
  function validateStep2(): boolean {
    if (!rows[0]?.name.trim()) { setErrorCode('CITY_REQUIRED'); return false; }
    // A trip needs a date somewhere: either the overall range, or a city's own.
    const hasCityDate = rows.some((r) => r.dateFrom.trim());
    if (!dateFrom && !hasCityDate) { setErrorCode('DATE_REQUIRED'); return false; }
    // Per-city end must not precede its start.
    if (rows.some((r) => r.dateFrom && r.dateTo && r.dateTo < r.dateFrom)) { setErrorCode('END_BEFORE_START'); return false; }
    return true;
  }

  function next() {
    setErrorCode(null);
    if (step === 1 && !validateStep1()) return;
    if (step === 2 && !validateStep2()) return;
    setStep((s) => Math.min(STEPS, s + 1));
  }
  function back() { setErrorCode(null); setStep((s) => Math.max(1, s - 1)); }

  function toRow(field: keyof Row, i: number, v: string) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, [field]: v } : r)));
  }
  function addRow() { setRows((rs) => [...rs, { name: '', dateFrom: '', dateTo: '', hotel: '', hotelUrl: '' }]); }
  function removeRow(i: number) { setRows((rs) => rs.filter((_, idx) => idx !== i)); }

  function addInvitee() {
    const v = inviteInput.trim();
    if (v) { setInvitees((xs) => [...xs, v]); setInviteInput(''); }
  }

  async function create() {
    setErrorCode(null);
    const hasLeg = (l: FlightLeg) => Boolean(l.airline || l.no || l.from || l.to || l.date || l.time);
    const multiLegs = legs.filter(hasLeg);
    const cities: TripCity[] = rows
      .filter((r) => r.name.trim())
      .map((r, i) => ({
        name: r.name.trim(),
        dateFrom: r.dateFrom || undefined,
        dateTo: r.dateTo || undefined,
        hotel: r.hotel.trim() || undefined,
        hotelUrl: r.hotelUrl || undefined,
        travelMode,
        // attach the entered flight(s) to the first stop
        tripKind: i === 0 ? tripKind : undefined,
        flightOut: i === 0 && tripKind !== 'MULTI' && hasLeg(flight) ? flight : undefined,
        flightReturn: i === 0 && tripKind === 'ROUND' && hasLeg(flightBack) ? flightBack : undefined,
        legs: i === 0 && tripKind === 'MULTI' && multiLegs.length ? multiLegs : undefined,
      }));
    // Overall trip range: what the user typed, else derived from the cities'
    // own dates (earliest start → latest end) — we never invent dates.
    const froms = cities.map((c) => c.dateFrom).filter(Boolean) as string[];
    const tos = cities.map((c) => c.dateTo ?? c.dateFrom).filter(Boolean) as string[];
    const finalFrom = dateFrom || froms.sort()[0] || '';
    const finalTo = dateTo || (tos.length ? tos.sort()[tos.length - 1] : undefined);
    const budgetNum = budget.trim() ? Number(budget) : undefined;
    const payload = {
      title: title.trim(), type: type as TripType, dateFrom: finalFrom, dateTo: finalTo, cities, travelMode, state,
      budget: Number.isFinite(budgetNum) ? budgetNum : undefined,
      currency: autoCurrency || undefined,
      destCurrency: autoDest || undefined,
      invitees,
    };
    const parsed = createTripSchema.safeParse(payload);
    if (!parsed.success) {
      const p = parsed.error.issues[0]?.path[0];
      const map: Record<string, string> = { title: 'TITLE_REQUIRED', type: 'TYPE_REQUIRED', dateFrom: 'DATE_REQUIRED', dateTo: 'END_BEFORE_START', cities: 'CITY_REQUIRED' };
      setErrorCode((typeof p === 'string' && map[p]) || 'GENERIC');
      return;
    }
    setBusy(true);
    try {
      const trip = await tripsActions.create(payload);
      // Seed the itinerary board now so cities, dates, hotels, travel mode and
      // the flight all show up in the trip immediately (not only lazily later).
      try {
        await getItineraryBoard(trip.id, cities.map((c) => ({
          name: c.name, dateFrom: c.dateFrom, dateTo: c.dateTo, hotel: c.hotel, hotelUrl: c.hotelUrl, travelMode: c.travelMode,
          flightOut: c.flightOut, flightReturn: c.flightReturn, legs: c.legs, tripKind: c.tripKind,
        })));
      } catch { /* best-effort seed */ }
      // Reflect the trip budget into the shared kitty total.
      if (payload.budget && payload.budget > 0) { try { await setTripKitty(trip.id, payload.budget); } catch { /* best-effort */ } }
      setLastCreated(trip);
      setDone(trip);
    } catch (e) {
      console.error('[createTrip]', e);
      setErrorCode(isApiError(e) ? 'GENERIC' : 'GENERIC');
    } finally {
      setBusy(false);
    }
  }

  function goto(path: string) { closeWizard(); navigate(path); }

  const stepLabels = ['trips.stepBasics', 'trips.stepDestinations', 'trips.stepTravel', 'trips.stepHotels', 'trips.stepBudget', 'trips.stepPeople'];

  return (
    <div className="bp-scrim" onMouseDown={(e) => e.target === e.currentTarget && closeWizard()}>
      <div className="bp-modal" role="dialog" aria-modal="true" aria-labelledby="bp-trip-title" data-testid="trip-wizard" onMouseDown={(e) => e.stopPropagation()}>
        <div className="bp-modal__head">
          <h2 className="bp-modal__title" id="bp-trip-title">{t('trips.newTitle')}</h2>
          <button className="bp-icon-btn" onClick={closeWizard} aria-label={t('trips.close')}>
            <span className="material-symbols-outlined" aria-hidden="true">close</span>
          </button>
        </div>

        {done ? (
          <div className="bp-success">
            <div className="bp-success__ring"><span className="material-symbols-outlined" aria-hidden="true">check_circle</span></div>
            <h3 style={{ margin: 0 }}>{t('trips.successTitle')}</h3>
            <p style={{ margin: 0, color: 'var(--bp-ink-muted)' }}>
              «{done.title}» · {t(`trips.${done.type === 'DOMESTIC' ? 'domestic' : 'international'}`)} · {done.cities.length} · {t('trips.invitedCount', { count: invitees.length })}
            </p>
            <div className="bp-grid-2" style={{ width: '100%' }}>
              <button className="bp-btn bp-btn--primary" onClick={() => goto('/mytrips')}>{t('trips.openTrip')}</button>
              <button className="bp-btn bp-btn--outline" onClick={() => goto('/mytrips')}>{t('trips.myTrips')}</button>
            </div>
          </div>
        ) : (
          <>
            {/* Compact progress */}
            <p className="bp-wizard-progress">{t('trips.stepOf', { n: step, total: STEPS })} · {t(stepLabels[step - 1])}</p>

            {err && <div className="bp-banner" role="alert">{err}</div>}

            {/* Step 1 — basics */}
            {step === 1 && (
              <>
                <div className="bp-field">
                  <label htmlFor="bp-t-title">{t('trips.titleLabel')}</label>
                  <input id="bp-t-title" ref={firstRef} className="bp-input" value={title} placeholder={t('trips.titlePlaceholder')} onChange={(e) => setTitle(e.target.value)} />
                </div>
                <div className="bp-field">
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{t('trips.typeLabel')}</span>
                  <div className="bp-toggle-row">
                    <button type="button" className={`bp-toggle ${type === 'DOMESTIC' ? 'is-on' : ''}`} aria-pressed={type === 'DOMESTIC'} onClick={() => setType('DOMESTIC')}>
                      <span className="material-symbols-outlined" aria-hidden="true">home_pin</span>{t('trips.domestic')}
                    </button>
                    <button type="button" className={`bp-toggle ${type === 'INTERNATIONAL' ? 'is-on' : ''}`} aria-pressed={type === 'INTERNATIONAL'} onClick={() => setType('INTERNATIONAL')}>
                      <span className="material-symbols-outlined" aria-hidden="true">public</span>{t('trips.international')}
                    </button>
                  </div>
                </div>
                <div className="bp-grid-2">
                  <div className="bp-field">
                    <label htmlFor="bp-t-from">{t('trips.fromLabel')}</label>
                    <input id="bp-t-from" className="bp-input" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                  </div>
                  <div className="bp-field">
                    <label htmlFor="bp-t-to">{t('trips.toLabel')}</label>
                    <input id="bp-t-to" className="bp-input" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                  </div>
                </div>
                <p className="bp-wizard-note">{t('trips.datesOptionalHint')}</p>
              </>
            )}

            {/* Step 2 — cities + per-city dates */}
            {step === 2 && (
              <>
                <p className="bp-wizard-hint">{t('trips.citiesHint')}</p>
                {rows.map((r, i) => (
                  <div className="bp-wizard-city" key={i}>
                    <div className="bp-row-between">
                      <div className="bp-field" style={{ flex: 1 }}>
                        <label htmlFor={`bp-city-${i}`}>{t('trips.cityName')}</label>
                        {mapsEnabled() ? (
                          <PlaceSearch citiesOnly value={r.name} onValueChange={(v) => toRow('name', i, v)} onPick={(p) => toRow('name', i, p.name)}
                            placeholder={t('trips.cityNamePlaceholder')} ariaLabel={t('trips.cityName')} />
                        ) : (
                          <input id={`bp-city-${i}`} ref={i === 0 ? firstRef : undefined} className="bp-input" value={r.name} placeholder={t('trips.cityNamePlaceholder')} onChange={(e) => toRow('name', i, e.target.value)} />
                        )}
                      </div>
                      {i > 0 && (
                        <button type="button" className="bp-icon-btn" aria-label={t('trips.removeCity')} onClick={() => removeRow(i)}>
                          <span className="material-symbols-outlined" aria-hidden="true">delete</span>
                        </button>
                      )}
                    </div>
                    <div className="bp-grid-2">
                      <div className="bp-field">
                        <label htmlFor={`bp-cf-${i}`}>{t('trips.fromLabel')}</label>
                        <input id={`bp-cf-${i}`} className="bp-input" type="date" value={r.dateFrom} min={dateFrom || undefined} max={dateTo || undefined} onChange={(e) => toRow('dateFrom', i, e.target.value)} />
                      </div>
                      <div className="bp-field">
                        <label htmlFor={`bp-ct-${i}`}>{t('trips.toLabel')}</label>
                        <input id={`bp-ct-${i}`} className="bp-input" type="date" value={r.dateTo} min={r.dateFrom || dateFrom || undefined} max={dateTo || undefined} onChange={(e) => toRow('dateTo', i, e.target.value)} />
                      </div>
                    </div>
                  </div>
                ))}
                <button type="button" className="bp-add-btn" onClick={addRow}>+ {t('trips.addCity')}</button>
              </>
            )}

            {/* Step 3 — travel mode */}
            {step === 3 && (
              <>
                <p className="bp-wizard-hint">{t('trips.flightHint')}</p>
                <div className="bp-kinds" role="group" aria-label={t('itinerary.tripKindLabel')}>
                  {TRIP_KINDS.map((k) => (
                    <button key={k} type="button" className={`bp-chip bp-chip--btn ${tripKind === k ? 'is-on' : ''}`} aria-pressed={tripKind === k} onClick={() => setTripKind(k)}>
                      {t(`itinerary.tripKind.${k}`)}
                    </button>
                  ))}
                </div>

                <div className="bp-wizard-flight">
                  {tripKind === 'MULTI' ? (
                    <>
                      {legs.map((l, i) => (
                        <div key={i} className="bp-leg-wrap">
                          <LegForm title={t('itinerary.legN', { n: i + 1 })} icon="flight_takeoff" leg={l} mode={travelMode} canEdit
                            onSave={(x) => setLegs((arr) => arr.map((it, idx) => (idx === i ? x : it)))} />
                          {legs.length > 1 && <button type="button" className="bp-icon-btn bp-icon-btn--xs bp-leg-rm" aria-label={t('itinerary.removeLeg')} onClick={() => setLegs((arr) => arr.filter((_, idx) => idx !== i))}><span className="material-symbols-outlined" aria-hidden="true">close</span></button>}
                        </div>
                      ))}
                      <button type="button" className="bp-btn bp-btn--outline bp-btn--sm" onClick={() => setLegs((arr) => [...arr, {}])}>+ {t('itinerary.addLeg')}</button>
                    </>
                  ) : (
                    <>
                      <LegForm title={travelMode === 'PLANE' ? t('itinerary.outbound') : t('itinerary.legGo')} icon="flight_takeoff" leg={flight} mode={travelMode} canEdit onSave={setFlight} />
                      {tripKind === 'ROUND' && (
                        <LegForm title={travelMode === 'PLANE' ? t('itinerary.returnLeg') : t('itinerary.legBack')} icon="flight_land" leg={flightBack} mode={travelMode} canEdit onSave={setFlightBack} />
                      )}
                    </>
                  )}
                </div>
                <p className="bp-wizard-note">{t('trips.travelNote')}</p>
              </>
            )}

            {/* Step 4 — hotels per city */}
            {step === 4 && (
              <>
                <p className="bp-wizard-hint">{t('trips.hotelsHint')}</p>
                {namedCities.length === 0 ? (
                  <p className="bp-wizard-note">{t('trips.noCitiesYet')}</p>
                ) : (
                  rows.map((r, i) => (r.name.trim() ? (
                    <div className="bp-wizard-city" key={i}>
                      <div className="bp-field">
                        <label htmlFor={`bp-hotel-${i}`}>{t('trips.hotelForCity', { city: r.name.trim() })}</label>
                        {mapsEnabled() ? (
                          <PlaceSearch city={r.name.trim()} value={r.hotel}
                            onValueChange={(v) => toRow('hotel', i, v)} placeholder={t('trips.hotelPlaceholder')} ariaLabel={t('trips.hotelForCity', { city: r.name.trim() })}
                            onPick={(p) => { toRow('hotel', i, p.name); toRow('hotelUrl', i, p.mapsUrl ?? ''); }} />
                        ) : (
                          <input id={`bp-hotel-${i}`} className="bp-input" value={r.hotel} placeholder={t('trips.hotelPlaceholder')} onChange={(e) => toRow('hotel', i, e.target.value)} />
                        )}
                      </div>
                      <div className="bp-browse__links">
                        <a className="bp-map-chip" href={mapsHotelSearch(r.name.trim())} target="_blank" rel="noopener noreferrer">
                          <span className="material-symbols-outlined" aria-hidden="true">map</span>{t('itinerary.hotelsOnMaps')}
                        </a>
                        <a className="bp-map-chip" href={bookingHotelSearch(r.name.trim(), r.dateFrom, r.dateTo)} target="_blank" rel="noopener noreferrer">
                          <span className="material-symbols-outlined" aria-hidden="true">hotel</span>{t('itinerary.hotelsOnBooking')}
                        </a>
                        <Link className="bp-map-chip bp-map-chip--explore" to="/explore" onClick={closeWizard}>
                          <span className="material-symbols-outlined" aria-hidden="true">travel_explore</span>{t('itinerary.browseHotels')}
                        </Link>
                      </div>
                    </div>
                  ) : null))
                )}
              </>
            )}

            {/* Step 5 — budget + currency */}
            {step === 5 && (
              <>
                <p className="bp-wizard-hint">{t('trips.budgetHint')}</p>
                <div className="bp-grid-2">
                  <div className="bp-field">
                    <label htmlFor="bp-budget">{t('trips.budgetLabel')}</label>
                    <input id="bp-budget" className="bp-input" type="number" inputMode="decimal" min="0" value={budget} placeholder="0" onChange={(e) => setBudget(e.target.value)} autoFocus />
                  </div>
                  <div className="bp-field">
                    <span className="bp-field__label">{t('trips.currencyLabel')}</span>
                    <div className="bp-cur-auto">
                      <span className="bp-cur-badge">{autoCurrency}</span>
                      {autoDest && autoDest !== autoCurrency && <><span className="bp-city-dates__sep">+</span><span className="bp-cur-badge bp-cur-badge--dest">{autoDest}</span></>}
                    </div>
                  </div>
                </div>
                <p className="bp-wizard-note">
                  {type === 'DOMESTIC'
                    ? t('trips.currencyAutoDomestic', { cur: autoCurrency })
                    : (autoDest ? t('trips.currencyAutoIntl', { home: autoCurrency, dest: autoDest }) : t('trips.currencyAutoIntlUnknown', { home: autoCurrency }))}
                </p>
              </>
            )}

            {/* Step 6 — people + status */}
            {step === 6 && (
              <>
                <p className="bp-wizard-hint">{t('trips.peopleHint')}</p>
                <div className="bp-city-row">
                  <div className="bp-field" style={{ flex: 1 }}>
                    <label htmlFor="bp-inv">{t('trips.stepInvite')}</label>
                    <input id="bp-inv" ref={firstRef} className="bp-input" value={inviteInput} placeholder={t('trips.inviteePlaceholder')} onChange={(e) => setInviteInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addInvitee())} />
                  </div>
                  <button type="button" className="bp-btn bp-btn--outline" style={{ height: 44, paddingInline: 16 }} onClick={addInvitee}>{t('trips.addInvitee')}</button>
                </div>
                <p className="bp-wizard-note">{t('trips.peopleCount', { count: invitees.length + 1 })}</p>
                {invitees.length > 0 && (
                  <div className="bp-chips">
                    {invitees.map((v, i) => (
                      <span className="bp-chip-x" key={i}>
                        {v}
                        <button aria-label={t('trips.removeCity')} onClick={() => setInvitees((xs) => xs.filter((_, idx) => idx !== i))}>
                          <span className="material-symbols-outlined" style={{ fontSize: 16 }} aria-hidden="true">close</span>
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                <div className="bp-field">
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{t('trips.stateLabel')}</span>
                  <div className="bp-modes" role="group" aria-label={t('trips.stateLabel')}>
                    {STATES.map((s) => (
                      <button key={s.key} type="button" className={`bp-mode ${state === s.key ? 'is-on' : ''}`} aria-pressed={state === s.key} onClick={() => setState(s.key)}>
                        <span className="material-symbols-outlined" aria-hidden="true">{s.icon}</span>
                        {t(`trips.state.${s.key}`)}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Footer nav */}
            <div className="bp-footer-nav">
              <button className="bp-btn bp-btn--outline" style={{ visibility: step === 1 ? 'hidden' : 'visible', paddingInline: 18 }} onClick={back}>{t('trips.back')}</button>
              {step < STEPS ? (
                <button className="bp-btn bp-btn--primary" style={{ paddingInline: 24 }} onClick={next}>{t('trips.next')}</button>
              ) : (
                <button className="bp-btn bp-btn--primary" style={{ paddingInline: 24 }} disabled={busy} onClick={create}>{t('trips.create')}</button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
