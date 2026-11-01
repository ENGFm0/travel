import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { createTripSchema } from '@boardingpass/validation';
import { formatDate, isApiError } from '@boardingpass/core';
import { useUIStore } from '@/app/store/uiStore';
import type { TripType } from '@boardingpass/types';
import type { Trip, TripTravelMode, TripState } from './tripsService';
import { useTripsWizard, tripsActions, useTripsStore } from './tripsStore';
import { useProfile } from '@/features/profile/profileStore';
import { currencyOf } from '@/shared/countries';

type Field = 'title' | 'type' | 'dateFrom' | 'dateTo' | 'city';
/** Which field each validation code belongs to — errors show next to it. */
const FIELD_OF: Record<string, Field> = {
  TITLE_REQUIRED: 'title', TYPE_REQUIRED: 'type', DATE_REQUIRED: 'dateFrom', END_BEFORE_START: 'dateTo', CITY_SHORT: 'city',
};

/** Create a trip in ONE step — title, type, start/end dates and (optionally)
 *  the first destination. Stays, transport, budget and members are added from
 *  inside the trip afterwards, so the first screen stays frictionless. */
export function CreateTripWizard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { wizardOpen, closeWizard } = useTripsWizard();
  const setLastCreated = useTripsStore((s) => s.setLastCreated);
  const { profile } = useProfile();
  const locale = useUIStore((s) => s.locale);
  const homeCurrency = currencyOf(profile?.country) ?? 'SAR';
  const travelMode: TripTravelMode = 'PLANE';
  const state: TripState = 'PLANNING';

  const [title, setTitle] = useState('');
  const [type, setType] = useState<TripType | ''>('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [city, setCity] = useState('');
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Trip | null>(null);

  const firstRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (wizardOpen) {
      setTitle(''); setType(''); setDateFrom(''); setDateTo(''); setCity('');
      setErrorCode(null); setBusy(false); setDone(null);
    }
  }, [wizardOpen]);

  useEffect(() => {
    if (!wizardOpen) return;
    firstRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeWizard();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [wizardOpen, closeWizard]);

  if (!wizardOpen) return null;

  const errField: Field | null = errorCode ? (FIELD_OF[errorCode] ?? null) : null;
  const errText = errorCode ? t(`trips.errors.${errorCode}`, t('trips.errors.GENERIC')) : null;
  const fieldErr = (f: Field) => (errField === f && errText ? <span className="bp-field__error" role="alert">{errText}</span> : null);

  function validate(): boolean {
    if (title.trim().length < 2) { setErrorCode('TITLE_REQUIRED'); return false; }
    if (!type) { setErrorCode('TYPE_REQUIRED'); return false; }
    if (!dateFrom) { setErrorCode('DATE_REQUIRED'); return false; }
    if (dateTo && dateTo < dateFrom) { setErrorCode('END_BEFORE_START'); return false; }
    if (city.trim() && city.trim().length < 2) { setErrorCode('CITY_SHORT'); return false; }
    return true;
  }

  async function create() {
    setErrorCode(null);
    if (!validate()) return;
    const first = city.trim();
    const payload = {
      title: title.trim(), type: type as TripType, dateFrom, dateTo: dateTo || undefined,
      cities: first ? [{ name: first }] : [], travelMode, state,
      currency: homeCurrency || undefined,
      invitees: [],
    };
    const parsed = createTripSchema.safeParse(payload);
    if (!parsed.success) {
      const p = parsed.error.issues[0]?.path[0];
      const map: Record<string, string> = { title: 'TITLE_REQUIRED', type: 'TYPE_REQUIRED', dateFrom: 'DATE_REQUIRED', dateTo: 'END_BEFORE_START', cities: 'CITY_SHORT' };
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

  const range = done
    ? (done.dateTo ? `${formatDate(done.dateFrom, locale)} – ${formatDate(done.dateTo, locale)}` : formatDate(done.dateFrom, locale))
    : '';

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
              «{done.title}» · {t(`trips.${done.type === 'DOMESTIC' ? 'domestic' : 'international'}`)} · {range}
            </p>
            <p className="bp-wizard-note" style={{ margin: 0 }}>{t('trips.createdNextHint')}</p>
            <div className="bp-grid-2" style={{ width: '100%' }}>
              <button className="bp-btn bp-btn--primary" onClick={() => goto(`/trips/${done.id}`)}>{t('trips.openTrip')}</button>
              <button className="bp-btn bp-btn--outline" onClick={() => goto('/mytrips')}>{t('trips.myTrips')}</button>
            </div>
          </div>
        ) : (
          <>
            {/* Only errors that belong to no field (network etc.) show as a banner. */}
            {errText && !errField && <div className="bp-banner" role="alert">{errText}</div>}

            <div className="bp-field">
              <label htmlFor="bp-t-title">{t('trips.titleLabel')}</label>
              <input id="bp-t-title" ref={firstRef} className="bp-input" value={title} placeholder={t('trips.titlePlaceholder')} aria-invalid={errField === 'title' || undefined}
                onChange={(e) => { setTitle(e.target.value); if (errField === 'title') setErrorCode(null); }}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), create())} />
              {fieldErr('title')}
            </div>
            <div className="bp-field">
              <span style={{ fontSize: 13, fontWeight: 600 }}>{t('trips.typeLabel')}</span>
              <div className="bp-toggle-row">
                <button type="button" className={`bp-toggle ${type === 'DOMESTIC' ? 'is-on' : ''}`} aria-pressed={type === 'DOMESTIC'} onClick={() => { setType('DOMESTIC'); if (errField === 'type') setErrorCode(null); }}>
                  <span className="material-symbols-outlined" aria-hidden="true">home_pin</span>{t('trips.domestic')}
                </button>
                <button type="button" className={`bp-toggle ${type === 'INTERNATIONAL' ? 'is-on' : ''}`} aria-pressed={type === 'INTERNATIONAL'} onClick={() => { setType('INTERNATIONAL'); if (errField === 'type') setErrorCode(null); }}>
                  <span className="material-symbols-outlined" aria-hidden="true">public</span>{t('trips.international')}
                </button>
              </div>
              {fieldErr('type')}
            </div>
            <div className="bp-grid-2">
              <div className="bp-field">
                <label htmlFor="bp-t-from">{t('trips.startDateLabel')}</label>
                <input id="bp-t-from" className="bp-input" type="date" value={dateFrom} aria-invalid={errField === 'dateFrom' || undefined}
                  onChange={(e) => { setDateFrom(e.target.value); if (errField === 'dateFrom') setErrorCode(null); }} />
                {fieldErr('dateFrom')}
              </div>
              <div className="bp-field">
                <label htmlFor="bp-t-to">{t('trips.endDateLabel')}</label>
                <input id="bp-t-to" className="bp-input" type="date" value={dateTo} min={dateFrom || undefined} aria-invalid={errField === 'dateTo' || undefined}
                  onChange={(e) => { setDateTo(e.target.value); if (errField === 'dateTo') setErrorCode(null); }} />
                {fieldErr('dateTo')}
              </div>
            </div>
            <div className="bp-field">
              <label htmlFor="bp-t-city">{t('trips.firstCityLabel')}</label>
              <input id="bp-t-city" className="bp-input" value={city} placeholder={t('trips.firstCityPh')} autoComplete="off" aria-invalid={errField === 'city' || undefined}
                aria-describedby="bp-t-city-note"
                onChange={(e) => { setCity(e.target.value); if (errField === 'city') setErrorCode(null); }}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), create())} />
              <span id="bp-t-city-note" className="bp-note">{t('trips.firstCityNote')}</span>
              {fieldErr('city')}
            </div>

            <div className="bp-footer-nav">
              <button className="bp-btn bp-btn--outline" style={{ paddingInline: 18 }} onClick={closeWizard}>{t('trips.close')}</button>
              <button className="bp-btn bp-btn--primary" style={{ paddingInline: 24 }} disabled={busy} onClick={create}>{t('trips.create')}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
