import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDate } from '@boardingpass/core';
import type { GlobalRole } from '@boardingpass/types';
import { useUIStore } from '@/app/store/uiStore';
import { useAuth } from '@/features/auth/authStore';
import { canManageRoles, filterAudit, filterUsers } from './adminModel';
import { adminActions, useAdmin } from './adminStore';

type Tab = 'users' | 'moderation' | 'audit' | 'roles';

export function AdminPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { data, loading } = useAdmin();
  const [tab, setTab] = useState<Tab>('users');

  useEffect(() => { void adminActions.load(); }, []);

  const role = user?.role ?? 'USER';
  const TABS: { key: Tab; label: string }[] = [
    { key: 'users', label: 'admin.tabUsers' },
    { key: 'moderation', label: 'admin.tabModeration' },
    { key: 'audit', label: 'admin.tabAudit' },
    { key: 'roles', label: 'admin.tabRoles' },
  ];

  return (
    <section className="bp-page bp-admin">
      <h1>{t('admin.title')}</h1>
      <div className="bp-tabs" role="tablist" aria-label={t('admin.title')}>
        {TABS.map((x) => (
          <button key={x.key} role="tab" aria-selected={tab === x.key} className={`bp-tabbtn ${tab === x.key ? 'is-on' : ''}`} onClick={() => setTab(x.key)}>{t(x.label)}</button>
        ))}
      </div>

      {loading && data === null ? <p className="bp-page__lead">…</p> : data && (
        <>
          {tab === 'users' && <UsersTab users={data.users} />}
          {tab === 'moderation' && <ModerationTab flags={data.flags} />}
          {tab === 'audit' && <AuditTab />}
          {tab === 'roles' && <RolesTab role={role} users={data.users} />}
        </>
      )}
    </section>
  );
}

function ReasonModal({ title, confirmLabel, onConfirm, onClose }: { title: string; confirmLabel: string; onConfirm: (reason: string) => void; onClose: () => void }) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  return (
    <div className="bp-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bp-modal" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => e.stopPropagation()}>
        <div className="bp-modal__head"><h2 className="bp-modal__title">{title}</h2>
          <button className="bp-icon-btn" aria-label={t('trips.close')} onClick={onClose}><span className="material-symbols-outlined" aria-hidden="true">close</span></button>
        </div>
        <div className="bp-field">
          <label htmlFor="bp-reason">{t('admin.reason')}</label>
          <textarea id="bp-reason" className="bp-input" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <div className="bp-row-between">
          <button className="bp-btn bp-btn--danger" disabled={!reason.trim()} onClick={() => onConfirm(reason.trim())}>{confirmLabel}</button>
          <button className="bp-btn bp-btn--outline" onClick={onClose}>{t('trips.close')}</button>
        </div>
      </div>
    </div>
  );
}

function UsersTab({ users }: { users: import('./adminModel').AdminUser[] }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [suspendUid, setSuspendUid] = useState<string | null>(null);
  const shown = useMemo(() => filterUsers(users, query), [users, query]);

  return (
    <div className="bp-admin-panel">
      <input className="bp-input" value={query} placeholder={t('admin.searchUsers')} aria-label={t('admin.searchUsers')} onChange={(e) => setQuery(e.target.value)} />
      <div className="bp-table-wrap">
        <table className="bp-table">
          <thead><tr><th>{t('admin.name')}</th><th>{t('admin.email')}</th><th>{t('admin.role')}</th><th>{t('admin.status')}</th><th></th></tr></thead>
          <tbody>
            {shown.map((u) => (
              <tr key={u.uid}>
                <td>{u.name}</td><td>{u.email}</td><td>{u.role}</td>
                <td><span className={`bp-status-chip ${u.status === 'ACTIVE' ? 'bp-status-chip--ok' : ''}`}>{t(`admin.userStatus.${u.status}`)}</span></td>
                <td>
                  {u.status === 'ACTIVE'
                    ? <button className="bp-btn bp-btn--outline bp-btn--sm" onClick={() => setSuspendUid(u.uid)}>{t('admin.suspend')}</button>
                    : <button className="bp-btn bp-btn--outline bp-btn--sm" onClick={() => adminActions.reactivate(u.uid)}>{t('admin.reactivate')}</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {suspendUid && (
        <ReasonModal title={t('admin.suspendTitle')} confirmLabel={t('admin.suspend')}
          onConfirm={(reason) => { void adminActions.suspend(suspendUid, reason); setSuspendUid(null); }}
          onClose={() => setSuspendUid(null)} />
      )}
    </div>
  );
}

function ModerationTab({ flags }: { flags: import('./adminModel').Flag[] }) {
  const { t } = useTranslation();
  const [removeId, setRemoveId] = useState<string | null>(null);
  return (
    <div className="bp-admin-panel">
      <ul className="bp-flag-list" role="list">
        {flags.map((f) => (
          <li key={f.id} className="bp-flag">
            <div className="bp-flag__info">
              <span className="bp-chip bp-chip--cat">{t(`admin.domain.${f.domain}`)}</span>
              <span className="bp-flag__summary">{f.summary}</span>
              <span className="bp-flag__reason">{f.reason}</span>
            </div>
            {f.status === 'PENDING' ? (
              <div className="bp-flag__actions">
                <button className="bp-btn bp-btn--danger bp-btn--sm" onClick={() => setRemoveId(f.id)}>{t('admin.remove')}</button>
                <button className="bp-btn bp-btn--outline bp-btn--sm" onClick={() => adminActions.moderate(f.id, 'APPROVE', 'ok')}>{t('admin.approve')}</button>
              </div>
            ) : <span className="bp-status-chip">{t(`admin.flagStatus.${f.status}`)}</span>}
          </li>
        ))}
        {flags.length === 0 && <li className="bp-members__empty">{t('admin.noFlags')}</li>}
      </ul>
      {removeId && (
        <ReasonModal title={t('admin.removeTitle')} confirmLabel={t('admin.remove')}
          onConfirm={(reason) => { void adminActions.moderate(removeId, 'REMOVE', reason); setRemoveId(null); }}
          onClose={() => setRemoveId(null)} />
      )}
    </div>
  );
}

function AuditTab() {
  const { t } = useTranslation();
  const locale = useUIStore((s) => s.locale);
  const { data } = useAdmin();
  const [query, setQuery] = useState('');
  const entries = useMemo(() => filterAudit(data?.audit ?? [], query), [data, query]);
  return (
    <div className="bp-admin-panel">
      <p className="bp-note">{t('admin.auditNote')}</p>
      <input className="bp-input" value={query} placeholder={t('admin.searchAudit')} aria-label={t('admin.searchAudit')} onChange={(e) => setQuery(e.target.value)} />
      {entries.length === 0 ? <p className="bp-members__empty">{t('admin.noAudit')}</p> : (
        <ul className="bp-audit-list" role="list">
          {entries.map((e) => (
            <li key={e.id} className="bp-audit">
              <span className="bp-audit__action">{e.action}</span>
              <span className="bp-audit__target">{e.target}</span>
              {e.reason && <span className="bp-audit__reason">{e.reason}</span>}
              <span className="bp-audit__ts">{e.actor} · {formatDate(e.ts, locale, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RolesTab({ role, users }: { role: GlobalRole; users: import('./adminModel').AdminUser[] }) {
  const { t } = useTranslation();
  if (!canManageRoles(role)) {
    return <div className="bp-banner" role="alert">{t('admin.rolesBlocked')}</div>;
  }
  const ROLES: GlobalRole[] = ['USER', 'ADMIN', 'SUPER_ADMIN'];
  return (
    <div className="bp-admin-panel">
      <div className="bp-table-wrap">
        <table className="bp-table">
          <thead><tr><th>{t('admin.name')}</th><th>{t('admin.email')}</th><th>{t('admin.role')}</th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.uid}>
                <td>{u.name}</td><td>{u.email}</td>
                <td>
                  <select className="bp-input bp-input--sm" value={u.role} aria-label={t('admin.role')} onChange={(e) => adminActions.assignRole(u.uid, e.target.value as GlobalRole)}>
                    {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
