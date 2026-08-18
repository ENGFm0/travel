import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { CURRENT_UID, type Member } from './membersService';
import { membersActions, useMembers } from './membersStore';

function initialOf(name: string): string {
  return name.trim().charAt(0).toUpperCase() || '?';
}

export function MembersPanel({ tripId }: { tripId: string }) {
  const { t } = useTranslation();
  const { members, loading, error } = useMembers();

  const [link, setLink] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [name, setName] = useState('');
  const [handle, setHandle] = useState('');
  const [inviting, setInviting] = useState(false);

  useEffect(() => {
    void membersActions.load(tripId);
  }, [tripId]);

  useEffect(() => {
    let live = true;
    void membersActions.inviteLink(tripId).then((l) => live && setLink(l));
    return () => { live = false; };
  }, [tripId]);

  const me = members?.find((m) => m.uid === CURRENT_UID);
  const isOwner = me?.role === 'OWNER';

  const { active, pending } = useMemo(() => {
    const list = members ?? [];
    return {
      active: list.filter((m) => m.status === 'ACTIVE'),
      pending: list.filter((m) => m.status === 'PENDING'),
    };
  }, [members]);

  async function copy() {
    try {
      await navigator.clipboard?.writeText(link);
    } catch {
      /* clipboard may be unavailable (e.g. jsdom); feedback still shown */
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  async function submitInvite(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setInviting(true);
    const ok = await membersActions.invite(tripId, { name: name.trim(), handle: handle.trim() || undefined });
    setInviting(false);
    if (ok) { setName(''); setHandle(''); }
  }

  const errText = error ? t(`members.errors.${error}`, t('members.errors.GENERIC')) : null;

  return (
    <section className="bp-members" aria-busy={loading || undefined}>
      <h2 className="bp-members__h">{t('members.title')}</h2>

      {isOwner && (
        <div className="bp-invite-box">
          <label htmlFor="bp-invite-link" className="bp-invite-box__label">{t('members.inviteLink')}</label>
          <div className="bp-invite-row">
            <input id="bp-invite-link" className="bp-input" readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
            <button type="button" className="bp-btn bp-btn--outline" onClick={copy}>
              {copied ? t('members.copied') : t('members.copy')}
            </button>
          </div>
          <p className="bp-invite-box__note">{t('members.linkNote')}</p>
        </div>
      )}

      {isOwner && (
        <form className="bp-invite-form" onSubmit={submitInvite}>
          <div className="bp-field">
            <label htmlFor="bp-inv-name">{t('members.inviteeName')}</label>
            <input id="bp-inv-name" className="bp-input" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('members.inviteeNamePh')} />
          </div>
          <div className="bp-field">
            <label htmlFor="bp-inv-handle">{t('members.inviteeHandle')}</label>
            <input id="bp-inv-handle" className="bp-input" value={handle} onChange={(e) => setHandle(e.target.value)} placeholder={t('members.inviteeHandlePh')} />
          </div>
          <button type="submit" className="bp-btn bp-btn--primary" disabled={inviting || !name.trim()} style={{ alignSelf: 'end' }}>
            {t('members.invite')}
          </button>
        </form>
      )}

      {errText && <div className="bp-banner" role="alert">{errText}</div>}

      {loading && members === null ? (
        <p className="bp-page__lead">…</p>
      ) : (
        <>
          {pending.length > 0 && (
            <>
              <h3 className="bp-members__sub">{t('members.pendingTitle')}</h3>
              <ul className="bp-member-list" role="list">
                {pending.map((m) => (
                  <MemberRow key={m.uid} tripId={tripId} m={m} isOwner={isOwner} />
                ))}
              </ul>
            </>
          )}

          <h3 className="bp-members__sub">{t('members.activeTitle')}</h3>
          <ul className="bp-member-list" role="list">
            {active.map((m) => (
              <MemberRow key={m.uid} tripId={tripId} m={m} isOwner={isOwner} />
            ))}
          </ul>

          {active.length <= 1 && pending.length === 0 && (
            <p className="bp-members__empty">{t('members.onlyYou')}</p>
          )}
        </>
      )}
    </section>
  );
}

function MemberRow({ tripId, m, isOwner }: { tripId: string; m: Member; isOwner: boolean }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const isMe = m.uid === CURRENT_UID;
  const owner = m.role === 'OWNER';

  async function guard(fn: () => Promise<unknown>) {
    setBusy(true);
    try { await fn(); } finally { setBusy(false); }
  }

  const roleLabel = t(`members.role.${m.role}`);

  return (
    <li className="bp-member">
      <span className="bp-avatar" aria-hidden="true">{initialOf(m.displayName)}</span>
      <div className="bp-member__info">
        <span className="bp-member__name">
          {m.displayName}{isMe && ` (${t('members.you')})`}
        </span>
        {m.handle && <span className="bp-member__handle">{m.handle}</span>}
      </div>
      <span className={`bp-role-chip ${owner ? 'is-owner' : ''}`}>{roleLabel}</span>
      {m.status === 'PENDING' && <span className="bp-status-chip">{t('members.pending')}</span>}

      <div className="bp-member__actions">
        {/* Pending → owner accepts/declines on the invitee's behalf (demo);
            real invitee acts from their own device. */}
        {isOwner && m.status === 'PENDING' && (
          <>
            <button className="bp-btn bp-btn--outline bp-btn--sm" disabled={busy} onClick={() => guard(() => membersActions.accept(tripId, m.uid))}>{t('members.accept')}</button>
            <button className="bp-icon-btn" aria-label={t('members.decline')} disabled={busy} onClick={() => guard(() => membersActions.decline(tripId, m.uid))}>
              <span className="material-symbols-outlined" aria-hidden="true">close</span>
            </button>
          </>
        )}

        {isOwner && !owner && m.status === 'ACTIVE' && (
          <>
            {m.role === 'MEMBER' ? (
              <button className="bp-btn bp-btn--outline bp-btn--sm" disabled={busy} onClick={() => guard(() => membersActions.setRole(tripId, m.uid, 'VIEWER'))}>{t('members.makeViewer')}</button>
            ) : (
              <button className="bp-btn bp-btn--outline bp-btn--sm" disabled={busy} onClick={() => guard(() => membersActions.setRole(tripId, m.uid, 'MEMBER'))}>{t('members.makeMember')}</button>
            )}
            <button className="bp-btn bp-btn--outline bp-btn--sm" disabled={busy} onClick={() => { if (window.confirm(t('members.confirmTransfer', { name: m.displayName }))) void guard(() => membersActions.transfer(tripId, m.uid)); }}>{t('members.transfer')}</button>
            <button className="bp-icon-btn" aria-label={t('members.remove')} disabled={busy} onClick={() => { if (window.confirm(t('members.confirmRemove', { name: m.displayName }))) void guard(() => membersActions.remove(tripId, m.uid)); }}>
              <span className="material-symbols-outlined" aria-hidden="true">person_remove</span>
            </button>
          </>
        )}

        {isMe && (
          <button className="bp-btn bp-btn--outline bp-btn--sm" disabled={busy} onClick={() => { if (window.confirm(t('members.confirmLeave'))) void guard(() => membersActions.leave(tripId, m.uid)); }}>{t('members.leave')}</button>
        )}
      </div>
    </li>
  );
}
