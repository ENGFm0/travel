import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/features/auth/authStore';
import {
  BUDGETS, CATEGORIES, KINDS, applyFilters, canManage, isParticipant, spotsLeft, statusOf,
  type BuddyBudget, type BuddyCategory, type BuddyFilter, type BuddyKind, type BuddyRequest,
} from './buddiesModel';
import { CURRENT_UID } from './buddiesService';
import { buddiesActions, useBuddies } from './buddiesStore';

export function BuddiesPage() {
  const { t } = useTranslation();
  const { isAuthenticated, openAuth } = useAuth();
  const { requests, loading, flagged } = useBuddies();
  const [filter, setFilter] = useState<BuddyFilter>({ kind: 'FULL_TRIP', city: '', category: 'ALL', budget: 'ALL' });
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
        <select className="bp-input bp-input--sm" value={filter.budget} aria-label={t('buddiesPage.budget')}
          onChange={(e) => setFilter((f) => ({ ...f, budget: e.target.value as BuddyBudget | 'ALL' }))}>
          <option value="ALL">{t('buddiesPage.allBudgets')}</option>
          {BUDGETS.map((b) => <option key={b} value={b}>{t(`buddiesPage.bud.${b}`)}</option>)}
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
  const status = statusOf(r);
  const joined = isParticipant(r, CURRENT_UID);
  const owner = canManage(r, CURRENT_UID);
  const left = spotsLeft(r);

  function join() { if (!isAuthenticated) { openAuth(); return; } void buddiesActions.join(r.id); }

  return (
    <article className="bp-buddy-card">
      <div className="bp-buddy-card__top">
        <span className={`bp-badge ${r.category === 'FAMILIES' ? 'bp-badge--green' : 'bp-badge--blue'}`}>{t(`buddiesPage.cat.${r.category}`)}</span>
        <span className={`bp-status-chip ${status === 'OPEN' ? 'bp-status-chip--ok' : ''}`}>{t(`buddiesPage.status.${status}`)}</span>
      </div>
      <h3 className="bp-buddy-card__title">{r.title}</h3>
      <p className="bp-buddy-card__meta">
        <span className="material-symbols-outlined" aria-hidden="true">location_on</span>{r.city}
        <span className="bp-sep" aria-hidden="true">·</span>
        <span className="material-symbols-outlined" aria-hidden="true">payments</span>{t(`buddiesPage.bud.${r.budget}`)}
      </p>
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
  const [title, setTitle] = useState('');
  const [city, setCity] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [category, setCategory] = useState<BuddyCategory>('GENERAL');
  const [budget, setBudget] = useState<BuddyBudget>('MEDIUM');
  const [capacity, setCapacity] = useState('4');
  const [description, setDescription] = useState('');

  async function submit() {
    if (!title.trim() || !city.trim() || !dateFrom) return;
    const ok = await buddiesActions.create({
      kind, title, city, dateFrom, dateTo: dateTo || dateFrom, category, budget,
      capacity: Number(capacity) || 1, description,
    });
    if (ok) onClose();
  }

  return (
    <div className="bp-create-buddy">
      <h3 className="bp-panel__h">{t('buddiesPage.newTitle')}</h3>
      <input className="bp-input" value={title} placeholder={t('buddiesPage.titlePh')} aria-label={t('buddiesPage.titleLabel')} onChange={(e) => setTitle(e.target.value)} />
      <div className="bp-grid-2">
        <input className="bp-input" value={city} placeholder={t('buddiesPage.city')} aria-label={t('buddiesPage.city')} onChange={(e) => setCity(e.target.value)} />
        <input className="bp-input" type="number" min="1" value={capacity} aria-label={t('buddiesPage.capacity')} onChange={(e) => setCapacity(e.target.value)} />
        <input className="bp-input" type="date" value={dateFrom} aria-label={t('trips.fromLabel')} onChange={(e) => setDateFrom(e.target.value)} />
        <input className="bp-input" type="date" value={dateTo} aria-label={t('trips.toLabel')} onChange={(e) => setDateTo(e.target.value)} />
        <select className="bp-input" value={category} aria-label={t('buddiesPage.category')} onChange={(e) => setCategory(e.target.value as BuddyCategory)}>
          {CATEGORIES.map((c) => <option key={c} value={c}>{t(`buddiesPage.cat.${c}`)}</option>)}
        </select>
        <select className="bp-input" value={budget} aria-label={t('buddiesPage.budget')} onChange={(e) => setBudget(e.target.value as BuddyBudget)}>
          {BUDGETS.map((b) => <option key={b} value={b}>{t(`buddiesPage.bud.${b}`)}</option>)}
        </select>
      </div>
      <textarea className="bp-input" value={description} placeholder={t('buddiesPage.descPh')} aria-label={t('buddiesPage.description')} rows={3} onChange={(e) => setDescription(e.target.value)} />
      <div className="bp-row-between">
        <button className="bp-btn bp-btn--primary" onClick={submit}>{t('buddiesPage.publish')}</button>
        <button className="bp-btn bp-btn--outline" onClick={onClose}>{t('trips.close')}</button>
      </div>
    </div>
  );
}
