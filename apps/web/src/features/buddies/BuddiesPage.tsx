import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/features/auth/authStore';
import { useUIStore } from '@/app/store/uiStore';
import { formatCurrency } from '@boardingpass/core';
import { CURRENCIES, guessCountry } from '@/shared/countries';
import { mapsEnabled } from '@/shared/googleMaps';
import { PlaceSearch } from '@/features/itinerary/PlaceSearch';
import {
  CATEGORIES, KINDS, applyFilters, canManage, isParticipant, spotsLeft, statusOf,
  type BuddyCategory, type BuddyFilter, type BuddyKind, type BuddyRequest,
} from './buddiesModel';
import { CURRENT_UID } from './buddiesService';
import { buddiesActions, useBuddies } from './buddiesStore';

export function BuddiesPage() {
  const { t } = useTranslation();
  const { isAuthenticated, openAuth } = useAuth();
  const { requests, loading, flagged } = useBuddies();
  const [filter, setFilter] = useState<BuddyFilter>({ kind: 'FULL_TRIP', city: '', category: 'ALL' });
  const [creating, setCreating] = useState(false);

  useEffect(() => { void buddiesActions.load(); }, []);
  useEffect(() => {
    if (!flagged) return;
    const id = window.setTimeout(() => buddiesActions.clearFlagged(), 3000);
    return () => window.clearTimeout(id);
  }, [flagged]);

  const shown = useMemo(() => applyFilters(requests ?? [], filter), [requests, filter]);

  function guardedCreate() {
    if (!isAuthenticated) { openAuth(); return; }
    setCreating((v) => !v);
  }

  return (
    <section className="bp-page bp-buddies">
      <div className="bp-buddies__head">
        <div><h1>{t('buddiesPage.title')}</h1><p className="bp-page__lead">{t('buddiesPage.lead')}</p></div>
        <button className="bp-btn bp-btn--primary" onClick={guardedCreate}>
          <span className="material-symbols-outlined" aria-hidden="true">add</span>{t('buddiesPage.create')}
        </button>
      </div>

      <div className="bp-seg" role="group" aria-label={t('buddiesPage.mode')}>
        {KINDS.map((k) => (
          <button key={k} className={`bp-seg__btn ${filter.kind === k ? 'is-on' : ''}`} aria-pressed={filter.kind === k}
            onClick={() => setFilter((f) => ({ ...f, kind: k }))}>{t(`buddiesPage.kind.${k}`)}</button>
        ))}
      </div>

      <div className="bp-filter-bar">
        <input className="bp-input bp-input--sm" value={filter.city} placeholder={t('buddiesPage.city')} aria-label={t('buddiesPage.city')}
          onChange={(e) => setFilter((f) => ({ ...f, city: e.target.value }))} />
        <select className="bp-input bp-input--sm" value={filter.category} aria-label={t('buddiesPage.category')}
          onChange={(e) => setFilter((f) => ({ ...f, category: e.target.value as BuddyCategory | 'ALL' }))}>
          <option value="ALL">{t('buddiesPage.allCategories')}</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{t(`buddiesPage.cat.${c}`)}</option>)}
        </select>
      </div>

      {creating && <CreateForm kind={filter.kind} onClose={() => setCreating(false)} />}

      {flagged && <div className="bp-banner bp-banner--ok" role="status">{t('buddiesPage.flagged')}</div>}

      {loading && requests === null ? (
        <p className="bp-page__lead">…</p>
      ) : shown.length === 0 ? (
        <div className="bp-empty"><span className="material-symbols-outlined bp-empty__icon" aria-hidden="true">diversity_3</span><p>{t('buddiesPage.empty')}</p></div>
      ) : (
        <ul className="bp-buddy-grid" role="list">
          {shown.map((r) => <li key={r.id}><BuddyCard r={r} isAuthenticated={isAuthenticated} openAuth={openAuth} /></li>)}
        </ul>
      )}
    </section>
  );
}

function BuddyCard({ r, isAuthenticated, openAuth }: { r: BuddyRequest; isAuthenticated: boolean; openAuth: () => void }) {
  const { t } = useTranslation();
  const locale = useUIStore((s) => s.locale);
  const status = statusOf(r);
  const joined = isParticipant(r, CURRENT_UID);
  const owner = canManage(r, CURRENT_UID);
  const left = spotsLeft(r);

  function join() { if (!isAuthenticated) { openAuth(); return; } void buddiesActions.join(r.id); }

  const places = [r.country, r.city, ...(r.cities ?? [])].filter(Boolean).join('، ');
  const money = (n: number, cur: string) => formatCurrency(n, cur, locale);
  const budget = typeof r.perPerson === 'number' && r.perPerson > 0
    ? [money(r.perPerson, r.currency || 'SAR'), r.destCurrency && r.destCurrency !== (r.currency || 'SAR') ? money(r.perPerson, r.destCurrency) : null].filter(Boolean).join(' · ')
    : '';

  return (
    <article className="bp-buddy-card">
      <div className="bp-buddy-card__top">
        <span className={`bp-badge ${r.category === 'FAMILIES' ? 'bp-badge--green' : 'bp-badge--blue'}`}>{t(`buddiesPage.cat.${r.category}`)}</span>
        <span className={`bp-status-chip ${status === 'OPEN' ? 'bp-status-chip--ok' : ''}`}>{t(`buddiesPage.status.${status}`)}</span>
      </div>
      <h3 className="bp-buddy-card__title">{r.title}</h3>
      <p className="bp-buddy-card__meta">
        <span className="material-symbols-outlined" aria-hidden="true">location_on</span>{places || r.city}
      </p>
      {budget && (
        <p className="bp-buddy-card__meta">
          <span className="material-symbols-outlined" aria-hidden="true">payments</span>
          {t('buddiesPage.perPersonShort', { amount: budget })}
        </p>
      )}
      {r.includes && <p className="bp-buddy-card__line"><span className="material-symbols-outlined" aria-hidden="true">check_circle</span>{r.includes}</p>}
      {r.hotel && <p className="bp-buddy-card__line"><span className="material-symbols-outlined" aria-hidden="true">hotel</span>{r.hotel}</p>}
      {r.activityType && <p className="bp-buddy-card__line"><span className="material-symbols-outlined" aria-hidden="true">hiking</span>{[r.activityType, r.activityLocation].filter(Boolean).join(' — ')}</p>}
      {r.meetingPoint && <p className="bp-buddy-card__line"><span className="material-symbols-outlined" aria-hidden="true">pin_drop</span>{r.meetingPoint}</p>}
      {r.description && <p className="bp-buddy-card__desc">{r.description}</p>}
      <p className="bp-buddy-card__spots">{t('buddiesPage.spots', { left, capacity: r.capacity })}</p>

      <div className="bp-buddy-card__actions">
        {owner ? (
          !r.closed && <button className="bp-btn bp-btn--outline bp-btn--sm" onClick={() => buddiesActions.close(r.id)}>{t('buddiesPage.close')}</button>
        ) : joined ? (
          <button className="bp-btn bp-btn--outline bp-btn--sm" onClick={() => buddiesActions.leave(r.id)}>{t('buddiesPage.leave')}</button>
        ) : (
          <button className="bp-btn bp-btn--primary bp-btn--sm" disabled={status !== 'OPEN'} onClick={join}>
            {status === 'OPEN' ? t('buddiesPage.join') : t(`buddiesPage.status.${status}`)}
          </button>
        )}
        <button className="bp-icon-btn bp-icon-btn--xs" aria-label={t('buddiesPage.flag')} onClick={() => buddiesActions.flag(r.id)}>
          <span className="material-symbols-outlined" aria-hidden="true">flag</span>
        </button>
      </div>
    </article>
  );
}

function CreateForm({ kind, onClose }: { kind: BuddyKind; onClose: () => void }) {
  const { t } = useTranslation();
  const isTrip = kind === 'FULL_TRIP';
  const [title, setTitle] = useState('');
  const [country, setCountry] = useState('');
  const [city, setCity] = useState('');
  const [extraCities, setExtraCities] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [category, setCategory] = useState<BuddyCategory>('GENERAL');
  const [perPerson, setPerPerson] = useState('');
  const [currency, setCurrency] = useState('SAR');
  const [destCurrency, setDestCurrency] = useState('');
  const [includes, setIncludes] = useState('');
  const [hotel, setHotel] = useState('');
  const [activityType, setActivityType] = useState('');
  const [activityLocation, setActivityLocation] = useState('');
  const [meetingPoint, setMeetingPoint] = useState('');
  const [capacity, setCapacity] = useState('4');
  const [description, setDescription] = useState('');

  // Picking the city from the world-cities search fills the country too, and
  // (when the destination is abroad) suggests a second currency for the budget.
  function onPickCity(label: string) {
    const parts = label.split(/[،,]/).map((s) => s.trim());
    setCity(parts[0] || label);
    const co = parts[1];
    if (co) {
      setCountry(co);
      const guess = guessCountry(label);
      if (guess && guess.currency !== 'SAR') setDestCurrency(guess.currency);
    }
  }

  async function submit() {
    if (!title.trim() || !city.trim() || !dateFrom) return;
    const cities = extraCities.split(/[،,]/).map((s) => s.trim()).filter(Boolean);
    const ok = await buddiesActions.create({
      kind, title, country: country || undefined, city, cities: cities.length ? cities : undefined,
      dateFrom, dateTo: dateTo || dateFrom, category,
      perPerson: perPerson ? Number(perPerson) : undefined, currency, destCurrency: destCurrency || undefined,
      includes: includes || undefined, hotel: isTrip ? (hotel || undefined) : undefined,
      activityType: !isTrip ? (activityType || undefined) : undefined,
      activityLocation: !isTrip ? (activityLocation || undefined) : undefined,
      meetingPoint: meetingPoint || undefined,
      capacity: Number(capacity) || 1, description,
    });
    if (ok) onClose();
  }

  return (
    <div className="bp-create-buddy">
      <h3 className="bp-panel__h">{t('buddiesPage.newTitle')}</h3>
      <input className="bp-input" value={title} placeholder={t('buddiesPage.titlePh')} aria-label={t('buddiesPage.titleLabel')} onChange={(e) => setTitle(e.target.value)} />

      <div className="bp-field">
        <span className="bp-field__label">{t('buddiesPage.city')}</span>
        {mapsEnabled() ? (
          <PlaceSearch citiesOnly value={city} onValueChange={setCity} onPick={(p) => onPickCity(p.name)}
            placeholder={t('buddiesPage.cityPh')} ariaLabel={t('buddiesPage.city')} />
        ) : (
          <input className="bp-input" value={city} placeholder={t('buddiesPage.cityPh')} aria-label={t('buddiesPage.city')} onChange={(e) => setCity(e.target.value)} />
        )}
      </div>
      {isTrip && (
        <input className="bp-input" value={extraCities} placeholder={t('buddiesPage.extraCitiesPh')} aria-label={t('buddiesPage.extraCities')} onChange={(e) => setExtraCities(e.target.value)} />
      )}

      <div className="bp-grid-2">
        <label className="bp-field"><span className="bp-field__label">{t('trips.fromLabel')}</span>
          <input className="bp-input" type="date" value={dateFrom} aria-label={t('trips.fromLabel')} onChange={(e) => setDateFrom(e.target.value)} /></label>
        <label className="bp-field"><span className="bp-field__label">{t('trips.toLabel')}</span>
          <input className="bp-input" type="date" value={dateTo} aria-label={t('trips.toLabel')} onChange={(e) => setDateTo(e.target.value)} /></label>
        <label className="bp-field"><span className="bp-field__label">{t('buddiesPage.category')}</span>
          <select className="bp-input" value={category} aria-label={t('buddiesPage.category')} onChange={(e) => setCategory(e.target.value as BuddyCategory)}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{t(`buddiesPage.cat.${c}`)}</option>)}
          </select></label>
        <label className="bp-field"><span className="bp-field__label">{t('buddiesPage.capacity')}</span>
          <input className="bp-input" type="number" min="1" value={capacity} aria-label={t('buddiesPage.capacity')} onChange={(e) => setCapacity(e.target.value)} /></label>
      </div>

      <div className="bp-grid-2">
        <label className="bp-field"><span className="bp-field__label">{t('buddiesPage.perPerson')}</span>
          <input className="bp-input" type="number" min="0" value={perPerson} placeholder="0" aria-label={t('buddiesPage.perPerson')} onChange={(e) => setPerPerson(e.target.value)} /></label>
        <label className="bp-field"><span className="bp-field__label">{t('buddiesPage.currency')}</span>
          <select className="bp-input" value={currency} aria-label={t('buddiesPage.currency')} onChange={(e) => setCurrency(e.target.value)}>
            {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select></label>
      </div>
      {destCurrency && (
        <label className="bp-field"><span className="bp-field__label">{t('buddiesPage.destCurrency')}</span>
          <select className="bp-input" value={destCurrency} aria-label={t('buddiesPage.destCurrency')} onChange={(e) => setDestCurrency(e.target.value)}>
            <option value="">—</option>
            {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select></label>
      )}
      <input className="bp-input" value={includes} placeholder={t('buddiesPage.includesPh')} aria-label={t('buddiesPage.includes')} onChange={(e) => setIncludes(e.target.value)} />

      {isTrip ? (
        <input className="bp-input" value={hotel} placeholder={t('buddiesPage.hotelPh')} aria-label={t('buddiesPage.hotel')} onChange={(e) => setHotel(e.target.value)} />
      ) : (
        <div className="bp-grid-2">
          <input className="bp-input" value={activityType} placeholder={t('buddiesPage.activityTypePh')} aria-label={t('buddiesPage.activityType')} onChange={(e) => setActivityType(e.target.value)} />
          <input className="bp-input" value={activityLocation} placeholder={t('buddiesPage.activityLocationPh')} aria-label={t('buddiesPage.activityLocation')} onChange={(e) => setActivityLocation(e.target.value)} />
        </div>
      )}
      <input className="bp-input" value={meetingPoint} placeholder={t('buddiesPage.meetingPointPh')} aria-label={t('buddiesPage.meetingPoint')} onChange={(e) => setMeetingPoint(e.target.value)} />

      <textarea className="bp-input" value={description} placeholder={t('buddiesPage.descPh')} aria-label={t('buddiesPage.description')} rows={3} onChange={(e) => setDescription(e.target.value)} />
      <div className="bp-row-between">
        <button className="bp-btn bp-btn--primary" onClick={submit}>{t('buddiesPage.publish')}</button>
        <button className="bp-btn bp-btn--outline" onClick={onClose}>{t('trips.close')}</button>
      </div>
    </div>
  );
}
