import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@boardingpass/core';
import { useUIStore } from '@/app/store/uiStore';
import { currentUid, firebaseEnabled } from '@/shared/firebase';
import { CURRENT_UID } from '@/features/members/membersService';
import { setMockCurrentUser } from './expensesService';
import { uploadTripImage } from '@/features/memories/memoriesService';
import { useMembers } from '@/features/members/membersStore';
import {
  CATEGORIES, POT_UID, convert, distribution, memberBreakdown, myNetBalance,
  personalRemaining, personalSpent, potStatus, settledLedger, settlements, fixedKitty,
  type Category, type Finance, type GroupExpense, type KittyMode, type PersonalExpense, type SideKitty,
} from './finance';
import { expensesActions, useFinance } from './expensesStore';
import { formatIban, normalizeIban } from '@/features/profile/profileModel';
import { BankBadge } from '@/shared/BankBadge';
import { KebabMenu } from '@/shared/KebabMenu';
import { APP_FEE_PCT, APP_IBAN, appFee } from '@/shared/appFee';
import { SAR_PER_UNIT, defaultRate, unitPrice } from '@/shared/fxDefaults';
import { IbanNudge } from '@/features/members/IbanNudge';

type Sub = 'kitty' | 'personal' | 'summary';
const SUBS: { key: Sub; label: string }[] = [
  { key: 'kitty', label: 'expenses.kitty' },
  { key: 'personal', label: 'expenses.personal' },
  { key: 'summary', label: 'expenses.summary' },
];

/** Money formatter pair: the base currency, and (when the trip has a second
 *  currency) the same amount converted, shown next to it ("≈ €92"). */
type Fmt = (n: number) => string;
type Fmt2 = (n: number) => string | null;

export function ExpensesTab({ tripId, canEdit, isOwner, base, dest }: { tripId: string; canEdit: boolean; isOwner: boolean; base?: string; dest?: string }) {
  const { t } = useTranslation();
  const { members } = useMembers();
  const { finance, loading, error } = useFinance();
  const [sub, setSub] = useState<Sub>('kitty');

  const baseCur = base || 'SAR';
  // The trip's own destination currency seeds the finance record; after that
  // the record (editable by the owner here) is the source of truth.
  const tripDest = dest && dest !== baseCur ? dest : undefined;
  const destCur = finance ? (finance.dest && finance.dest !== baseCur ? finance.dest : undefined) : tripDest;
  const rate = finance?.rate ?? defaultRate(baseCur, tripDest ?? baseCur);

  const active = useMemo(() => (members ?? []).filter((m) => m.status === 'ACTIVE'), [members]);
  const memberUids = useMemo(() => active.map((m) => m.uid), [active]);
  const nameOf = useMemo(() => {
    const map: Record<string, string> = {};
    active.forEach((m) => { map[m.uid] = m.displayName; });
    return (uid: string) => map[uid] ?? uid;
  }, [active]);
  // Where each member receives transfers (set by them on joining the trip).
  const ibanOf = useMemo(() => {
    const map: Record<string, string> = {};
    active.forEach((m) => { if (m.iban) map[m.uid] = m.iban; });
    return (uid: string): string | undefined => map[uid];
  }, [active]);

  const meUid = firebaseEnabled() ? (currentUid() ?? CURRENT_UID) : CURRENT_UID;
  // The trip owner holds the fixed pot: contributions sit with them and
  // pot-paid expenses are paid by them out of that money.
  const holderUid = active.find((m) => m.role === 'OWNER')?.uid ?? active[0]?.uid;
  const uidsKey = memberUids.join(',');
  useEffect(() => {
    if (memberUids.length === 0) return;
    setMockCurrentUser(tripId, meUid); // self-scoped personal writes (mock)
    void expensesActions.load(tripId, { memberUids, base: baseCur, dest: tripDest ?? baseCur, rate: defaultRate(baseCur, tripDest ?? baseCur) }, meUid);
    return () => expensesActions.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId, uidsKey]);

  const locale = useUIStore((s) => s.locale);
  const fmt = useMemo<Fmt>(() => (b: number) => formatCurrency(b, baseCur, locale), [locale, baseCur]);
  const fmt2 = useMemo<Fmt2>(() => (b: number) => (destCur ? `≈ ${formatCurrency(convert(b, true, rate), destCur, locale)}` : null), [locale, destCur, rate]);

  if (loading && finance === null) return <p className="bp-page__lead">…</p>;
  if (!finance) return <p className="bp-page__lead">{t('expenses.needMembers')}</p>;

  return (
    <div className="bp-expenses">
      <CurrencyBar baseCur={baseCur} destCur={destCur} rate={rate} isOwner={isOwner} />

      {error && <div className="bp-banner" role="alert">{t('expenses.saveFailed')}</div>}

      <div className="bp-subtabs2" role="tablist" aria-label={t('tripDetail.tabExpenses')}>
        {SUBS.map((s) => (
          <button key={s.key} role="tab" aria-selected={sub === s.key} className={`bp-subtab2 ${sub === s.key ? 'is-on' : ''}`} onClick={() => setSub(s.key)}>
            {t(s.label)}
          </button>
        ))}
      </div>

      {sub === 'kitty' && <KittyPanel tripId={tripId} finance={finance} memberUids={memberUids} active={active} nameOf={nameOf} fmt={fmt} fmt2={fmt2} canEdit={canEdit} isOwner={isOwner} baseCur={baseCur} destCur={destCur} rate={rate} holderUid={holderUid} meUid={meUid} onShowSummary={() => setSub('summary')} />}
      {sub === 'personal' && <PersonalPanel finance={finance} fmt={fmt} fmt2={fmt2} canEdit={canEdit} />}
      {sub === 'summary' && <SummaryPanel tripId={tripId} finance={finance} memberUids={memberUids} nameOf={nameOf} ibanOf={ibanOf} fmt={fmt} fmt2={fmt2} meUid={meUid} holderUid={holderUid} />}
    </div>
  );
}

/** Destination currency + rate ("1 EUR = 4.10 SAR"), set by the owner; every
 *  amount is then shown in both currencies. */
function CurrencyBar({ baseCur, destCur, rate, isOwner }: { baseCur: string; destCur?: string; rate: number; isOwner: boolean }) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [dest, setDest] = useState(destCur ?? '');
  const [price, setPrice] = useState(destCur ? String(unitPrice(rate)) : '');
  const [busy, setBusy] = useState(false);
  const options = Object.keys(SAR_PER_UNIT).filter((c) => c !== baseCur);
  if (destCur && !options.includes(destCur)) options.unshift(destCur);

  function pickDest(v: string) {
    setDest(v);
    setPrice(v ? String(unitPrice(defaultRate(baseCur, v))) : '');
  }
  async function save() {
    setBusy(true);
    try {
      if (!dest) await expensesActions.setCurrency(baseCur, 1);
      else {
        const p = Number(price) > 0 ? Number(price) : unitPrice(defaultRate(baseCur, dest));
        await expensesActions.setCurrency(dest, Math.round((1 / p) * 10000) / 10000);
      }
      setEditing(false);
    } finally { setBusy(false); }
  }

  if (!destCur && !isOwner) return null;
  if (!editing) {
    return (
      <div className="bp-fxbar">
        {destCur
          ? <span className="bp-fxbar__chip">💱 {t('expenses.fxRate', { dest: destCur, price: unitPrice(rate), base: baseCur })}</span>
          : <span className="bp-note">{t('expenses.fxTitle')}: {t('expenses.fxNone')}</span>}
        {isOwner && (
          <button type="button" className="bp-link bp-fxbar__edit" onClick={() => { setDest(destCur ?? ''); setPrice(destCur ? String(unitPrice(rate)) : ''); setEditing(true); }}>
            {destCur ? t('expenses.edit') : t('expenses.fxTitle')}
          </button>
        )}
      </div>
    );
  }
  return (
    <div className="bp-fxbar bp-fxbar--edit" role="group" aria-label={t('expenses.fxTitle')}>
      <div className="bp-field">
        <label htmlFor="bp-fx-dest">{t('expenses.fxTitle')}</label>
        <select id="bp-fx-dest" className="bp-input" value={dest} onChange={(e) => pickDest(e.target.value)}>
          <option value="">{t('expenses.fxNone')}</option>
          {options.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      {dest && (
        <div className="bp-field">
          <label htmlFor="bp-fx-price">{t('expenses.fxRateLabel', { base: baseCur, dest })}</label>
          <input id="bp-fx-price" className="bp-input" type="number" min="0" step="0.0001" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
        </div>
      )}
      <p className="bp-note">{t('expenses.fxNote')}</p>
      <div className="bp-fxbar__actions">
        <button type="button" className="bp-btn bp-btn--primary bp-btn--sm" disabled={busy} onClick={save}>{busy ? t('expenses.saving') : t('expenses.fxSave')}</button>
        <button type="button" className="bp-btn bp-btn--outline bp-btn--sm" disabled={busy} onClick={() => setEditing(false)}>{t('trips.close')}</button>
      </div>
    </div>
  );
}

function Bar({ pct }: { pct: number }) {
  return <div className="bp-progress"><div className="bp-progress__bar" style={{ inlineSize: `${Math.max(0, Math.min(100, pct))}%` }} /></div>;
}

/** The kitty, in one of two clear shapes:
 *  FIXED — a pot amount is set up front, every member pays an equal share into
 *          it (held by the trip owner), and shared expenses are DRAWN FROM THE
 *          POT or paid by a member directly. The final settlement is on what
 *          was actually spent: share of real spend − (paid into the pot + paid
 *          directly), so an overspent pot is split and an underspent one is
 *          refunded.
 *  OPEN  — no pot. Whoever pays an expense says who it was for, and it is
 *          split among exactly those people (default: everyone). */
function KittyPanel({ tripId, finance, memberUids, active, nameOf, fmt, fmt2, canEdit, isOwner, baseCur, destCur, rate, holderUid, meUid, onShowSummary }: {
  tripId: string; finance: Finance; memberUids: string[]; active: { uid: string; displayName: string }[]; nameOf: (u: string) => string;
  fmt: Fmt; fmt2: Fmt2; canEdit: boolean; isOwner: boolean; baseCur: string; destCur?: string; rate: number; holderUid?: string; meUid: string;
  onShowSummary: () => void;
}) {
  const { t } = useTranslation();
  const mode: KittyMode = finance.kittyMode ?? 'FIXED';
  const [total, setTotal] = useState(String(finance.kittyTotal || ''));
  const pot = potStatus(finance, memberUids);
  const dist = distribution(finance.group, finance.sides);
  const distTotal = CATEGORIES.reduce((a, c) => a + dist[c], 0);
  const entries = finance.group.length + finance.sides.length;
  // Nothing set up yet (no pot amount, no expenses): show the 3-step starter
  // instead of a wall of zero tiles and buttons that can't do anything yet.
  const potSet = pot.total > 0;
  const fresh = entries === 0 && !potSet;
  const uneven = Math.round(pot.total * 100) % Math.max(1, memberUids.length) !== 0;
  const focusEl = (id: string) => { const el = document.getElementById(id); el?.scrollIntoView({ block: 'center', behavior: 'smooth' }); el?.focus(); };

  return (
    <div className="bp-panel">
      {isOwner && (
        <div className="bp-seg bp-seg--full" role="group" aria-label={t('expenses.kittyMode')}>
          <button type="button" className={`bp-seg__btn ${mode === 'FIXED' ? 'is-on' : ''}`} aria-pressed={mode === 'FIXED'} onClick={() => expensesActions.setKittyMode('FIXED')}>{t('expenses.kittyFixed')}</button>
          <button type="button" className={`bp-seg__btn ${mode === 'OPEN' ? 'is-on' : ''}`} aria-pressed={mode === 'OPEN'} onClick={() => expensesActions.setKittyMode('OPEN')}>{t('expenses.kittyOpen')}</button>
        </div>
      )}
      <p className="bp-note">{mode === 'OPEN' ? t('expenses.kittyOpenNote') : t('expenses.kittyFixedNote')}</p>

      {fresh && (
        <ol className="bp-starter" aria-label={t('expenses.starterTitle')}>
          <li className={`bp-starter__step ${mode === 'OPEN' ? 'is-done' : ''}`}>
            <span className="bp-starter__n" aria-hidden="true">{mode === 'OPEN' ? '✓' : '1'}</span>
            {mode === 'OPEN'
              ? <span>{t('expenses.starterOpenDone')}</span>
              : isOwner
                ? <button type="button" className="bp-link" onClick={() => focusEl('bp-kitty-total')}>{t('expenses.starterSetTotal')}</button>
                : <span>{t('expenses.starterWaitOwner')}</span>}
          </li>
          <li className={`bp-starter__step ${memberUids.length > 1 ? 'is-done' : ''}`}>
            <span className="bp-starter__n" aria-hidden="true">{memberUids.length > 1 ? '✓' : '2'}</span>
            <a className="bp-link" href="#members">{t('expenses.starterInvite')}</a>
          </li>
          <li className="bp-starter__step">
            <span className="bp-starter__n" aria-hidden="true">3</span>
            {canEdit ? <button type="button" className="bp-link" onClick={() => focusEl('bp-exp-desc')}>{t('expenses.starterFirstExpense')}</button> : <span>{t('expenses.starterFirstExpense')}</span>}
          </li>
        </ol>
      )}

      {mode === 'FIXED' && (
        <>
          {isOwner && (
            <div className="bp-add-row">
              <div className="bp-field" style={{ flex: 1 }}>
                <label htmlFor="bp-kitty-total">{t('expenses.kittyTotal')}</label>
                <input id="bp-kitty-total" className="bp-input" type="number" min="0" inputMode="decimal" value={total}
                  onChange={(e) => setTotal(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); expensesActions.setKittyTotal(Number(total) || 0); } }} />
              </div>
              <button className="bp-btn bp-btn--primary bp-btn--sm" style={{ alignSelf: 'end' }} disabled={!(Number(total) > 0)} onClick={() => expensesActions.setKittyTotal(Number(total) || 0)}>{t('expenses.setTotal')}</button>
            </div>
          )}
          {/* Pot figures and dues only once there is a pot to talk about. */}
          {potSet && (
            <>
              <div className="bp-stat-row">
                <Stat label={t('expenses.total')} value={fmt(pot.total)} sub={fmt2(pot.total)} />
                <Stat label={t('expenses.perHead')} value={`${uneven ? '≈ ' : ''}${fmt(pot.due)}`} sub={fmt2(pot.due)} />
                <Stat label={t('expenses.collected')} value={fmt(pot.collected)} sub={pot.uncollected > 0 ? t('expenses.potUncollected', { amount: fmt(pot.uncollected) }) : fmt2(pot.collected)} />
              </div>
              <div className="bp-stat-row">
                <Stat label={t('expenses.spentFromPot')} value={fmt(pot.spent)} sub={fmt2(pot.spent)} />
                <Stat label={t('expenses.remaining')} value={fmt(pot.remaining)} sub={t('expenses.remainingHint')} tone={pot.remaining < 0 ? 'neg' : undefined} />
              </div>
              <Bar pct={pot.collected > 0 ? (pot.spent / pot.collected) * 100 : 0} />
              {pot.shortfall > 0 && (
                <div className="bp-note bp-note--warn bp-shortfall" role="status">
                  <p>{t('expenses.potOverdrawn', { amount: fmt(pot.shortfall), holder: nameOf(holderUid ?? ''), each: fmt(pot.shortfall / Math.max(1, memberUids.length)) })}</p>
                  <button type="button" className="bp-btn bp-btn--outline bp-btn--sm" onClick={onShowSummary}>{t('expenses.potSeeSettlement')}</button>
                </div>
              )}
              {uneven && <p className="bp-note">{t('expenses.perHeadApprox', { amount: fmt(pot.due) })}</p>}

              {/* Everyone's exact share into the pot, confirmed by the owner. */}
              <h4 className="bp-panel__h">{t('expenses.dues')}</h4>
              <ul className="bp-pay-list" role="list">
                {memberUids.map((u) => (
                  <li key={u} className="bp-pay">
                    <span className="bp-pay__name">{nameOf(u)}</span>
                    <span className="bp-pay__due" title={t('expenses.transferExact')}>{fmt(pot.dues[u] ?? 0)}{fmt2(pot.dues[u] ?? 0) && <small className="bp-amt2">{fmt2(pot.dues[u] ?? 0)}</small>}</span>
                    {finance.paid[u]
                      ? <span className="bp-status-chip bp-status-chip--ok">{t('expenses.paid')}</span>
                      : <span className="bp-status-chip">{t('expenses.pending')}</span>}
                    {isOwner && (
                      <button className="bp-btn bp-btn--outline bp-btn--sm" disabled={!(pot.dues[u] > 0)} onClick={() => expensesActions.markPaid(u, !finance.paid[u])}>
                        {finance.paid[u] ? t('expenses.markPending') : t('expenses.confirmPaid')}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}

      {mode === 'OPEN' && entries === 0 && !fresh && <p className="bp-note">{t('expenses.openHint')}</p>}

      {distTotal > 0 && (
        <>
          <h4 className="bp-panel__h">{t('expenses.distribution')}</h4>
          {CATEGORIES.map((c) => dist[c] > 0 && (
            <div key={c} className="bp-dist-row">
              <span className="bp-dist-row__label">{t(`expenses.cat.${c}`)}</span>
              <Bar pct={(dist[c] / distTotal) * 100} />
              <span className="bp-dist-row__val">{fmt(dist[c])}</span>
            </div>
          ))}
        </>
      )}

      <h4 className="bp-panel__h">{mode === 'FIXED' ? t('expenses.potLog') : t('expenses.groupLog')}</h4>
      <ul className="bp-exp-list" role="list">
        {finance.group.map((e) => (
          <GroupRow key={e.id} e={e} memberUids={memberUids} nameOf={nameOf} fmt={fmt} fmt2={fmt2} canEdit={canEdit} mode={mode} holderUid={holderUid} />
        ))}
        {finance.sides.map((s) => (
          <SideRow key={s.id} s={s} memberCount={memberUids.length} nameOf={nameOf} fmt={fmt} fmt2={fmt2} canEdit={canEdit} />
        ))}
        {entries === 0 && <li className="bp-members__empty">{t('expenses.noGroup')}</li>}
      </ul>
      {canEdit && <AddShared tripId={tripId} mode={mode} memberUids={memberUids} active={active} nameOf={nameOf} baseCur={baseCur} destCur={destCur} rate={rate} holderUid={holderUid} meUid={meUid} />}
    </div>
  );
}

/** Row ⋮ menu: edit (when offered) + delete behind a confirm. */
function RowMenu({ onEdit, onDelete }: { onEdit?: () => void; onDelete: () => void | Promise<void> }) {
  const { t } = useTranslation();
  return (
    <KebabMenu size="xs" label={t('menu.more')} items={[
      ...(onEdit ? [{ key: 'edit', label: t('expenses.edit'), icon: 'edit', onSelect: onEdit }] : []),
      { key: 'del', label: t('expenses.delete'), icon: 'delete', danger: true, confirm: t('expenses.confirmDeleteExpense'), onSelect: onDelete },
    ]} />
  );
}

/** A shared expense among a subset of members (OPEN kitty), or a legacy side kitty. */
function SideRow({ s, memberCount, nameOf, fmt, fmt2, canEdit }: {
  s: SideKitty; memberCount: number; nameOf: (u: string) => string; fmt: Fmt; fmt2: Fmt2; canEdit: boolean;
}) {
  const { t } = useTranslation();
  const share = s.total / s.participantUids.length; // exact; display rounds
  const everyone = s.participantUids.length === memberCount;
  return (
    <li className="bp-exp bp-exp--side">
      <span className="bp-exp__desc">{s.title}</span>
      {s.category && <span className="bp-chip bp-chip--cat">{t(`expenses.cat.${s.category}`)}</span>}
      <span className="bp-exp__by">{nameOf(s.payerUid)}</span>
      <span className="bp-exp__amt">{fmt(s.total)}{fmt2(s.total) && <small className="bp-amt2">{fmt2(s.total)}</small>}</span>
      {(s.receiptUrls ?? []).map((url, i) => (
        <a key={i} className="bp-icon-btn bp-icon-btn--xs" href={url} target="_blank" rel="noopener noreferrer" aria-label={t('expenses.viewReceipt')}>
          <span className="material-symbols-outlined" aria-hidden="true">receipt_long</span>
        </a>
      ))}
      {s.settled && <span className="bp-status-chip bp-status-chip--ok">{t('expenses.settled')}</span>}
      {canEdit && !s.settled && <button className="bp-btn bp-btn--outline bp-btn--sm" onClick={() => expensesActions.settleSide(s.id)}>{t('expenses.settle')}</button>}
      {canEdit && <RowMenu onDelete={() => expensesActions.deleteSide(s.id)} />}
      <span className="bp-exp__meta">
        {everyone ? t('expenses.everyone') : s.participantUids.map(nameOf).join('، ')} · {t('expenses.share')}: {fmt(share)}
      </span>
    </li>
  );
}

function GroupRow({ e, memberUids, nameOf, fmt, fmt2, canEdit, mode, holderUid }: {
  e: GroupExpense; memberUids: string[]; nameOf: (u: string) => string; fmt: Fmt; fmt2: Fmt2; canEdit: boolean; mode: KittyMode; holderUid?: string;
}) {
  const { t } = useTranslation();
  const fromPot = e.payerUid === POT_UID;
  const who = (u: string) => (u === POT_UID ? t('expenses.potPaid') : nameOf(u));
  const [editing, setEditing] = useState(false);
  const [desc, setDesc] = useState(e.desc);
  const [cat, setCat] = useState<Category>(e.category);
  const [amount, setAmount] = useState(String(e.amount));
  const [payer, setPayer] = useState(e.payerUid);

  function start() { setDesc(e.desc); setCat(e.category); setAmount(String(e.amount)); setPayer(e.payerUid); setEditing(true); }
  async function save() {
    const a = Number(amount);
    if (!desc.trim() || !(a > 0)) return;
    await expensesActions.updateGroup(e.id, { desc, category: cat, amount: a, payerUid: payer });
    setEditing(false);
  }

  if (editing) {
    return (
      <li className="bp-exp-form">
        <input className="bp-input" value={desc} aria-label={t('expenses.desc')} onChange={(ev) => setDesc(ev.target.value)} />
        <select className="bp-input" value={cat} aria-label={t('expenses.category')} onChange={(ev) => setCat(ev.target.value as Category)}>
          {CATEGORIES.map((c) => <option key={c} value={c}>{t(`expenses.cat.${c}`)}</option>)}
        </select>
        <input className="bp-input" type="number" min="0" step="0.01" value={amount} aria-label={t('expenses.amount')} onChange={(ev) => setAmount(ev.target.value)} style={{ maxInlineSize: 120 }} />
        <select className="bp-input" value={payer} aria-label={t('expenses.payerLabel')} onChange={(ev) => setPayer(ev.target.value)}>
          {(mode === 'FIXED' || fromPot) && <option value={POT_UID}>{holderUid ? t('expenses.potPaidBy', { holder: nameOf(holderUid) }) : t('expenses.potPaid')}</option>}
          {memberUids.map((u) => <option key={u} value={u}>{nameOf(u)}</option>)}
        </select>
        <button className="bp-btn bp-btn--primary bp-btn--sm" onClick={save}>{t('expenses.saveEdit')}</button>
        <button className="bp-btn bp-btn--outline bp-btn--sm" onClick={() => setEditing(false)}>{t('trips.close')}</button>
      </li>
    );
  }
  return (
    <li className="bp-exp">
      <span className="bp-exp__desc">{e.desc}</span>
      <span className="bp-chip bp-chip--cat">{t(`expenses.cat.${e.category}`)}</span>
      <span className={`bp-exp__by ${fromPot ? 'bp-exp__by--pot' : ''}`}>{who(e.payerUid)}</span>
      <span className="bp-exp__amt">{fmt(e.amount)}{fmt2(e.amount) && <small className="bp-amt2">{fmt2(e.amount)}</small>}</span>
      {(e.receiptUrls ?? (e.receiptUrl ? [e.receiptUrl] : [])).map((url, i) => (
        <a key={i} className="bp-icon-btn bp-icon-btn--xs" href={url} target="_blank" rel="noopener noreferrer" aria-label={t('expenses.viewReceipt')}>
          <span className="material-symbols-outlined" aria-hidden="true">receipt_long</span>
        </a>
      ))}
      {canEdit && <button className="bp-icon-btn bp-icon-btn--xs" aria-label={t('expenses.edit')} onClick={start}><span className="material-symbols-outlined" aria-hidden="true">edit</span></button>}
      {canEdit && <RowMenu onDelete={() => expensesActions.deleteGroup(e.id)} />}
    </li>
  );
}

/** Add a shared expense.
 *  FIXED: description, category, amount, who paid (the pot by default, or a
 *         member who paid out of pocket).
 *  OPEN:  + who paid and who it was for (default: everyone) → split among them. */
function AddShared({ tripId, mode, memberUids, active, nameOf, baseCur, destCur, rate, holderUid, meUid }: {
  tripId: string; mode: KittyMode; memberUids: string[]; active: { uid: string; displayName: string }[]; nameOf: (u: string) => string;
  baseCur: string; destCur?: string; rate: number; holderUid?: string; meUid: string;
}) {
  const { t } = useTranslation();
  const [desc, setDesc] = useState('');
  const [cat, setCat] = useState<Category | ''>('');  // required — no silent default
  const [catErr, setCatErr] = useState(false);
  const [amount, setAmount] = useState('');
  const [cur, setCur] = useState(baseCur);
  const [payer, setPayer] = useState<string>(mode === 'FIXED' ? POT_UID : (memberUids.includes(meUid) ? meUid : memberUids[0] ?? CURRENT_UID));
  const [parts, setParts] = useState<string[]>(memberUids);
  const [receipts, setReceipts] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const uidsKey = memberUids.join(',');
  useEffect(() => { setParts(memberUids); }, [uidsKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setPayer(mode === 'FIXED' ? POT_UID : (memberUids.includes(meUid) ? meUid : memberUids[0] ?? CURRENT_UID)); }, [mode, uidsKey, meUid]); // eslint-disable-line react-hooks/exhaustive-deps
  const everyone = parts.length === memberUids.length;

  function toggle(uid: string) {
    setParts((p) => (p.includes(uid) ? p.filter((x) => x !== uid) : [...p, uid]));
  }
  // Amount is entered in the chosen currency; store it in the base currency.
  function toBase(a: number): number {
    return destCur && cur === destCur && rate > 0 ? Math.round((a / rate) * 100) / 100 : a;
  }
  async function submit() {
    const a = Number(amount);
    if (!desc.trim() || !(a > 0)) return;
    if (!cat) { setCatErr(true); return; }
    if (mode === 'OPEN' && parts.length === 0) return;
    const amt = toBase(a);
    setBusy(true);
    try {
      let receiptUrls: string[] | undefined;
      if (receipts.length > 0) {
        const urls: string[] = [];
        for (const f of receipts) { try { urls.push(await uploadTripImage(tripId, f)); } catch { /* keep the expense even if a photo fails */ } }
        if (urls.length) receiptUrls = urls;
      }
      if (mode === 'FIXED' || everyone) {
        await expensesActions.addGroup({ desc, category: cat, amount: amt, payerUid: payer, receiptUrls });
      } else {
        const p = payer === POT_UID ? memberUids[0] : payer;
        await expensesActions.addSide({ title: desc, participantUids: parts, total: amt, payerUid: p, category: cat, receiptUrls });
      }
      setDesc(''); setAmount(''); setReceipts([]); setParts(memberUids); setCat(''); setCatErr(false);
    } finally { setBusy(false); }
  }

  return (
    <div className="bp-addexp">
      <p className="bp-field__label">{mode === 'FIXED' ? t('expenses.addFromPot') : t('expenses.addShared')}</p>
      <div className="bp-exp-form">
        <input id="bp-exp-desc" className="bp-input" value={desc} placeholder={t('expenses.descPh')} aria-label={t('expenses.desc')} onChange={(e) => setDesc(e.target.value)} />
        <select className={`bp-input ${catErr ? 'is-invalid' : ''}`} value={cat} aria-label={t('expenses.category')} aria-invalid={catErr || undefined} required
          onChange={(e) => { setCat(e.target.value as Category | ''); setCatErr(false); }}>
          <option value="" disabled>{t('expenses.catPick')}</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{t(`expenses.cat.${c}`)}</option>)}
        </select>
        <input className="bp-input" type="number" min="0" step="0.01" value={amount} placeholder={t('expenses.amountPh')} aria-label={t('expenses.amount')} onChange={(e) => setAmount(e.target.value)} style={{ maxInlineSize: 120 }} />
        {destCur && (
          <select className="bp-input" value={cur} aria-label={t('expenses.currency')} onChange={(e) => setCur(e.target.value)} style={{ maxInlineSize: 90 }}>
            <option value={baseCur}>{baseCur}</option>
            <option value={destCur}>{destCur}</option>
          </select>
        )}
        <select className="bp-input" value={payer} aria-label={t('expenses.payerLabel')} onChange={(e) => setPayer(e.target.value)}>
          {mode === 'FIXED' && <option value={POT_UID}>{holderUid ? t('expenses.potPaidBy', { holder: nameOf(holderUid) }) : t('expenses.potPaid')}</option>}
          {memberUids.map((u) => <option key={u} value={u}>{nameOf(u)}</option>)}
        </select>
        <button className="bp-btn bp-btn--outline bp-btn--sm" disabled={busy} onClick={submit}>{busy ? t('expenses.saving') : t('expenses.add')}</button>
      </div>
      {catErr && <p className="bp-field__error" role="alert">{t('expenses.catRequired')}</p>}

      {mode === 'OPEN' && (
        <fieldset className="bp-parts">
          <legend>{t('expenses.withWho')}</legend>
          <label className="bp-check bp-check--all">
            <input type="checkbox" checked={everyone} onChange={() => setParts(everyone ? [payer] : memberUids)} />{t('expenses.everyone')}
          </label>
          {active.map((m) => (
            <label key={m.uid} className="bp-check">
              <input type="checkbox" checked={parts.includes(m.uid)} onChange={() => toggle(m.uid)} />{m.displayName}
            </label>
          ))}
        </fieldset>
      )}

      <label className="bp-receipt">
        <span className="material-symbols-outlined" aria-hidden="true">photo_camera</span>
        <span>{receipts.length > 0 ? t('expenses.receiptsCount', { count: receipts.length }) : t('expenses.attachReceipt')}</span>
        <input type="file" accept="image/*" multiple className="bp-vh" aria-label={t('expenses.attachReceipt')}
          onChange={(e) => { setReceipts(Array.from(e.target.files ?? [])); e.target.value = ''; }} />
      </label>
    </div>
  );
}

function PersonalRow({ e, fmt, fmt2, canEdit }: { e: PersonalExpense; fmt: Fmt; fmt2: Fmt2; canEdit: boolean }) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [desc, setDesc] = useState(e.desc);
  const [amount, setAmount] = useState(String(e.amount));

  async function save() {
    const a = Number(amount);
    if (!desc.trim() || !(a > 0)) return;
    await expensesActions.updatePersonal(e.id, { desc, amount: a });
    setEditing(false);
  }

  if (editing) {
    return (
      <li className="bp-exp-form">
        <input className="bp-input" value={desc} aria-label={t('expenses.desc')} onChange={(ev) => setDesc(ev.target.value)} />
        <input className="bp-input" type="number" min="0" step="0.01" value={amount} aria-label={t('expenses.amount')} onChange={(ev) => setAmount(ev.target.value)} style={{ maxInlineSize: 120 }} />
        <button className="bp-btn bp-btn--primary bp-btn--sm" onClick={save}>{t('expenses.saveEdit')}</button>
        <button className="bp-btn bp-btn--outline bp-btn--sm" onClick={() => setEditing(false)}>{t('trips.close')}</button>
      </li>
    );
  }
  return (
    <li className="bp-exp">
      <span className="bp-exp__desc">{e.desc}</span>
      <span className="bp-exp__amt">{fmt(e.amount)}{fmt2(e.amount) && <small className="bp-amt2">{fmt2(e.amount)}</small>}</span>
      {canEdit && <button className="bp-icon-btn bp-icon-btn--xs" aria-label={t('expenses.edit')} onClick={() => { setDesc(e.desc); setAmount(String(e.amount)); setEditing(true); }}><span className="material-symbols-outlined" aria-hidden="true">edit</span></button>}
      {canEdit && <RowMenu onDelete={() => expensesActions.deletePersonal(e.id)} />}
    </li>
  );
}

function PersonalPanel({ finance, fmt, fmt2, canEdit }: { finance: Finance; fmt: Fmt; fmt2: Fmt2; canEdit: boolean }) {
  const { t } = useTranslation();
  const [budget, setBudget] = useState(String(finance.personalBudget || ''));
  const [desc, setDesc] = useState('');
  const [amount, setAmount] = useState('');
  const spent = personalSpent(finance.personal);
  const remaining = personalRemaining(finance.personalBudget, finance.personal);

  async function add() {
    const a = Number(amount);
    if (!desc.trim() || !(a > 0)) return;
    await expensesActions.addPersonal({ desc, amount: a });
    setDesc(''); setAmount('');
  }
  return (
    <div className="bp-panel">
      <p className="bp-note">{t('expenses.personalPrivate')}</p>
      {canEdit && (
        <div className="bp-add-row">
          <div className="bp-field" style={{ flex: 1 }}>
            <label htmlFor="bp-pbudget">{t('expenses.budget')}</label>
            <input id="bp-pbudget" className="bp-input" type="number" min="0" value={budget} onChange={(e) => setBudget(e.target.value)} />
          </div>
          <button className="bp-btn bp-btn--primary bp-btn--sm" style={{ alignSelf: 'end' }} onClick={() => expensesActions.setPersonalBudget(Number(budget) || 0)}>{t('expenses.setBudget')}</button>
        </div>
      )}
      <div className="bp-stat-row">
        <Stat label={t('expenses.budget')} value={fmt(finance.personalBudget)} sub={fmt2(finance.personalBudget)} />
        <Stat label={t('expenses.spent')} value={fmt(spent)} sub={fmt2(spent)} />
        <Stat label={t('expenses.remaining')} value={fmt(remaining)} sub={fmt2(remaining)} />
      </div>
      <ul className="bp-exp-list" role="list">
        {finance.personal.map((e) => (
          <PersonalRow key={e.id} e={e} fmt={fmt} fmt2={fmt2} canEdit={canEdit} />
        ))}
        {finance.personal.length === 0 && <li className="bp-members__empty">{t('expenses.noPersonal')}</li>}
      </ul>
      {canEdit && (
        <div className="bp-exp-form">
          <input className="bp-input" value={desc} placeholder={t('expenses.descPh')} aria-label={t('expenses.desc')} onChange={(e) => setDesc(e.target.value)} />
          <input className="bp-input" type="number" min="0" step="0.01" value={amount} placeholder={t('expenses.amountPh')} aria-label={t('expenses.amount')} onChange={(e) => setAmount(e.target.value)} style={{ maxInlineSize: 120 }} />
          <button className="bp-btn bp-btn--outline bp-btn--sm" onClick={add}>{t('expenses.add')}</button>
        </div>
      )}
    </div>
  );
}

/** Line-by-line derivation of one member's balance, so it can be checked by
 *  hand: shared spend ÷ people = share, what they paid (directly or into the
 *  pot), what the holder received into the pot; then paid − shares = net. */
function Breakdown({ finance, memberUids, u, fmt, shown, holderUid }: { finance: Finance; memberUids: string[]; u: string; fmt: Fmt; shown: number; holderUid?: string }) {
  const { t } = useTranslation();
  const locale = useUIStore((s) => s.locale);
  const b = memberBreakdown(finance, memberUids, u, holderUid);
  if (b.lines.length === 0) return null;
  // Exact net to 3 decimals when it isn't whole halalas; and the halala
  // rounding applied so the table sums to zero (shown − exact), if any.
  const exact3 = new Intl.NumberFormat(locale === 'ar' ? 'ar-SA-u-nu-latn' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 3 }).format(Math.abs(b.net));
  const adj = Math.round((shown - b.net) * 1000) / 1000;
  const adjStr = Math.abs(adj) >= 0.005 ? `${adj > 0 ? '+' : '−'}${fmt(Math.abs(adj))}` : null;
  const label = (l: typeof b.lines[number]) =>
    l.kind === 'group' ? t('expenses.directLine')
      : l.kind === 'potSpend' ? t('expenses.potSpendLine')
        : l.kind === 'potIn' ? t('expenses.potInLine')
          : l.kind === 'potHeld' ? t('expenses.potHeldLine', { count: l.count })
            : l.label;
  return (
    <details className="bp-breakdown">
      <summary>{t('expenses.breakdown')}</summary>
      <ul>
        {b.lines.map((l, i) => (
          <li key={i}>
            <span className="bp-breakdown__label">{label(l)}</span>
            <span className="bp-breakdown__calc">
              {l.kind === 'potIn'
                ? <>{t('expenses.paidAmt')} <b>{fmt(l.paid)}</b></>
                : l.kind === 'potHeld'
                  ? <><b>{fmt(l.share)}</b></>
                  : <>
                      {l.share > 0 ? <>{t('expenses.formula', { total: fmt(l.total), count: l.count })} = <b>{fmt(l.share)}</b></> : <>{fmt(l.total)}</>}
                      {l.paid > 0 && <> · {t('expenses.paidAmt')} <b>{fmt(l.paid)}</b></>}
                    </>}
            </span>
          </li>
        ))}
        <li className="bp-breakdown__sum">
          <span>{t('expenses.paidAmt')} {fmt(b.paid)} − {t('expenses.share')} {fmt(b.share)}</span>
          <span>= <b className={b.net >= 0 ? 'is-pos' : 'is-neg'}>{exact3}</b> {b.net >= 0 ? t('expenses.owedShort') : t('expenses.owesShort')}</span>
        </li>
        {adjStr && (
          <li className="bp-breakdown__adj">
            <span>{t('expenses.roundingAdj')}</span>
            <span>{adjStr} → <b>{fmt(Math.abs(shown))}</b></span>
          </li>
        )}
      </ul>
    </details>
  );
}

/** An IBAN with a one-tap copy. */
function IbanChip({ iban }: { iban: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  async function copy() {
    try { await navigator.clipboard?.writeText(normalizeIban(iban)); } catch { /* clipboard may be unavailable */ }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }
  return (
    <button type="button" className="bp-iban" onClick={copy} title={t('expenses.copyIban')} aria-label={`${t('expenses.copyIban')} ${formatIban(iban)}`}>
      <BankBadge iban={iban} compact />
      <span className="bp-iban__num">{formatIban(iban)}</span>
      <span className="material-symbols-outlined" aria-hidden="true">{copied ? 'check' : 'content_copy'}</span>
      {copied && <span className="bp-iban__ok">{t('members.copied')}</span>}
    </button>
  );
}

function SummaryPanel({ tripId, finance, memberUids, nameOf, ibanOf, fmt, fmt2, meUid, holderUid }: {
  tripId: string; finance: Finance; memberUids: string[]; nameOf: (u: string) => string; ibanOf: (u: string) => string | undefined;
  fmt: Fmt; fmt2: Fmt2; meUid: string; holderUid?: string;
}) {
  const { t } = useTranslation();
  const you = t('members.you');
  // "You" once: the dev seed already names the current user "أنت".
  const meLabel = (u: string) => (u === meUid ? (nameOf(u).trim() === you || nameOf(u).trim() === 'أنت' ? you : `${nameOf(u)} (${you})`) : nameOf(u));
  const myNet = myNetBalance(finance, memberUids, meUid, holderUid);
  const owed = myNet >= 0;
  const pot = potStatus(finance, memberUids);
  const fixed = fixedKitty(finance);
  // Direct (default): everyone pays whoever paid for them; rows are derived
  // from those rounded transfers so both views agree to the halala.
  const ledger = settledLedger(finance, memberUids, holderUid);
  const nets = ledger.net;
  const [settleMode, setSettleMode] = useState<'direct' | 'min'>('direct');
  const transfers = settleMode === 'direct' ? ledger.transfers : settlements(nets);
  const groupTotal = finance.group.reduce((a, e) => a + e.amount, 0);
  const sideTotal = finance.sides.reduce((a, s) => a + s.total, 0);
  const grand = groupTotal + sideTotal;
  const mySpent = personalSpent(finance.personal);

  return (
    <div className="bp-panel">
      {/* My overall balance */}
      <div className={`bp-net ${owed ? 'bp-net--pos' : 'bp-net--neg'}`}>
        <span className="bp-net__label">{owed ? t('expenses.owedToYou') : t('expenses.youOwe')}</span>
        <span className="bp-net__val">{fmt(Math.abs(myNet))}</span>
        {fmt2(Math.abs(myNet)) && <span className="bp-net__val2">{fmt2(Math.abs(myNet))}</span>}
      </div>

      <div className="bp-stat-row">
        <Stat label={t('expenses.groupSpend')} value={fmt(groupTotal)} sub={fmt2(groupTotal)} />
        <Stat label={t('expenses.sideSpend')} value={fmt(sideTotal)} sub={fmt2(sideTotal)} />
        <Stat label={t('expenses.grandTotal')} value={fmt(grand)} sub={fmt2(grand)} />
      </div>
      {fixed && (
        <p className="bp-note">
          {t('expenses.kittyFixed')}: {t('expenses.collected')} {fmt(pot.collected)} · {t('expenses.spentFromPot')} {fmt(pot.spent)} · {t('expenses.remaining')} <b>{fmt(pot.remaining)}</b>
          {pot.shortfall > 0 && <> · {t('expenses.potOverdrawn', { amount: fmt(pot.shortfall), holder: nameOf(holderUid ?? ''), each: fmt(pot.shortfall / Math.max(1, memberUids.length)) })}</>}
        </p>
      )}

      {/* Per-person: how much each is owed / owes */}
      <h4 className="bp-panel__h">{t('expenses.perPerson')}</h4>
      <ul className="bp-pay-list" role="list">
        {memberUids.map((u) => {
          const v = nets[u] ?? 0;
          const settled = Math.abs(v) < 0.005;
          return (
            <li key={u} className="bp-pay">
              <span className="bp-pay__name">{meLabel(u)}</span>
              {settled
                ? <span className="bp-status-chip bp-status-chip--ok">{t('expenses.settledUp')}</span>
                : <span className={`bp-pay__net ${v > 0 ? 'is-pos' : 'is-neg'}`}>
                    {v > 0 ? t('expenses.owedShort') : t('expenses.owesShort')} {fmt(Math.abs(v))}
                  </span>}
              <Breakdown finance={finance} memberUids={memberUids} u={u} fmt={fmt} shown={v} holderUid={holderUid} />
            </li>
          );
        })}
      </ul>

      {/* Who pays whom */}
      <h4 className="bp-panel__h">{t('expenses.whoPaysWhom')}</h4>
      <div className="bp-seg bp-seg--settle" role="group" aria-label={t('expenses.whoPaysWhom')}>
        <button className={`bp-seg__btn ${settleMode === 'direct' ? 'is-on' : ''}`} aria-pressed={settleMode === 'direct'} onClick={() => setSettleMode('direct')}>{t('expenses.settleDirect')}</button>
        <button className={`bp-seg__btn ${settleMode === 'min' ? 'is-on' : ''}`} aria-pressed={settleMode === 'min'} onClick={() => setSettleMode('min')}>{t('expenses.settleMin')}</button>
      </div>
      <p className="bp-note">{settleMode === 'direct' ? t('expenses.settleDirectHint') : t('expenses.settleMinHint')}</p>
      {/* Asked for an IBAN only now — when someone actually owes me a transfer. */}
      {transfers.some((tr) => tr.to === meUid) && !ibanOf(meUid) && <IbanNudge tripId={tripId} meUid={meUid} />}
      {transfers.length === 0 ? (
        <p className="bp-note">{t('expenses.allSettled')}</p>
      ) : (
        <ul className="bp-pay-list" role="list">
          {transfers.map((tr, i) => (
            <li key={i} className="bp-pay bp-settle">
              <span className="bp-pay__name">{meLabel(tr.from)}</span>
              <span className="bp-settle__to">{t('expenses.paysTo')}</span>
              <span className="bp-pay__name bp-settle__payee">{meLabel(tr.to)}</span>
              <span className="bp-pay__due" title={t('expenses.transferExact')}>{fmt(tr.amount)}{fmt2(tr.amount) && <small className="bp-amt2">{fmt2(tr.amount)}</small>}</span>
              <span className="bp-settle__iban">
                {ibanOf(tr.to)
                  ? <IbanChip iban={ibanOf(tr.to)!} />
                  : <span className="bp-iban-missing">{tr.to === meUid ? t('expenses.ibanMissingSelf') : t('expenses.ibanMissing', { name: nameOf(tr.to) })}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}

      {mySpent > 0 && <p className="bp-note">{t('expenses.personalSpend')}: {fmt(mySpent)}</p>}

      {/* The app's share — voluntary, kept out of the settlement itself. */}
      {APP_FEE_PCT > 0 && grand > 0 && (
        <details className="bp-fee-details">
          <summary>{t('expenses.appFeeTitle')} · {t('expenses.appFeeOptional')}</summary>
          <div className="bp-fee">
            <p className="bp-fee__line">{t('expenses.appFeeLine', { pct: APP_FEE_PCT, total: fmt(grand), amount: fmt(appFee(grand)) })}</p>
            <p className="bp-fee__yours">{t('expenses.appFeeYours', { amount: fmt(appFee(grand) / Math.max(1, memberUids.length)) })}</p>
            {APP_IBAN ? <IbanChip iban={APP_IBAN} /> : <p className="bp-note">{t('expenses.appIbanSoon')}</p>}
            <p className="bp-note">{t('expenses.appFeeHonor')}</p>
          </div>
        </details>
      )}
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string | null; tone?: 'neg' }) {
  return (
    <div className={`bp-stat ${tone === 'neg' ? 'bp-stat--neg' : ''}`}>
      <span className="bp-stat__label">{label}</span>
      <span className="bp-stat__val">{value}</span>
      {sub && <span className="bp-stat__sub">{sub}</span>}
    </div>
  );
}
