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
  perMemberDue, personalRemaining, personalSpent, potStatus, settledLedger, settlements,
  type Category, type Finance, type GroupExpense, type KittyMode, type PersonalExpense, type SideKitty,
} from './finance';
import { expensesActions, useFinance } from './expensesStore';

type Sub = 'kitty' | 'personal' | 'summary';
const SUBS: { key: Sub; label: string }[] = [
  { key: 'kitty', label: 'expenses.kitty' },
  { key: 'personal', label: 'expenses.personal' },
  { key: 'summary', label: 'expenses.summary' },
];

export function ExpensesTab({ tripId, canEdit, isOwner, base, dest }: { tripId: string; canEdit: boolean; isOwner: boolean; base?: string; dest?: string }) {
  const { t } = useTranslation();
  const { members } = useMembers();
  const { finance, loading, error } = useFinance();
  const [sub, setSub] = useState<Sub>('kitty');
  const [showDest, setShowDest] = useState(false);

  // The trip's own currencies drive the display. A domestic trip has no distinct
  // destination currency, so there's just one currency and no toggle.
  const baseCur = base || 'SAR';
  const destCur = dest && dest !== baseCur ? dest : undefined;

  const active = useMemo(() => (members ?? []).filter((m) => m.status === 'ACTIVE'), [members]);
  const memberUids = useMemo(() => active.map((m) => m.uid), [active]);
  const nameOf = useMemo(() => {
    const map: Record<string, string> = {};
    active.forEach((m) => { map[m.uid] = m.displayName; });
    return (uid: string) => map[uid] ?? uid;
  }, [active]);

  const meUid = firebaseEnabled() ? (currentUid() ?? CURRENT_UID) : CURRENT_UID;
  // The trip owner holds the fixed pot: unpaid shares are owed to them.
  const holderUid = active.find((m) => m.role === 'OWNER')?.uid ?? active[0]?.uid;
  const uidsKey = memberUids.join(',');
  useEffect(() => {
    if (memberUids.length === 0) return;
    setMockCurrentUser(tripId, meUid); // self-scoped personal writes (mock)
    void expensesActions.load(tripId, { memberUids, base: baseCur, dest: destCur ?? baseCur, rate: 0.2122 }, meUid);
    return () => expensesActions.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId, uidsKey]);

  const locale = useUIStore((s) => s.locale);
  // Amounts are stored in the base currency; only convert for the dest view.
  const useDest = showDest && !!destCur;
  const fmt = useMemo(() => {
    const rate = finance?.rate ?? 0.2122;
    const code = useDest ? destCur! : baseCur;
    return (b: number) => formatCurrency(convert(b, useDest, rate), code, locale);
  }, [finance, useDest, locale, baseCur, destCur]);

  if (loading && finance === null) return <p className="bp-page__lead">…</p>;
  if (!finance) return <p className="bp-page__lead">{t('expenses.needMembers')}</p>;

  return (
    <div className="bp-expenses">
      {destCur && (
        <div className="bp-expenses__bar">
          <div className="bp-currency-toggle" role="group" aria-label={t('expenses.currency')}>
            <button className={`bp-cur ${!showDest ? 'is-on' : ''}`} aria-pressed={!showDest} onClick={() => setShowDest(false)}>{baseCur}</button>
            <button className={`bp-cur ${showDest ? 'is-on' : ''}`} aria-pressed={showDest} onClick={() => setShowDest(true)}>{destCur}</button>
          </div>
        </div>
      )}

      {error && <div className="bp-banner" role="alert">{t('expenses.saveFailed')}</div>}

      <div className="bp-subtabs2" role="tablist" aria-label={t('tripDetail.tabExpenses')}>
        {SUBS.map((s) => (
          <button key={s.key} role="tab" aria-selected={sub === s.key} className={`bp-subtab2 ${sub === s.key ? 'is-on' : ''}`} onClick={() => setSub(s.key)}>
            {t(s.label)}
          </button>
        ))}
      </div>

      {sub === 'kitty' && <KittyPanel tripId={tripId} finance={finance} memberUids={memberUids} active={active} nameOf={nameOf} fmt={fmt} canEdit={canEdit} isOwner={isOwner} baseCur={baseCur} destCur={destCur} rate={finance.rate} />}
      {sub === 'personal' && <PersonalPanel finance={finance} fmt={fmt} canEdit={canEdit} />}
      {sub === 'summary' && <SummaryPanel finance={finance} memberUids={memberUids} nameOf={nameOf} fmt={fmt} meUid={meUid} holderUid={holderUid} />}
    </div>
  );
}

function Bar({ pct }: { pct: number }) {
  return <div className="bp-progress"><div className="bp-progress__bar" style={{ inlineSize: `${Math.max(0, Math.min(100, pct))}%` }} /></div>;
}

/** The kitty, in one of two clear shapes:
 *  FIXED — a pot amount is set up front, every member pays an equal share into
 *          it, and every shared expense is DRAWN FROM THE POT (no debts between
 *          members; the panel shows what's left).
 *  OPEN  — no pot. Whoever pays an expense says who it was for, and it is
 *          split among exactly those people (default: everyone). */
function KittyPanel({ tripId, finance, memberUids, active, nameOf, fmt, canEdit, isOwner, baseCur, destCur, rate }: {
  tripId: string; finance: Finance; memberUids: string[]; active: { uid: string; displayName: string }[]; nameOf: (u: string) => string;
  fmt: (n: number) => string; canEdit: boolean; isOwner: boolean; baseCur: string; destCur?: string; rate: number;
}) {
  const { t } = useTranslation();
  const mode: KittyMode = finance.kittyMode ?? 'FIXED';
  const [total, setTotal] = useState(String(finance.kittyTotal || ''));
  const pot = potStatus(finance, memberUids);
  const dues = perMemberDue(finance.kittyTotal, memberUids);
  const dist = distribution(finance.group, finance.sides);
  const distTotal = CATEGORIES.reduce((a, c) => a + dist[c], 0);
  const entries = finance.group.length + finance.sides.length;

  return (
    <div className="bp-panel">
      {isOwner && (
        <div className="bp-seg bp-seg--full" role="group" aria-label={t('expenses.kittyMode')}>
          <button type="button" className={`bp-seg__btn ${mode === 'FIXED' ? 'is-on' : ''}`} aria-pressed={mode === 'FIXED'} onClick={() => expensesActions.setKittyMode('FIXED')}>{t('expenses.kittyFixed')}</button>
          <button type="button" className={`bp-seg__btn ${mode === 'OPEN' ? 'is-on' : ''}`} aria-pressed={mode === 'OPEN'} onClick={() => expensesActions.setKittyMode('OPEN')}>{t('expenses.kittyOpen')}</button>
        </div>
      )}
      <p className="bp-note">{mode === 'OPEN' ? t('expenses.kittyOpenNote') : t('expenses.kittyFixedNote')}</p>

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
              <button className="bp-btn bp-btn--primary bp-btn--sm" style={{ alignSelf: 'end' }} onClick={() => expensesActions.setKittyTotal(Number(total) || 0)}>{t('expenses.setTotal')}</button>
            </div>
          )}
          <div className="bp-stat-row">
            <Stat label={t('expenses.total')} value={fmt(pot.total)} />
            <Stat label={t('expenses.perHead')} value={fmt(pot.due)} />
            <Stat label={t('expenses.collected')} value={fmt(pot.collected)} />
          </div>
          <div className="bp-stat-row">
            <Stat label={t('expenses.spentFromPot')} value={fmt(pot.spent)} />
            <Stat label={t('expenses.remaining')} value={fmt(pot.remaining)} />
          </div>
          <Bar pct={pot.total > 0 ? (pot.spent / pot.total) * 100 : 0} />
          {pot.remaining < 0 && <p className="bp-note bp-note--warn">{t('expenses.potOverdrawn', { amount: fmt(-pot.remaining) })}</p>}

          {/* Everyone's equal share into the pot, confirmed by the owner. */}
          <h4 className="bp-panel__h">{t('expenses.dues')}</h4>
          <ul className="bp-pay-list" role="list">
            {memberUids.map((u) => (
              <li key={u} className="bp-pay">
                <span className="bp-pay__name">{nameOf(u)}</span>
                <span className="bp-pay__due">{fmt(dues[u] ?? 0)}</span>
                {finance.paid[u]
                  ? <span className="bp-status-chip bp-status-chip--ok">{t('expenses.paid')}</span>
                  : <span className="bp-status-chip">{t('expenses.pending')}</span>}
                {isOwner && (
                  <button className="bp-btn bp-btn--outline bp-btn--sm" onClick={() => expensesActions.markPaid(u, !finance.paid[u])}>
                    {finance.paid[u] ? t('expenses.markPending') : t('expenses.confirmPaid')}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {mode === 'OPEN' && entries === 0 && <p className="bp-note">{t('expenses.openHint')}</p>}

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
          <GroupRow key={e.id} e={e} memberUids={memberUids} nameOf={nameOf} fmt={fmt} canEdit={canEdit} mode={mode} />
        ))}
        {finance.sides.map((s) => (
          <SideRow key={s.id} s={s} memberCount={memberUids.length} nameOf={nameOf} fmt={fmt} canEdit={canEdit} />
        ))}
        {entries === 0 && <li className="bp-members__empty">{t('expenses.noGroup')}</li>}
      </ul>
      {canEdit && <AddShared tripId={tripId} mode={mode} memberUids={memberUids} active={active} nameOf={nameOf} baseCur={baseCur} destCur={destCur} rate={rate} />}
    </div>
  );
}

/** A shared expense among a subset of members (OPEN kitty), or a legacy side kitty. */
function SideRow({ s, memberCount, nameOf, fmt, canEdit }: {
  s: SideKitty; memberCount: number; nameOf: (u: string) => string; fmt: (n: number) => string; canEdit: boolean;
}) {
  const { t } = useTranslation();
  const share = s.total / s.participantUids.length; // exact; display rounds
  const everyone = s.participantUids.length === memberCount;
  return (
    <li className="bp-exp bp-exp--side">
      <span className="bp-exp__desc">{s.title}</span>
      {s.category && <span className="bp-chip bp-chip--cat">{t(`expenses.cat.${s.category}`)}</span>}
      <span className="bp-exp__by">{nameOf(s.payerUid)}</span>
      <span className="bp-exp__amt">{fmt(s.total)}</span>
      {(s.receiptUrls ?? []).map((url, i) => (
        <a key={i} className="bp-icon-btn bp-icon-btn--xs" href={url} target="_blank" rel="noopener noreferrer" aria-label={t('expenses.viewReceipt')}>
          <span className="material-symbols-outlined" aria-hidden="true">receipt_long</span>
        </a>
      ))}
      {s.settled && <span className="bp-status-chip bp-status-chip--ok">{t('expenses.settled')}</span>}
      {canEdit && !s.settled && <button className="bp-btn bp-btn--outline bp-btn--sm" onClick={() => expensesActions.settleSide(s.id)}>{t('expenses.settle')}</button>}
      {canEdit && <button className="bp-icon-btn bp-icon-btn--xs" aria-label={t('expenses.delete')} onClick={() => expensesActions.deleteSide(s.id)}><span className="material-symbols-outlined" aria-hidden="true">close</span></button>}
      <span className="bp-exp__meta">
        {everyone ? t('expenses.everyone') : s.participantUids.map(nameOf).join('، ')} · {t('expenses.share')}: {fmt(share)}
      </span>
    </li>
  );
}

function GroupRow({ e, memberUids, nameOf, fmt, canEdit, mode }: {
  e: GroupExpense; memberUids: string[]; nameOf: (u: string) => string; fmt: (n: number) => string; canEdit: boolean; mode: KittyMode;
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
        <select className="bp-input" value={payer} aria-label={t('expenses.payer')} onChange={(ev) => setPayer(ev.target.value)}>
          {(mode === 'FIXED' || fromPot) && <option value={POT_UID}>{t('expenses.potPaid')}</option>}
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
      <span className="bp-exp__amt">{fmt(e.amount)}</span>
      {(e.receiptUrls ?? (e.receiptUrl ? [e.receiptUrl] : [])).map((url, i) => (
        <a key={i} className="bp-icon-btn bp-icon-btn--xs" href={url} target="_blank" rel="noopener noreferrer" aria-label={t('expenses.viewReceipt')}>
          <span className="material-symbols-outlined" aria-hidden="true">receipt_long</span>
        </a>
      ))}
      {canEdit && <button className="bp-icon-btn bp-icon-btn--xs" aria-label={t('expenses.edit')} onClick={start}><span className="material-symbols-outlined" aria-hidden="true">edit</span></button>}
      {canEdit && <button className="bp-icon-btn bp-icon-btn--xs" aria-label={t('expenses.delete')} onClick={() => expensesActions.deleteGroup(e.id)}><span className="material-symbols-outlined" aria-hidden="true">close</span></button>}
    </li>
  );
}

/** Add a shared expense.
 *  FIXED: description, category, amount → drawn from the pot (no payer).
 *  OPEN:  + who paid and who it was for (default: everyone) → split among them. */
function AddShared({ tripId, mode, memberUids, active, nameOf, baseCur, destCur, rate }: {
  tripId: string; mode: KittyMode; memberUids: string[]; active: { uid: string; displayName: string }[]; nameOf: (u: string) => string;
  baseCur: string; destCur?: string; rate: number;
}) {
  const { t } = useTranslation();
  const [desc, setDesc] = useState('');
  const [cat, setCat] = useState<Category>('FOOD');
  const [amount, setAmount] = useState('');
  const [cur, setCur] = useState(baseCur);
  const [payer, setPayer] = useState(memberUids[0] ?? CURRENT_UID);
  const [parts, setParts] = useState<string[]>(memberUids);
  const [receipts, setReceipts] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const uidsKey = memberUids.join(',');
  useEffect(() => { setParts(memberUids); }, [uidsKey]); // eslint-disable-line react-hooks/exhaustive-deps
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
      if (mode === 'FIXED') {
        await expensesActions.addGroup({ desc, category: cat, amount: amt, payerUid: POT_UID, receiptUrls });
      } else if (everyone) {
        await expensesActions.addGroup({ desc, category: cat, amount: amt, payerUid: payer, receiptUrls });
      } else {
        await expensesActions.addSide({ title: desc, participantUids: parts, total: amt, payerUid: payer, category: cat, receiptUrls });
      }
      setDesc(''); setAmount(''); setReceipts([]); setParts(memberUids);
    } finally { setBusy(false); }
  }

  return (
    <div className="bp-addexp">
      <p className="bp-field__label">{mode === 'FIXED' ? t('expenses.addFromPot') : t('expenses.addShared')}</p>
      <div className="bp-exp-form">
        <input className="bp-input" value={desc} placeholder={t('expenses.descPh')} aria-label={t('expenses.desc')} onChange={(e) => setDesc(e.target.value)} />
        <select className="bp-input" value={cat} aria-label={t('expenses.category')} onChange={(e) => setCat(e.target.value as Category)}>
          {CATEGORIES.map((c) => <option key={c} value={c}>{t(`expenses.cat.${c}`)}</option>)}
        </select>
        <input className="bp-input" type="number" min="0" step="0.01" value={amount} placeholder={t('expenses.amountPh')} aria-label={t('expenses.amount')} onChange={(e) => setAmount(e.target.value)} style={{ maxInlineSize: 120 }} />
        {destCur && (
          <select className="bp-input" value={cur} aria-label={t('expenses.currency')} onChange={(e) => setCur(e.target.value)} style={{ maxInlineSize: 90 }}>
            <option value={baseCur}>{baseCur}</option>
            <option value={destCur}>{destCur}</option>
          </select>
        )}
        {mode === 'OPEN' && (
          <select className="bp-input" value={payer} aria-label={t('expenses.payer')} onChange={(e) => setPayer(e.target.value)}>
            {memberUids.map((u) => <option key={u} value={u}>{nameOf(u)}</option>)}
          </select>
        )}
        <button className="bp-btn bp-btn--outline bp-btn--sm" disabled={busy} onClick={submit}>{busy ? t('expenses.saving') : t('expenses.add')}</button>
      </div>

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

function PersonalRow({ e, fmt, canEdit }: { e: PersonalExpense; fmt: (n: number) => string; canEdit: boolean }) {
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
      <span className="bp-exp__amt">{fmt(e.amount)}</span>
      {canEdit && <button className="bp-icon-btn bp-icon-btn--xs" aria-label={t('expenses.edit')} onClick={() => { setDesc(e.desc); setAmount(String(e.amount)); setEditing(true); }}><span className="material-symbols-outlined" aria-hidden="true">edit</span></button>}
      {canEdit && <button className="bp-icon-btn bp-icon-btn--xs" aria-label={t('expenses.delete')} onClick={() => expensesActions.deletePersonal(e.id)}><span className="material-symbols-outlined" aria-hidden="true">close</span></button>}
    </li>
  );
}

function PersonalPanel({ finance, fmt, canEdit }: { finance: Finance; fmt: (n: number) => string; canEdit: boolean }) {
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
        <Stat label={t('expenses.budget')} value={fmt(finance.personalBudget)} />
        <Stat label={t('expenses.spent')} value={fmt(spent)} />
        <Stat label={t('expenses.remaining')} value={fmt(remaining)} />
      </div>
      <ul className="bp-exp-list" role="list">
        {finance.personal.map((e) => (
          <PersonalRow key={e.id} e={e} fmt={fmt} canEdit={canEdit} />
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
 *  hand: "total ÷ people = share · paid X" per pot, then paid − shares = net. */
function Breakdown({ finance, memberUids, u, fmt, shown, holderUid }: { finance: Finance; memberUids: string[]; u: string; fmt: (n: number) => string; shown: number; holderUid?: string }) {
  const { t } = useTranslation();
  const locale = useUIStore((s) => s.locale);
  const b = memberBreakdown(finance, memberUids, u, holderUid);
  if (b.lines.length === 0) return null;
  // Exact net to 3 decimals when it isn't whole halalas; and the halala
  // rounding applied so the table sums to zero (shown − exact), if any.
  const exact3 = new Intl.NumberFormat(locale === 'ar' ? 'ar-SA' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 3 }).format(Math.abs(b.net));
  const adj = Math.round((shown - b.net) * 1000) / 1000;
  const adjStr = Math.abs(adj) >= 0.005 ? `${adj > 0 ? '+' : '−'}${fmt(Math.abs(adj))}` : null;
  return (
    <details className="bp-breakdown">
      <summary>{t('expenses.breakdown')}</summary>
      <ul>
        {b.lines.map((l, i) => (
          <li key={i}>
            <span className="bp-breakdown__label">
              {l.kind === 'group' ? t('expenses.groupPot') : l.kind === 'pot' ? t('expenses.potDue') : l.kind === 'potIn' ? t('expenses.duesOutstanding', { count: l.count }) : l.label}
            </span>
            <span className="bp-breakdown__calc">
              {l.kind === 'potIn'
                ? <>{t('expenses.owedShort')} <b>{fmt(l.paid)}</b></>
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

function SummaryPanel({ finance, memberUids, nameOf, fmt, meUid, holderUid }: {
  finance: Finance; memberUids: string[]; nameOf: (u: string) => string; fmt: (n: number) => string; meUid: string; holderUid?: string;
}) {
  const { t } = useTranslation();
  const myNet = myNetBalance(finance, memberUids, meUid, holderUid);
  const owed = myNet >= 0;
  const pot = potStatus(finance, memberUids);
  const fixed = (finance.kittyMode ?? 'FIXED') === 'FIXED' && pot.total > 0;
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
      </div>

      <div className="bp-stat-row">
        <Stat label={t('expenses.groupSpend')} value={fmt(groupTotal)} />
        <Stat label={t('expenses.sideSpend')} value={fmt(sideTotal)} />
        <Stat label={t('expenses.grandTotal')} value={fmt(grand)} />
      </div>
      {fixed && (
        <p className="bp-note">
          {t('expenses.kittyFixed')}: {t('expenses.total')} {fmt(pot.total)} · {t('expenses.collected')} {fmt(pot.collected)} · {t('expenses.spentFromPot')} {fmt(pot.spent)} · {t('expenses.remaining')} <b>{fmt(pot.remaining)}</b>
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
              <span className="bp-pay__name">{nameOf(u)}{u === meUid && ` (${t('members.you')})`}</span>
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
      {transfers.length === 0 ? (
        <p className="bp-note">{t('expenses.allSettled')}</p>
      ) : (
        <ul className="bp-pay-list" role="list">
          {transfers.map((tr, i) => (
            <li key={i} className="bp-pay bp-settle">
              <span className="bp-pay__name">{nameOf(tr.from)}</span>
              <span className="bp-settle__to">{t('expenses.paysTo')}</span>
              <span className="bp-pay__name bp-settle__payee">{nameOf(tr.to)}</span>
              <span className="bp-pay__due">{fmt(tr.amount)}</span>
            </li>
          ))}
        </ul>
      )}

      {mySpent > 0 && <p className="bp-note">{t('expenses.personalSpend')}: {fmt(mySpent)}</p>}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="bp-stat"><span className="bp-stat__label">{label}</span><span className="bp-stat__val">{value}</span></div>;
}
