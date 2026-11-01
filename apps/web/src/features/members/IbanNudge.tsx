import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useAuth } from '@/features/auth/authStore';
import { profileActions, useProfile } from '@/features/profile/profileStore';
import { normalizeIban, validateIban, formatIban } from '@/features/profile/profileModel';
import { BankBadge } from '@/shared/BankBadge';
import { membersActions, useMembers } from './membersStore';

const DONE_MS = 3000;
const dismissKey = (tripId: string) => `bp.ibanNudge.dismissed.${tripId}`;

/** Keeps a member's trip record in sync with the IBAN saved on their profile
 *  (profiles are private; member records are readable by the trip). No UI. */
export function useSyncProfileIban(tripId: string, meUid: string): void {
  const { user } = useAuth();
  const { profile } = useProfile();
  const { members } = useMembers();
  const me = members?.find((m) => m.uid === meUid);
  const profIban = profile?.iban;
  const meIban = me?.iban;
  const active = me?.status === 'ACTIVE';
  useEffect(() => {
    if (user && !profile) void profileActions.load({ uid: user.uid, email: user.email ?? '', displayName: user.displayName });
  }, [user, profile]);
  useEffect(() => {
    if (active && !meIban && profIban) void membersActions.setIban(tripId, meUid, profIban);
  }, [active, meIban, profIban, tripId, meUid]);
}

/** One-line, dismissible nudge shown only at the moment of need: the current
 *  user is owed a transfer but has no IBAN on record. Inline save (profile +
 *  this trip's member record), brief confirmation, then it goes away. */
export function IbanNudge({ tripId, meUid }: { tripId: string; meUid: string }) {
  const { t } = useTranslation();
  const [val, setVal] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [hidden, setHidden] = useState(() => { try { return sessionStorage.getItem(dismissKey(tripId)) === '1'; } catch { return false; } });

  useEffect(() => {
    if (!saved) return;
    const id = window.setTimeout(() => setHidden(true), DONE_MS);
    return () => window.clearTimeout(id);
  }, [saved]);

  if (hidden) return null;

  function dismiss() {
    try { sessionStorage.setItem(dismissKey(tripId), '1'); } catch { /* ignore */ }
    setHidden(true);
  }

  async function save() {
    setErr(null);
    if (validateIban(val)) { setErr(t('account.ibanInvalid')); return; }
    const iban = normalizeIban(val);
    setBusy(true);
    try {
      let okProfile = false;
      try { okProfile = await profileActions.update({ iban }); } catch { okProfile = false; }
      const okMember = await membersActions.setIban(tripId, meUid, iban);
      if (!okProfile && !okMember) { setErr(t('members.ibanSaveFailed')); return; }
      setSaved(iban);
    } catch {
      setErr(t('members.ibanSaveFailed'));
    } finally {
      setBusy(false);
    }
  }

  if (saved) {
    return (
      <div className="bp-nudge bp-nudge--ok" role="status" aria-live="polite">
        <span className="material-symbols-outlined bp-nudge__icon" aria-hidden="true">check_circle</span>
        <span className="bp-nudge__text">{t('members.ibanSaved')} <BankBadge iban={saved} compact /> <span className="bp-iban__num">{formatIban(saved)}</span></span>
      </div>
    );
  }

  return (
    <div className="bp-nudge" role="region" aria-label={t('members.ibanNudge')}>
      <span className="material-symbols-outlined bp-nudge__icon" aria-hidden="true">account_balance</span>
      <div className="bp-nudge__body">
        <span className="bp-nudge__text">{t('members.ibanNudge')} <Link to="/profile" className="bp-link">{t('members.ibanNudgeProfile')}</Link></span>
        <div className="bp-nudge__row">
          <input className="bp-input" value={val} placeholder={t('account.ibanPh')} aria-label={t('account.iban')} inputMode="text" autoComplete="off"
            onChange={(e) => { setVal(e.target.value); setErr(null); }} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), void save())} />
          <button type="button" className="bp-btn bp-btn--primary bp-btn--sm" disabled={busy || !val.trim()} onClick={save}>{busy ? t('expenses.saving') : t('members.ibanSave')}</button>
        </div>
        <BankBadge iban={val} compact />
        {err && <p className="bp-field__error" role="alert">{err}</p>}
      </div>
      <button type="button" className="bp-icon-btn bp-icon-btn--xs bp-nudge__close" aria-label={t('members.ibanNudgeDismiss')} onClick={dismiss}>
        <span className="material-symbols-outlined" aria-hidden="true">close</span>
      </button>
    </div>
  );
}
