import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { createTripSchema } from '@boardingpass/validation';
import { isApiError } from '@boardingpass/core';
import type { TripType } from '@boardingpass/types';
import type { Trip, TripCity, TripTravelMode, TripState } from './tripsService';
import { useTripsWizard, tripsActions, useTripsStore } from './tripsStore';

type Row = { name: string; dateFrom: string; dateTo: string; hotel: string };

const STEPS = 5;
const MODES: { key: TripTravelMode; icon: string }[] = [
  { key: 'PLANE', icon: 'flight' },
  { key: 'CAR', icon: 'directions_car' },
  { key: 'CRUISE', icon: 'directions_boat' },
];
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

  const [step, setStep] = useState(1);
  const [title, setTitle] = useState('');
  const [type, setType] = useState<TripType | ''>('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [rows, setRows] = useState<Row[]>([{ name: '', dateFrom: '', dateTo: '', hotel: '' }]);
  const [travelMode, setTravelMode] = useState<TripTravelMode>('PLANE');
  const [state, setState] = useState<TripState>('PLANNING');
  const [inviteInput, setInviteInput] = useState('');
  const [invitees, setInvitees] = useState<string[]>([]);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Trip | null>(null);

  const firstRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (wizardOpen) {
      setStep(1); setTitle(''); setType(''); setDateFrom(''); setDateTo('');
      setRows([{ name: '', dateFrom: '', dateTo: '', hotel: '' }]); setTravelMode('PLANE'); setState('PLANNING');
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

  function validateStep1(): boolean {
    if (title.trim().length < 2) { setErrorCode('TITLE_REQUIRED'); return false; }
    if (!type) { setErrorCode('TYPE_REQUIRED'); return false; }
    if (!dateFrom) { setErrorCode('DATE_REQUIRED'); return false; }
    if (dateTo && dateTo < dateFrom) { setErrorCode('END_BEFORE_START'); return false; }
    return true;
  }
  function validateStep2(): boolean {
    if (!rows[0]?.name.trim()) { setErrorCode('CITY_REQUIRED'); return false; }
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
  function addRow() { setRows((rs) => [...rs, { name: '', dateFrom: '', dateTo: '', hotel: '' }]); }
  function removeRow(i: number) { setRows((rs) => rs.filter((_, idx) => idx !== i)); }

  function addInvitee() {
    const v = inviteInput.trim();
    if (v) { setInvitees((xs) => [...xs, v]); setInviteInput(''); }
  }

  async function create() {
    setErrorCode(null);
    const cities: TripCity[] = rows
      .filter((r) => r.name.trim())
      .map((r) => ({
        name: r.name.trim(),
        dateFrom: r.dateFrom || undefined,
        dateTo: r.dateTo || undefined,
        hotel: r.hotel.trim() || undefined,
        travelMode,
      }));
    const payload = { title: title.trim(), type: type as TripType, dateFrom, dateTo: dateTo || undefined, cities, travelMode, state, invitees };
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

  const stepLabels = ['trips.stepBasics', 'trips.stepDestinations', 'trips.stepTravel', 'trips.stepHotels', 'trips.stepPeople'];

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
                        <input id={`bp-city-${i}`} ref={i === 0 ? firstRef : undefined} className="bp-input" value={r.name} placeholder={t('trips.cityNamePlaceholder')} onChange={(e) => toRow('name', i, e.target.value)} />
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
                        <input id={`bp-cf-${i}`} className="bp-input" type="date" value={r.dateFrom} onChange={(e) => toRow('dateFrom', i, e.target.value)} />
                      </div>
                      <div className="bp-field">
                        <label htmlFor={`bp-ct-${i}`}>{t('trips.toLabel')}</label>
                        <input id={`bp-ct-${i}`} className="bp-input" type="date" value={r.dateTo} onChange={(e) => toRow('dateTo', i, e.target.value)} />
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
                <p className="bp-wizard-hint">{t('trips.travelHint')}</p>
                <div className="bp-modes" role="group" aria-label={t('trips.stepTravel')}>
                  {MODES.map((m) => (
                    <button key={m.key} type="button" className={`bp-mode ${travelMode === m.key ? 'is-on' : ''}`} aria-pressed={travelMode === m.key} onClick={() => setTravelMode(m.key)}>
                      <span className="material-symbols-outlined" aria-hidden="true">{m.icon}</span>
                      {t(`itinerary.mode.${m.key}`)}
                    </button>
                  ))}
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
                    <div className="bp-field" key={i}>
                      <label htmlFor={`bp-hotel-${i}`}>{t('trips.hotelForCity', { city: r.name.trim() })}</label>
                      <input id={`bp-hotel-${i}`} className="bp-input" value={r.hotel} placeholder={t('trips.hotelPlaceholder')} onChange={(e) => toRow('hotel', i, e.target.value)} />
                    </div>
                  ) : null))
                )}
              </>
            )}

            {/* Step 5 — people + status */}
            {step === 5 && (
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
