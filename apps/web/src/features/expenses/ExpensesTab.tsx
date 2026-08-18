import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@boardingpass/core';
import { useUIStore } from '@/app/store/uiStore';
import { CURRENT_UID } from '@/features/members/membersService';
import { useMembers } from '@/features/members/membersStore';
import {
  CATEGORIES, convert, distribution, kittyCollected, myNetBalance, perMemberDue,
  personalRemaining, personalSpent, splitEqual, type Category, type Finance,
} from './finance';
import { expensesActions, useFinance } from './expensesStore';

type Sub = 'kitty' | 'side' | 'personal' | 'summary';
const SUBS: { key: Sub; label: string }[] = [
  { key: 'kitty', label: 'expenses.kitty' },
  { key: 'side', label: 'expenses.side' },
  { key: 'personal', label: 'expenses.personal' },
  { key: 'summary', label: 'expenses.summary' },
];

export function ExpensesTab({ tripId, canEdit, isOwner }: { tripId: string; canEdit: boolean; isOwner: boolean }) {
  const { t } = useTranslation();
  const { members } = useMembers();
  const { finance, loading } = useFinance();
  const [sub, setSub] = useState<Sub>('kitty');
  const [showDest, setShowDest] = useState(false);

  const active = useMemo(() => (members ?? []).filter((m) => m.status === 'ACTIVE'), [members]);
  const memberUids = useMemo(() => active.map((m) => m.uid), [active]);
  const nameOf = useMemo(() => {
    const map: Record<string, string> = {};
    active.forEach((m) => { map[m.uid] = m.displayName; });
    return (uid: string) => map[uid] ?? uid;
  }, [active]);

  const uidsKey = memberUids.join(',');
  useEffect(() => {
    if (memberUids.length === 0) return;
    void expensesActions.load(tripId, { memberUids, base: 'SAR', dest: 'GBP', rate: 0.2122 }, CURRENT_UID);
    return () => expensesActions.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId, uidsKey]);

  const locale = useUIStore((s) => s.locale);
  const fmt = useMemo(() => {
    const rate = finance?.rate ?? 0.2122;
    const code = showDest ? (finance?.dest ?? 'GBP') : (finance?.base ?? 'SAR');
    return (base: number) => formatCurrency(convert(base, showDest, rate), code, locale);
  }, [finance, showDest, locale]);

  if (loading && finance === null) return <p className="bp-page__lead">…</p>;
  if (!finance) return <p className="bp-page__lead">{t('expenses.needMembers')}</p>;

  return (
    <div className="bp-expenses">
      <div className="bp-expenses__bar">
        <div className="bp-currency-toggle" role="group" aria-label={t('expenses.currency')}>
          <button className={`bp-cur ${!showDest ? 'is-on' : ''}`} aria-pressed={!showDest} onClick={() => setShowDest(false)}>{finance.base}</button>
          <button className={`bp-cur ${showDest ? 'is-on' : ''}`} aria-pressed={showDest} onClick={() => setShowDest(true)}>{finance.dest}</button>
        </div>
      </div>

      <div className="bp-subtabs2" role="tablist" aria-label={t('tripDetail.tabExpenses')}>
        {SUBS.map((s) => (
          <button key={s.key} role="tab" aria-selected={sub === s.key} className={`bp-subtab2 ${sub === s.key ? 'is-on' : ''}`} onClick={() => setSub(s.key)}>
            {t(s.label)}
          </button>
        ))}
      </div>

      {sub === 'kitty' && <KittyPanel finance={finance} memberUids={memberUids} nameOf={nameOf} fmt={fmt} canEdit={canEdit} isOwner={isOwner} />}
      {sub === 'side' && <SidePanel finance={finance} active={active} nameOf={nameOf} fmt={fmt} canEdit={canEdit} />}
      {sub === 'personal' && <PersonalPanel finance={finance} fmt={fmt} canEdit={canEdit} />}
      {sub === 'summary' && <SummaryPanel finance={finance} memberUids={memberUids} fmt={fmt} />}
    </div>
  );
}

function Bar({ pct }: { pct: number }) {
  return <div className="bp-progress"><div className="bp-progress__bar" style={{ inlineSize: `${Math.max(0, Math.min(100, pct))}%` }} /></div>;
}

function KittyPanel({ finance, memberUids, nameOf, fmt, canEdit, isOwner }: {
  finance: Finance; memberUids: string[]; nameOf: (u: string) => string; fmt: (n: number) => string; canEdit: boolean; isOwner: boolean;
}) {
  const { t } = useTranslation();
  const [total, setTotal] = useState(String(finance.kittyTotal || ''));
  const dues = perMemberDue(finance.kittyTotal, memberUids);
  const collected = kittyCollected(finance.kittyTotal, memberUids, finance.paid);
  const remaining = finance.kittyTotal - collected;
  const pct = finance.kittyTotal > 0 ? (collected / finance.kittyTotal) * 100 : 0;
  const dist = distribution(finance.group);
  const groupTotal = finance.group.reduce((a, e) => a + e.amount, 0);

  return (
    <div className="bp-panel">
      {isOwner && (
        <div className="bp-add-row">
          <div className="bp-field" style={{ flex: 1 }}>
            <label htmlFor="bp-kitty-total">{t('expenses.kittyTotal')}</label>
            <input id="bp-kitty-total" className="bp-input" type="number" min="0" value={total} onChange={(e) => setTotal(e.target.value)} />
          </div>
          <button className="bp-btn bp-btn--primary bp-btn--sm" style={{ alignSelf: 'end' }} onClick={() => expensesActions.setKittyTotal(Number(total) || 0)}>{t('expenses.setTotal')}</button>
        </div>
      )}

      <div className="bp-stat-row">
        <Stat label={t('expenses.total')} value={fmt(finance.kittyTotal)} />
        <Stat label={t('expenses.collected')} value={fmt(collected)} />
        <Stat label={t('expenses.remaining')} value={fmt(remaining)} />
      </div>
      <Bar pct={pct} />

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

      {groupTotal > 0 && (
        <>
          <h4 className="bp-panel__h">{t('expenses.distribution')}</h4>
          {CATEGORIES.map((c) => dist[c] > 0 && (
            <div key={c} className="bp-dist-row">
              <span className="bp-dist-row__label">{t(`expenses.cat.${c}`)}</span>
              <Bar pct={(dist[c] / groupTotal) * 100} />
              <span className="bp-dist-row__val">{fmt(dist[c])}</span>
            </div>
          ))}
        </>
      )}

      <h4 className="bp-panel__h">{t('expenses.groupLog')}</h4>
      <ul className="bp-exp-list" role="list">
        {finance.group.map((e) => (
          <li key={e.id} className="bp-exp">
            <span className="bp-exp__desc">{e.desc}</span>
            <span className="bp-chip bp-chip--cat">{t(`expenses.cat.${e.category}`)}</span>
            <span className="bp-exp__by">{nameOf(e.payerUid)}</span>
            <span className="bp-exp__amt">{fmt(e.amount)}</span>
            {canEdit && <button className="bp-icon-btn bp-icon-btn--xs" aria-label={t('expenses.delete')} onClick={() => expensesActions.deleteGroup(e.id)}><span className="material-symbols-outlined" aria-hidden="true">close</span></button>}
          </li>
        ))}
        {finance.group.length === 0 && <li className="bp-members__empty">{t('expenses.noGroup')}</li>}
      </ul>
      {canEdit && <GroupForm memberUids={memberUids} nameOf={nameOf} />}
    </div>
  );
}

function GroupForm({ memberUids, nameOf }: { memberUids: string[]; nameOf: (u: string) => string }) {
  const { t } = useTranslation();
  const [desc, setDesc] = useState('');
  const [cat, setCat] = useState<Category>('FOOD');
  const [amount, setAmount] = useState('');
  const [payer, setPayer] = useState(memberUids[0] ?? CURRENT_UID);

  async function submit() {
    const a = Number(amount);
    if (!desc.trim() || !(a > 0)) return;
    await expensesActions.addGroup({ desc, category: cat, amount: a, payerUid: payer });
    setDesc(''); setAmount('');
  }
  return (
    <div className="bp-exp-form">
      <input className="bp-input" value={desc} placeholder={t('expenses.descPh')} aria-label={t('expenses.desc')} onChange={(e) => setDesc(e.target.value)} />
      <select className="bp-input" value={cat} aria-label={t('expenses.category')} onChange={(e) => setCat(e.target.value as Category)}>
        {CATEGORIES.map((c) => <option key={c} value={c}>{t(`expenses.cat.${c}`)}</option>)}
      </select>
      <input className="bp-input" type="number" min="0" step="0.01" value={amount} placeholder={t('expenses.amountPh')} aria-label={t('expenses.amount')} onChange={(e) => setAmount(e.target.value)} style={{ maxInlineSize: 120 }} />
      <select className="bp-input" value={payer} aria-label={t('expenses.payer')} onChange={(e) => setPayer(e.target.value)}>
        {memberUids.map((u) => <option key={u} value={u}>{nameOf(u)}</option>)}
      </select>
      <button className="bp-btn bp-btn--outline bp-btn--sm" onClick={submit}>{t('expenses.add')}</button>
    </div>
  );
}

function SidePanel({ finance, active, nameOf, fmt, canEdit }: {
  finance: Finance; active: { uid: string; displayName: string }[]; nameOf: (u: string) => string; fmt: (n: number) => string; canEdit: boolean;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [payer, setPayer] = useState(active[0]?.uid ?? CURRENT_UID);
  const [parts, setParts] = useState<string[]>([]);

  function toggle(uid: string) {
    setParts((p) => (p.includes(uid) ? p.filter((x) => x !== uid) : [...p, uid]));
  }
  async function create() {
    const a = Number(amount);
    if (!title.trim() || !(a > 0) || parts.length < 2) return;
    await expensesActions.addSide({ title, participantUids: parts, total: a, payerUid: parts.includes(payer) ? payer : parts[0] });
    setTitle(''); setAmount(''); setParts([]);
  }

  return (
    <div className="bp-panel">
      <ul className="bp-side-list" role="list">
        {finance.sides.map((s) => {
          const shares = splitEqual(s.total, s.participantUids.length);
          return (
            <li key={s.id} className="bp-side-card">
              <div className="bp-side-card__head">
                <strong>{s.title}</strong>
                <span className="bp-exp__amt">{fmt(s.total)}</span>
              </div>
              <p className="bp-side-card__meta">
                {s.participantUids.map((u) => nameOf(u)).join('، ')} · {t('expenses.share')}: {fmt(shares[0] ?? 0)} · {t('expenses.payer')}: {nameOf(s.payerUid)}
              </p>
              <div className="bp-side-card__foot">
                {s.settled
                  ? <span className="bp-status-chip bp-status-chip--ok">{t('expenses.settled')}</span>
                  : <span className="bp-side-note">{t('expenses.settleNote')}</span>}
                {canEdit && !s.settled && <button className="bp-btn bp-btn--outline bp-btn--sm" onClick={() => expensesActions.settleSide(s.id)}>{t('expenses.settle')}</button>}
                {canEdit && <button className="bp-icon-btn bp-icon-btn--xs" aria-label={t('expenses.delete')} onClick={() => expensesActions.deleteSide(s.id)}><span className="material-symbols-outlined" aria-hidden="true">delete</span></button>}
              </div>
            </li>
          );
        })}
        {finance.sides.length === 0 && <li className="bp-members__empty">{t('expenses.noSide')}</li>}
      </ul>

      {canEdit && (
        <div className="bp-side-form">
          <input className="bp-input" value={title} placeholder={t('expenses.sideTitlePh')} aria-label={t('expenses.sideTitle')} onChange={(e) => setTitle(e.target.value)} />
          <input className="bp-input" type="number" min="0" step="0.01" value={amount} placeholder={t('expenses.amountPh')} aria-label={t('expenses.amount')} onChange={(e) => setAmount(e.target.value)} />
          <fieldset className="bp-parts">
            <legend>{t('expenses.participants')}</legend>
            {active.map((m) => (
              <label key={m.uid} className="bp-check">
                <input type="checkbox" checked={parts.includes(m.uid)} onChange={() => toggle(m.uid)} />{m.displayName}
              </label>
            ))}
          </fieldset>
          <div className="bp-field">
            <label htmlFor="bp-side-payer">{t('expenses.payer')}</label>
            <select id="bp-side-payer" className="bp-input" value={payer} onChange={(e) => setPayer(e.target.value)}>
              {active.map((m) => <option key={m.uid} value={m.uid}>{m.displayName}</option>)}
            </select>
          </div>
          <button className="bp-btn bp-btn--primary bp-btn--sm" onClick={create} disabled={parts.length < 2}>{t('expenses.createSide')}</button>
        </div>
      )}
    </div>
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
          <li key={e.id} className="bp-exp">
            <span className="bp-exp__desc">{e.desc}</span>
            <span className="bp-exp__amt">{fmt(e.amount)}</span>
            {canEdit && <button className="bp-icon-btn bp-icon-btn--xs" aria-label={t('expenses.delete')} onClick={() => expensesActions.deletePersonal(e.id)}><span className="material-symbols-outlined" aria-hidden="true">close</span></button>}
          </li>
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

function SummaryPanel({ finance, memberUids, fmt }: { finance: Finance; memberUids: string[]; fmt: (n: number) => string }) {
  const { t } = useTranslation();
  const net = myNetBalance(finance, memberUids, CURRENT_UID);
  const owed = net >= 0;
  const dist = distribution(finance.group);
  const spent = personalSpent(finance.personal);

  return (
    <div className="bp-panel">
      <div className={`bp-net ${owed ? 'bp-net--pos' : 'bp-net--neg'}`}>
        <span className="bp-net__label">{owed ? t('expenses.owedToYou') : t('expenses.youOwe')}</span>
        <span className="bp-net__val">{fmt(Math.abs(net))}</span>
      </div>
      <h4 className="bp-panel__h">{t('expenses.analysis')}</h4>
      <div className="bp-stat-row">
        <Stat label={t('expenses.groupSpend')} value={fmt(finance.group.reduce((a, e) => a + e.amount, 0))} />
        <Stat label={t('expenses.personalSpend')} value={fmt(spent)} />
      </div>
      {CATEGORIES.map((c) => dist[c] > 0 && (
        <div key={c} className="bp-dist-row">
          <span className="bp-dist-row__label">{t(`expenses.cat.${c}`)}</span>
          <span className="bp-dist-row__val">{fmt(dist[c])}</span>
        </div>
      ))}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="bp-stat"><span className="bp-stat__label">{label}</span><span className="bp-stat__val">{value}</span></div>;
}
