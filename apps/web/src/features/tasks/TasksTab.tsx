import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMembers } from '@/features/members/membersStore';
import {
  BOOKING_GROUPS, PACK_CATEGORIES, TEMPLATES, TEMPLATE_KEYS, effectiveAssignee, progress,
  type PackCategory, type TemplateKey,
} from './tasksModel';
import { tasksActions, useTasksBoard } from './tasksStore';

function initialOf(name: string) { return name.trim().charAt(0).toUpperCase() || '?'; }

export function TasksTab({ tripId, canEdit }: { tripId: string; canEdit: boolean }) {
  const { members } = useMembers();
  const { board, loading } = useTasksBoard();

  const active = useMemo(() => (members ?? []).filter((m) => m.status === 'ACTIVE'), [members]);
  const activeUids = useMemo(() => active.map((m) => m.uid), [active]);
  const nameOf = useMemo(() => {
    const map: Record<string, string> = {};
    active.forEach((m) => { map[m.uid] = m.displayName; });
    return (uid: string | null) => (uid ? map[uid] ?? uid : null);
  }, [active]);

  useEffect(() => {
    void tasksActions.load(tripId);
    return () => tasksActions.reset();
  }, [tripId]);

  if (loading && board === null) return <p className="bp-page__lead">…</p>;
  if (!board) return null;

  return (
    <div className="bp-tasks">
      <TasksSection board={board} active={active} activeUids={activeUids} nameOf={nameOf} canEdit={canEdit} />
      <BookingsSection board={board} canEdit={canEdit} />
      <PackingSection board={board} canEdit={canEdit} />
    </div>
  );
}

function ProgressLine({ total, done, label }: { total: number; done: number; label: string }) {
  const pct = progress(total, done);
  return (
    <div className="bp-prog-line">
      <div className="bp-progress" aria-label={label}><div className="bp-progress__bar" style={{ inlineSize: `${pct}%` }} /></div>
      <span className="bp-progress__pct">{done}/{total}</span>
    </div>
  );
}

function TasksSection({ board, active, activeUids, nameOf, canEdit }: {
  board: import('./tasksModel').TasksBoard; active: { uid: string; displayName: string }[];
  activeUids: string[]; nameOf: (u: string | null) => string | null; canEdit: boolean;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [assignee, setAssignee] = useState('');
  const [filter, setFilter] = useState('all');

  async function add() {
    if (!title.trim()) return;
    await tasksActions.addTask(title.trim(), assignee || null);
    setTitle(''); setAssignee('');
  }
  const shown = board.tasks.filter((tk) => {
    if (filter === 'all') return true;
    if (filter === 'none') return effectiveAssignee(tk, activeUids) === null;
    return effectiveAssignee(tk, activeUids) === filter;
  });
  const doneCount = board.tasks.filter((tk) => tk.done).length;

  return (
    <section className="bp-section">
      <div className="bp-section__head">
        <h3>{t('tasks.title')}</h3>
        <label className="bp-inline-field">
          <span className="bp-vh">{t('tasks.filterBy')}</span>
          <select className="bp-input bp-input--sm" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label={t('tasks.filterBy')}>
            <option value="all">{t('tasks.filterAll')}</option>
            <option value="none">{t('tasks.unassigned')}</option>
            {active.map((m) => <option key={m.uid} value={m.uid}>{m.displayName}</option>)}
          </select>
        </label>
      </div>
      <ProgressLine total={board.tasks.length} done={doneCount} label={t('tasks.progress')} />

      <ul className="bp-task-list" role="list">
        {shown.map((tk) => {
          const who = nameOf(effectiveAssignee(tk, activeUids));
          return (
            <li key={tk.id} className="bp-task">
              <label className="bp-check bp-task__check">
                <input type="checkbox" checked={tk.done} disabled={!canEdit} onChange={() => tasksActions.toggleTask(tk.id)} />
                <span className={tk.done ? 'bp-task__title is-done' : 'bp-task__title'}>{tk.title}</span>
              </label>
              {who ? <span className="bp-assignee"><span className="bp-avatar bp-avatar--sm" aria-hidden="true">{initialOf(who)}</span>{who}</span>
                   : <span className="bp-assignee bp-assignee--none">{t('tasks.unassigned')}</span>}
              {canEdit && <button className="bp-icon-btn bp-icon-btn--xs" aria-label={t('tasks.delete')} onClick={() => tasksActions.deleteTask(tk.id)}><span className="material-symbols-outlined" aria-hidden="true">close</span></button>}
            </li>
          );
        })}
        {board.tasks.length === 0 && <li className="bp-members__empty">{t('tasks.noTasks')}</li>}
      </ul>

      {canEdit && (
        <div className="bp-add-row">
          <input className="bp-input" value={title} placeholder={t('tasks.addPlaceholder')} aria-label={t('tasks.title')} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), void add())} />
          <select className="bp-input bp-input--sm" value={assignee} aria-label={t('tasks.assignee')} onChange={(e) => setAssignee(e.target.value)}>
            <option value="">{t('tasks.unassigned')}</option>
            {active.map((m) => <option key={m.uid} value={m.uid}>{m.displayName}</option>)}
          </select>
          <button className="bp-btn bp-btn--outline bp-btn--sm" onClick={add}>{t('tasks.add')}</button>
        </div>
      )}
    </section>
  );
}

function BookingsSection({ board, canEdit }: { board: import('./tasksModel').TasksBoard; canEdit: boolean }) {
  const { t } = useTranslation();
  const doneCount = board.bookings.filter((b) => b.done).length;
  return (
    <section className="bp-section">
      <div className="bp-section__head"><h3>{t('bookings.title')}</h3></div>
      <ProgressLine total={board.bookings.length} done={doneCount} label={t('bookings.title')} />
      {BOOKING_GROUPS.map((g) => (
        <div key={g} className="bp-book-group">
          <h4 className="bp-panel__h">{t(`bookings.group.${g}`)}</h4>
          <ul className="bp-check-list" role="list">
            {board.bookings.filter((b) => b.group === g).map((b) => (
              <li key={b.id}>
                <label className="bp-check">
                  <input type="checkbox" checked={b.done} disabled={!canEdit} onChange={() => tasksActions.toggleBooking(b.id)} />
                  <span className={b.done ? 'is-done' : ''}>{t(`bookings.item.${b.id}`)}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

function PackingSection({ board, canEdit }: { board: import('./tasksModel').TasksBoard; canEdit: boolean }) {
  const { t } = useTranslation();
  const [label, setLabel] = useState('');
  const [cat, setCat] = useState<PackCategory>('CLOTHES');
  const doneCount = board.packing.filter((p) => p.checked).length;

  function applyTpl(key: TemplateKey) {
    const items = TEMPLATES[key].map((x) => ({ label: t(x.labelKey), category: x.category }));
    void tasksActions.applyTemplate(items);
  }
  async function add() {
    if (!label.trim()) return;
    await tasksActions.addPack(label.trim(), cat);
    setLabel('');
  }

  return (
    <section className="bp-section">
      <div className="bp-section__head"><h3>{t('packing.title')}</h3></div>
      <ProgressLine total={board.packing.length} done={doneCount} label={t('packing.title')} />

      {canEdit && (
        <div className="bp-tpl-row">
          <span className="bp-tpl-row__label">{t('packing.templates')}:</span>
          {TEMPLATE_KEYS.map((k) => (
            <button key={k} className="bp-chip bp-chip--btn" onClick={() => applyTpl(k)}>{t(`packing.tpl.${k}`)}</button>
          ))}
        </div>
      )}

      {board.packing.length === 0 ? (
        <p className="bp-members__empty">{t('packing.empty')}</p>
      ) : (
        PACK_CATEGORIES.map((c) => {
          const items = board.packing.filter((p) => p.category === c);
          if (items.length === 0) return null;
          return (
            <div key={c} className="bp-book-group">
              <h4 className="bp-panel__h">{t(`packing.cat.${c}`)}</h4>
              <ul className="bp-check-list" role="list">
                {items.map((p) => (
                  <li key={p.id} className="bp-pack-item">
                    <label className="bp-check">
                      <input type="checkbox" checked={p.checked} disabled={!canEdit} onChange={() => tasksActions.togglePack(p.id)} />
                      <span className={p.checked ? 'is-done' : ''}>{p.label}</span>
                    </label>
                    {canEdit && <button className="bp-icon-btn bp-icon-btn--xs" aria-label={t('packing.delete')} onClick={() => tasksActions.deletePack(p.id)}><span className="material-symbols-outlined" aria-hidden="true">close</span></button>}
                  </li>
                ))}
              </ul>
            </div>
          );
        })
      )}

      {canEdit && (
        <div className="bp-add-row">
          <input className="bp-input" value={label} placeholder={t('packing.addPlaceholder')} aria-label={t('packing.title')} onChange={(e) => setLabel(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), void add())} />
          <select className="bp-input bp-input--sm" value={cat} aria-label={t('packing.category')} onChange={(e) => setCat(e.target.value as PackCategory)}>
            {PACK_CATEGORIES.map((c) => <option key={c} value={c}>{t(`packing.cat.${c}`)}</option>)}
          </select>
          <button className="bp-btn bp-btn--outline bp-btn--sm" onClick={add}>{t('packing.add')}</button>
        </div>
      )}
    </section>
  );
}
