import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDate } from '@boardingpass/core';
import { useUIStore } from '@/app/store/uiStore';
import { isValidCode, normalizeCode, type FlightInfo } from './flightsModel';
import { flightsActions, type LookupResult } from './flightsStore';

/** Flight-number lookup panel (US-004). Calls the backend proxy via the service —
 *  no API key in the client. `onFilled` lets the host prefill fields
 *  non-destructively (BR-004-005). */
export function FlightLookup({ onFilled }: { onFilled?: (info: FlightInfo) => void }) {
  const { t } = useTranslation();
  const locale = useUIStore((s) => s.locale);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<LookupResult | null>(null);

  async function fetchFlight() {
    const c = normalizeCode(code);
    setResult(null);
    if (!isValidCode(c)) { setResult({ kind: 'error', code: 'INVALID' }); return; }
    setBusy(true);
    try {
      const r = await flightsActions.lookup(c);
      setResult(r);
      if (r.kind === 'found') onFilled?.(r.info);
    } finally {
      setBusy(false);
    }
  }

  const fmt = (iso?: string) => (iso ? formatDate(iso, locale, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');

  return (
    <div className="bp-flight">
      <div className="bp-add-row">
        <div className="bp-field" style={{ flex: 1 }}>
          <label htmlFor="bp-flight-code">{t('flight.codeLabel')}</label>
          <input id="bp-flight-code" className="bp-input" dir="ltr" value={code} placeholder={t('flight.codePh')}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), void fetchFlight())} />
        </div>
        <button className="bp-btn bp-btn--outline bp-btn--sm" style={{ alignSelf: 'end' }} disabled={busy || !code.trim()} onClick={fetchFlight}>
          {busy ? t('flight.fetching') : t('flight.fetch')}
        </button>
      </div>

      <div aria-busy={busy} aria-live="polite">
        {busy && <p className="bp-note">{t('flight.fetching')}</p>}
        {!busy && result?.kind === 'found' && (
          <div className="bp-flight-result">
            <div className="bp-flight-result__airline">{result.info.airline} · {result.info.code}</div>
            <div className="bp-flight-legs">
              <div className="bp-flight-leg">
                <span className="bp-flight-leg__iata">{result.info.departure.iata}</span>
                <span className="bp-flight-leg__name">{result.info.departure.name}</span>
                <span className="bp-flight-leg__time">{fmt(result.info.departure.time)}</span>
              </div>
              <span className="material-symbols-outlined" aria-hidden="true">flight</span>
              <div className="bp-flight-leg">
                <span className="bp-flight-leg__iata">{result.info.arrival.iata}</span>
                <span className="bp-flight-leg__name">{result.info.arrival.name}</span>
                <span className="bp-flight-leg__time">{fmt(result.info.arrival.time)}</span>
              </div>
            </div>
          </div>
        )}
        {!busy && result?.kind === 'empty' && <p className="bp-note" role="status">{t('flight.empty')}</p>}
        {!busy && result?.kind === 'error' && (
          <div className="bp-banner" role="alert">{t(`flight.errors.${result.code}`, t('flight.errors.GENERIC'))}</div>
        )}
      </div>
    </div>
  );
}
