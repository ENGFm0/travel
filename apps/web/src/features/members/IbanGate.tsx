import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/features/auth/authStore';
import { profileActions, useProfile } from '@/features/profile/profileStore';
import { normalizeIban, validateIban } from '@/features/profile/profileModel';
import { membersActions, useMembers } from './membersStore';
import { BankBadge } from '@/shared/BankBadge';

/** On entering a trip, every active member must have an IBAN on record so the
 *  others can transfer their settlements. The IBAN is saved once on the
 *  profile and copied into this trip's member record (profiles are private;
 *  member records are readable by the trip). Silent when already set. */
export function IbanGate({ tripId, meUid }: { tripId: string; meUid: string }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { profile } = useProfile();
  const { members } = useMembers();
  const me = members?.find((m) => m.uid === meUid);
  const [val, setVal] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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

  if (!me || !active || meIban || profIban) return null;

  async function save() {
    setErr(null);
    const e = validateIban(val);
    if (e) { setErr(t('account.ibanInvalid')); return; }
    const iban = normalizeIban(val);
    setBusy(true);
    try {
      await profileActions.update({ iban });
      await membersActions.setIban(tripId, meUid, iban);
    } finally {
      setBusy(false);
    }
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
