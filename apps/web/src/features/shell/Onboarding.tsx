import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

/** First-run onboarding: a short, dismissible 3-step welcome that tells a new
 *  user what the app does and where to start. Shows once ever (localStorage),
 *  and never blocks — it can be skipped at any step. */
const KEY = 'bp.onboarded.v1';
const STEPS = [
  { icon: 'flight_takeoff', key: 'welcome' },
  { icon: 'explore', key: 'discover' },
  { icon: 'diversity_3', key: 'group' },
] as const;

export function Onboarding() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);

  useEffect(() => {
    // Don't surface the first-run overlay during tests — it would cover the
    // screen and intercept interactions in integration specs.
    if (import.meta.env.MODE === 'test') return;
    let seen = false;
    try { seen = localStorage.getItem(KEY) === '1'; } catch { /* private mode */ }
    if (!seen) {
      const id = window.setTimeout(() => setOpen(true), 500);
      return () => window.clearTimeout(id);
    }
  }, []);

  function done() {
    try { localStorage.setItem(KEY, '1'); } catch { /* ignore */ }
    setOpen(false);
  }
  function start() { done(); navigate('/?new=1'); }

  if (!open) return null;
  const last = i === STEPS.length - 1;
  const step = STEPS[i];

  return (
    <div className="bp-scrim" onMouseDown={(e) => e.target === e.currentTarget && done()}>
      <div className="bp-modal bp-onb" role="dialog" aria-modal="true" aria-label={t('onboarding.title')} onMouseDown={(e) => e.stopPropagation()}>
        <button className="bp-onb__skip bp-link" onClick={done}>{t('onboarding.skip')}</button>

        <div className="bp-onb__art" aria-hidden="true">
          <span className="material-symbols-outlined">{step.icon}</span>
        </div>
        <h2 className="bp-onb__title">{t(`onboarding.${step.key}.title`)}</h2>
        <p className="bp-onb__body">{t(`onboarding.${step.key}.body`)}</p>

        <div className="bp-onb__dots" role="tablist" aria-label={t('onboarding.title')}>
          {STEPS.map((s, idx) => (
            <button key={s.key} role="tab" aria-selected={idx === i} aria-label={`${idx + 1}`}
              className={`bp-onb__dot ${idx === i ? 'is-on' : ''}`} onClick={() => setI(idx)} />
          ))}
        </div>

        <div className="bp-onb__actions">
          {last ? (
            <button className="bp-btn bp-btn--primary" onClick={start}>
              <span className="material-symbols-outlined" aria-hidden="true">add</span>
              {t('onboarding.start')}
            </button>
          ) : (
            <button className="bp-btn bp-btn--primary" onClick={() => setI((n) => n + 1)}>{t('onboarding.next')}</button>
          )}
        </div>
      </div>
    </div>
  );
}
