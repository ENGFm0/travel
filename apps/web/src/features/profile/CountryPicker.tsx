import { useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { COUNTRIES } from '@/shared/countries';

/** Countries shown first when nothing has been typed (most of our users). */
const COMMON = ['SA', 'AE', 'KW', 'QA', 'BH', 'OM', 'EG', 'JO', 'TR', 'GB', 'US'];
const MAX = 8;

/** Searchable country picker: a text box that filters the (long) country list
 *  by Arabic or English name or code, with the common countries first. The
 *  chosen country shows as a removable chip. `value` is the ISO code. */
export function CountryPicker({ value, onChange, locale, label }: {
  value: string; onChange: (code: string) => void; locale: string; label: string;
}) {
  const { t } = useTranslation();
  const ar = locale.startsWith('ar');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const listId = useId();
  const nameOf = (c: (typeof COUNTRIES)[number]) => (ar ? c.ar : c.en);
  const selected = COUNTRIES.find((c) => c.code === value);

  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return COMMON.map((code) => COUNTRIES.find((c) => c.code === code)).filter(Boolean) as typeof COUNTRIES;
    return COUNTRIES.filter((c) => c.ar.includes(s) || c.en.toLowerCase().includes(s) || c.code.toLowerCase() === s).slice(0, MAX);
  }, [q]);

  if (selected) {
    return (
      <div className="bp-cpick">
        <span className="bp-cpick__chip">
          <span>{nameOf(selected)} ({selected.currency})</span>
          <button type="button" className="bp-cpick__x" aria-label={t('account.countryClear')} onClick={() => { onChange(''); setQ(''); setOpen(true); }}>✕</button>
        </span>
      </div>
    );
  }

  return (
    <div className="bp-cpick">
      <input id="bp-p-country" className="bp-input" value={q} placeholder={t('account.countrySearchPh')} autoComplete="off"
        role="combobox" aria-label={label} aria-expanded={open} aria-controls={listId} aria-autocomplete="list"
        onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)} />
      {open && (
        <ul className="bp-cpick__list" id={listId} role="listbox">
          {!q.trim() && <li className="bp-cpick__hint" aria-hidden="true">{t('account.countryCommon')}</li>}
          {matches.length === 0 && <li className="bp-cpick__hint">{t('account.countryNoMatch')}</li>}
          {matches.map((c) => (
            <li key={c.code} role="option" aria-selected={false}>
              <button type="button" className="bp-cpick__opt" onMouseDown={(e) => e.preventDefault()} onClick={() => { onChange(c.code); setOpen(false); }}>
                <span>{nameOf(c)}</span><span className="bp-cpick__cur">{c.currency}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
