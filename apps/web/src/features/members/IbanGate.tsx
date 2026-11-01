import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/features/auth/authStore';
import { profileActions, useProfile } from '@/features/profile/profileStore';
import { normalizeIban, validateIban, formatIban } from '@/features/profile/profileModel';
import { BankBadge } from '@/shared/BankBadge';
import { membersActions, useMembers } from './membersStore';

const DONE_MS = 3000;

/** On entering a trip, every active member must have an IBAN on record so the
 *  others can transfer their settlements. The IBAN is saved once on the
 *  profile and copied into this trip's member record (profiles are private;
 *  member records are readable by the trip). Silent when already set. After a
 *  successful save a confirmation shows briefly, then the banner goes away. */
export function IbanGate({ tripId, meUid }: { tripId: string; meUid: string }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { profile } = useProfile();
  const { members } = useMembers();
  const me = members?.find((m) => m.uid === meUid);
  const [val, setVal] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<string | null>(null); // IBAN just saved → confirmation
  const [hidden, setHidden] = useState(false);

  // Make sure the profile is loaded (it carries a previously saved IBAN).
  useEffect(() => {
    if (user && !profile) void profileActions.load({ uid: user.uid, email: user.email ?? '', displayName: user.displayName });
  }, [user, profile]);

  // Already on the profile but not on this trip yet → copy it over silently.
  const profIban = profile?.iban;
  const meIban = me?.iban;
  const active = me?.status === 'ACTIVE';
  useEffect(() => {
    if (active && !meIban && profIban) void membersActions.setIban(tripId, meUid, profIban);
  }, [active, meIban, profIban, tripId, meUid]);

  // Confirmation lingers, then the banner disappears.
  useEffect(() => {
    if (!saved) return;
    const id = window.setTimeout(() => setHidden(true), DONE_MS);
    return () => window.clearTimeout(id);
  }, [saved]);

  if (hidden || !me || !active) return null;
  if (!saved && (meIban || profIban)) return null;

  async function save() {
    setErr(null);
    const e = validateIban(val);
    if (e) { setErr(t('account.ibanInvalid')); return; }
    const iban = normalizeIban(val);
    setBusy(true);
    try {
      const okProfile = await profileActions.update({ iban });
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
      <div className="bp-ibangate bp-ibangate--ok" role="status" aria-live="polite">
        <span className="material-symbols-outlined bp-ibangate__icon" aria-hidden="true">check_circle</span>
        <div className="bp-ibangate__body">
          <strong>{t('members.ibanSaved')}</strong>
          <p>{t('members.ibanSavedText')}</p>
          <BankBadge iban={saved} />
          <p className="bp-iban__num" dir="ltr" style={{ marginTop: 6 }}>{formatIban(saved)}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bp-ibangate" role="region" aria-label={t('members.ibanGateTitle')}>
      <span className="material-symbols-outlined bp-ibangate__icon" aria-hidden="true">account_balance</span>
      <div className="bp-ibangate__body">
        <strong>{t('members.ibanGateTitle')}</strong>
        <p>{t('members.ibanGateText')}</p>
        <div className="bp-ibangate__row">
          <input className="bp-input" value={val} placeholder={t('account.ibanPh')} aria-label={t('account.iban')} inputMode="text" autoComplete="off"
            onChange={(e) => setVal(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), void save())} />
          <button className="bp-btn bp-btn--primary bp-btn--sm" disabled={busy || !val.trim()} onClick={save}>{busy ? t('expenses.saving') : t('members.ibanSave')}</button>
        </div>
        <BankBadge iban={val} />
        {err && <p className="bp-field__error" role="alert">{err}</p>}
      </div>
    </div>
  );
}
