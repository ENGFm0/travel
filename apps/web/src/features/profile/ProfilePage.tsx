import { useEffect, useState, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import type { Locale, ThemeChoice } from '@boardingpass/types';
import { useUIStore } from '@/app/store/uiStore';
import { useAuth, authActions } from '@/features/auth/authStore';
import { NOTIF_KEYS, validateAvatar, validateName, type NotifPrefs } from './profileModel';
import { profileActions, useProfile } from './profileStore';

export function ProfilePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { profile, error } = useProfile();

  useEffect(() => {
    if (user) void profileActions.load({ uid: user.uid, email: user.email ?? '', displayName: user.displayName });
    return () => profileActions.reset();
  }, [user]);

  if (!profile) {
    return <section className="bp-page" aria-busy="true"><p className="bp-page__lead">…</p></section>;
  }

  return (
    <section className="bp-page bp-profile">
      <h1>{t('pages.profile.title')}</h1>
      <p className="bp-page__lead">{t('pages.profile.lead')}</p>

      <ProfileForm />
      <PreferencesSection />
      <NotificationsSection notif={profile.notif} />
      <AccountSection error={error} onSignedOut={() => navigate('/')} />
    </section>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bp-settings-card">
      <h2 className="bp-settings-card__h">{title}</h2>
      {children}
    </section>
  );
}

function ProfileForm() {
  const { t } = useTranslation();
  const { profile } = useProfile();
  const [first, setFirst] = useState(profile?.firstName ?? '');
  const [middle, setMiddle] = useState(profile?.middleName ?? '');
  const [last, setLast] = useState(profile?.lastName ?? '');
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [errCode, setErrCode] = useState<string | null>(null);
  const [avatarErr, setAvatarErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  if (!profile) return null;

  async function save() {
    const nameErr = validateName(first, last);
    if (nameErr) { setErrCode(nameErr); return; }
    setErrCode(null);
    const ok = await profileActions.update({ firstName: first, middleName: middle, lastName: last, phone });
    if (ok) { setSaved(true); window.setTimeout(() => setSaved(false), 2000); }
  }

  async function onAvatar(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const err = validateAvatar(file.type, file.size);
    if (err) { setAvatarErr(err); return; }
    setAvatarErr(null);
    let url = '';
    try { url = URL.createObjectURL(file); } catch { /* jsdom */ }
    await profileActions.uploadAvatar(url);
  }

  const initial = (first || profile.email || '?').trim().charAt(0).toUpperCase();

  return (
    <Card title={t('account.profileTitle')}>
      <div className="bp-avatar-row">
        {profile.avatarUrl
          ? <img className="bp-avatar bp-avatar--lg" src={profile.avatarUrl} alt={t('account.avatar')} />
          : <span className="bp-avatar bp-avatar--lg" aria-hidden="true">{initial}</span>}
        <label className="bp-btn bp-btn--outline bp-btn--sm">
          {t('account.changeAvatar')}
          <input type="file" accept="image/jpeg,image/png,image/webp" className="bp-vh" onChange={onAvatar} aria-label={t('account.changeAvatar')} />
        </label>
      </div>
      {avatarErr && <div className="bp-banner" role="alert">{t(`account.avatarErrors.${avatarErr}`)}</div>}

      <div className="bp-grid-2">
        <div className="bp-field"><label htmlFor="bp-p-first">{t('auth.firstName')}</label><input id="bp-p-first" className="bp-input" value={first} onChange={(e) => setFirst(e.target.value)} /></div>
        <div className="bp-field"><label htmlFor="bp-p-middle">{t('auth.middleName')}</label><input id="bp-p-middle" className="bp-input" value={middle} onChange={(e) => setMiddle(e.target.value)} /></div>
        <div className="bp-field"><label htmlFor="bp-p-last">{t('auth.lastName')}</label><input id="bp-p-last" className="bp-input" value={last} onChange={(e) => setLast(e.target.value)} /></div>
        <div className="bp-field"><label htmlFor="bp-p-phone">{t('auth.phone')}</label><input id="bp-p-phone" className="bp-input" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
      </div>
      <div className="bp-field">
        <label htmlFor="bp-p-email">{t('auth.emailLabel')}</label>
        <input id="bp-p-email" className="bp-input" value={profile.email} readOnly aria-describedby="bp-email-note" />
        <span id="bp-email-note" className="bp-note">{t('account.emailImmutable')}</span>
      </div>

      {errCode && <div className="bp-banner" role="alert">{t(`account.nameErrors.${errCode}`)}</div>}
      <div className="bp-row-between">
        <button className="bp-btn bp-btn--primary" onClick={save}>{t('account.save')}</button>
        {saved && <span className="bp-ok" role="status">{t('account.saved')}</span>}
      </div>
    </Card>
  );
}

function Segmented<T extends string>({ label, value, options, onChange }: {
  label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void;
}) {
  return (
    <div className="bp-setting-row">
      <span className="bp-setting-row__label">{label}</span>
      <div className="bp-seg" role="group" aria-label={label}>
        {options.map((o) => (
          <button key={o.value} className={`bp-seg__btn ${value === o.value ? 'is-on' : ''}`} aria-pressed={value === o.value} onClick={() => onChange(o.value)}>{o.label}</button>
        ))}
      </div>
    </div>
  );
}

function PreferencesSection() {
  const { t } = useTranslation();
  const theme = useUIStore((s) => s.theme);
  const locale = useUIStore((s) => s.locale);
  const setTheme = useUIStore((s) => s.setTheme);
  const setLocale = useUIStore((s) => s.setLocale);

  return (
    <Card title={t('account.preferences')}>
      <Segmented<Locale> label={t('header.toggleLang')} value={locale}
        options={[{ value: 'ar', label: 'العربية' }, { value: 'en', label: 'English' }]} onChange={setLocale} />
      <Segmented<ThemeChoice> label={t('header.toggleTheme')} value={theme}
        options={[{ value: 'light', label: t('theme.light') }, { value: 'dark', label: t('theme.dark') }, { value: 'system', label: t('theme.system') }]}
        onChange={setTheme} />
    </Card>
  );
}

function NotificationsSection({ notif }: { notif: NotifPrefs }) {
  const { t } = useTranslation();
  function toggle(key: keyof NotifPrefs) {
    void profileActions.updateNotif({ ...notif, [key]: !notif[key] });
  }
  return (
    <Card title={t('account.notifications')}>
      {NOTIF_KEYS.map((k) => (
        <label key={k} className="bp-setting-row bp-toggle-switch">
          <span className="bp-setting-row__label">{t(`account.notif.${k}`)}</span>
          <input type="checkbox" checked={notif[k]} onChange={() => toggle(k)} aria-label={t(`account.notif.${k}`)} />
        </label>
      ))}
    </Card>
  );
}

function AccountSection({ error, onSignedOut }: { error: string | null; onSignedOut: () => void }) {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState(false);

  async function signOut() { await authActions.signOut(); onSignedOut(); }
  async function del() {
    const ok = await profileActions.deleteAccount();
    if (ok) { await authActions.signOut(); onSignedOut(); }
    else setConfirming(false);
  }

  return (
    <Card title={t('account.accountTitle')}>
      <div className="bp-row-between">
        <button className="bp-btn bp-btn--outline" onClick={signOut}>{t('account.signOut')}</button>
      </div>
      <div className="bp-danger-zone">
        <h3>{t('account.deleteTitle')}</h3>
        <p className="bp-note">{t('account.deleteLead')}</p>
        {error === 'OWNER_TRANSFER_REQUIRED' && (
          <div className="bp-banner" role="alert">{t('account.deleteBlocked')}</div>
        )}
        {!confirming ? (
          <button className="bp-btn bp-btn--danger" onClick={() => setConfirming(true)}>{t('account.deleteAccount')}</button>
        ) : (
          <div className="bp-row-between">
            <button className="bp-btn bp-btn--danger" onClick={del}>{t('account.confirmDelete')}</button>
            <button className="bp-btn bp-btn--outline" onClick={() => setConfirming(false)}>{t('trips.close')}</button>
          </div>
        )}
      </div>
    </Card>
  );
}
