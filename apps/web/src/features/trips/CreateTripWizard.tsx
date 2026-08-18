import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { createTripSchema } from '@boardingpass/validation';
import { isApiError } from '@boardingpass/core';
import type { TripType } from '@boardingpass/types';
import type { Trip, TripCity } from './tripsService';
import { useTripsWizard, tripsActions, useTripsStore } from './tripsStore';

type Row = { name: string; dateFrom: string; dateTo: string };

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
  const [multi, setMulti] = useState(false);
  const [rows, setRows] = useState<Row[]>([{ name: '', dateFrom: '', dateTo: '' }]);
  const [inviteInput, setInviteInput] = useState('');
  const [invitees, setInvitees] = useState<string[]>([]);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Trip | null>(null);

  const firstRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (wizardOpen) {
      setStep(1); setTitle(''); setType(''); setDateFrom(''); setDateTo('');
      setMulti(false); setRows([{ name: '', dateFrom: '', dateTo: '' }]);
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
    setStep((s) => Math.min(3, s + 1));
  }
  function back() { setErrorCode(null); setStep((s) => Math.max(1, s - 1)); }

  function toRow(field: keyof Row, i: number, v: string) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, [field]: v } : r)));
  }
  function addRow() { setRows((rs) => [...rs, { name: '', dateFrom: '', dateTo: '' }]); }
  function removeRow(i: number) { setRows((rs) => rs.filter((_, idx) => idx !== i)); }

  function addInvitee() {
    const v = inviteInput.trim();
    if (v) { setInvitees((xs) => [...xs, v]); setInviteInput(''); }
  }

  async function create() {
    setErrorCode(null);
    const cities: TripCity[] = rows
      .filter((r) => r.name.trim())
      .map((r) => ({ name: r.name.trim(), dateFrom: multi && r.dateFrom ? r.dateFrom : undefined, dateTo: multi && r.dateTo ? r.dateTo : undefined }));
    const payload = { title: title.trim(), type: type as TripType, dateFrom, dateTo: dateTo || undefined, cities };
    const parsed = createTripSchema.safeParse(payload);
    if (!parsed.success) {
      const p = parsed.error.issues[0]?.path[0];
      const map: Record<string, string> = { title: 'TITLE_REQUIRED', type: 'TYPE_REQUIRED', dateFrom: 'DATE_REQUIRED', dateTo: 'END_BEFORE_START', cities: 'CITY_REQUIRED' };
      setErrorCode((typeof p === 'string' && map[p]) || 'GENERIC');
      return;
    }
    setBusy(true);
    try {
      const trip = await tripsActions.create({ ...payload, invitees });
      setLastCreated(trip);
      setDone(trip);
    } catch (e) {
      setErrorCode(isApiError(e) ? 'GENERIC' : 'GENERIC');
    } finally {
      setBusy(false);
    }
  }

  function goto(path: string) { closeWizard(); navigate(path); }

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
            {/* Stepper */}
            <div className="bp-stepper" aria-hidden="true">
              {[1, 2, 3].map((n, i) => (
                <div className="bp-step" key={n} style={{ flex: i < 2 ? '1' : '0 0 auto' }}>
                  <span className={`bp-step ${step >= n ? 'is-on' : ''}`.trim()} style={{ display: 'contents' }}>
                    <span className={`bp-step__dot ${step >= n ? '' : ''}`} data-on={step >= n}>{n}</span>
                  </span>
                  <span className="bp-step__label">{t(n === 1 ? 'trips.stepBasics' : n === 2 ? 'trips.stepDestinations' : 'trips.stepInvite')}</span>
                  {i < 2 && <span className="bp-step__line" />}
                </div>
              ))}
            </div>

            {err && <div className="bp-banner" role="alert">{err}</div>}

            {/* Step 1 */}
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

            {/* Step 2 */}
            {step === 2 && (
              <>
                <div className="bp-row-between">
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{t('trips.stepDestinations')}</span>
                  <label className="bp-check">
                    <input type="checkbox" checked={multi} onChange={(e) => setMulti(e.target.checked)} />
                    {t('trips.multiCity')}
                  </label>
                </div>
                {rows.map((r, i) => (
                  <div className="bp-city-row" key={i}>
                    <div className="bp-field">
                      <label htmlFor={`bp-city-${i}`}>{t('trips.cityName')}</label>
                      <input id={`bp-city-${i}`} ref={i === 0 ? firstRef : undefined} className="bp-input" value={r.name} placeholder={t('trips.cityNamePlaceholder')} onChange={(e) => toRow('name', i, e.target.value)} />
                    </div>
                    {multi && (
                      <div className="bp-field" style={{ maxWidth: 150 }}>
                        <label htmlFor={`bp-cd-${i}`}>{t('trips.cityDates')}</label>
                        <input id={`bp-cd-${i}`} className="bp-input" type="date" value={r.dateFrom} onChange={(e) => toRow('dateFrom', i, e.target.value)} />
                      </div>
                    )}
                    {i > 0 && (
                      <button type="button" className="bp-icon-btn" aria-label={t('trips.removeCity')} onClick={() => removeRow(i)}>
                        <span className="material-symbols-outlined" aria-hidden="true">delete</span>
                      </button>
                    )}
                  </div>
                ))}
                {multi && (
                  <button type="button" className="bp-add-btn" onClick={addRow}>+ {t('trips.addCity')}</button>
                )}
              </>
            )}

            {/* Step 3 */}
            {step === 3 && (
              <>
                <p style={{ margin: 0, color: 'var(--bp-ink-muted)', fontSize: 14 }}>{t('trips.inviteLead')}</p>
                <div className="bp-city-row">
                  <div className="bp-field">
                    <label htmlFor="bp-inv">{t('trips.stepInvite')}</label>
                    <input id="bp-inv" ref={firstRef} className="bp-input" value={inviteInput} placeholder={t('trips.inviteePlaceholder')} onChange={(e) => setInviteInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addInvitee())} />
                  </div>
                  <button type="button" className="bp-btn bp-btn--outline" style={{ height: 44, paddingInline: 16 }} onClick={addInvitee}>{t('trips.addInvitee')}</button>
                </div>
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
              </>
            )}

            {/* Footer nav */}
            <div className="bp-footer-nav">
              <button className="bp-btn bp-btn--outline" style={{ visibility: step === 1 ? 'hidden' : 'visible', paddingInline: 18 }} onClick={back}>{t('trips.back')}</button>
              {step < 3 ? (
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
