import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { emailSchema, passwordSchema } from '@boardingpass/validation';
import { isApiError } from '@boardingpass/core';
import { useAuth, authActions } from './authStore';

type Step = 'email' | 'login' | 'register' | 'forgot';

export function AuthModal() {
  const { t } = useTranslation();
  const { modalOpen, closeAuth } = useAuth();

  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const firstFieldRef = useRef<HTMLInputElement>(null);

  // reset internal state whenever the modal (re)opens
  useEffect(() => {
    if (modalOpen) {
      setStep('email');
      setPassword('');
      setErrorCode(null);
      setResetSent(false);
      setBusy(false);
    }
  }, [modalOpen]);

  // focus the first field on step change; ESC closes
  useEffect(() => {
    if (!modalOpen) return;
    firstFieldRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeAuth();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [modalOpen, step, closeAuth]);

  if (!modalOpen) return null;

  const errMsg = errorCode ? t(`auth.errors.${errorCode}`, t('auth.errors.GENERIC')) : null;

  const handleError = (e: unknown) => setErrorCode(isApiError(e) ? e.code : 'GENERIC');

  async function continueEmail() {
    setErrorCode(null);
    if (!emailSchema.safeParse(email).success) return setErrorCode('EMAIL_INVALID');
    setBusy(true);
    try {
      const exists = await authActions.checkEmail(email);
      setStep(exists ? 'login' : 'register');
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  }

  async function doLogin() {
    setErrorCode(null);
    if (!password) return setErrorCode('REQUIRED');
    setBusy(true);
    try {
      await authActions.signIn(email, password); // subscription closes modal on success
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  }

  async function doRegister() {
    setErrorCode(null);
    if (!firstName.trim() || !lastName.trim()) return setErrorCode('REQUIRED');
    if (!emailSchema.safeParse(email).success) return setErrorCode('EMAIL_INVALID');
    const pw = passwordSchema.safeParse(password);
    if (!pw.success) return setErrorCode(pw.error.issues[0]?.message ?? 'PASSWORD_TOO_SHORT');
    if (password !== confirm) return setErrorCode('PASSWORD_MISMATCH');
    setBusy(true);
    try {
      await authActions.register({ firstName, middleName, lastName, email, phone, password });
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  }

  async function providerAction(fn: () => Promise<void>) {
    setErrorCode(null);
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  }

  async function doReset() {
    setErrorCode(null);
    if (!emailSchema.safeParse(email).success) return setErrorCode('EMAIL_INVALID');
    setBusy(true);
    try {
      await authActions.reset(email);
      setResetSent(true);
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  }

  const titleKey =
    step === 'email' ? 'auth.step1Title'
    : step === 'login' ? 'auth.signInTitle'
    : step === 'register' ? 'auth.createTitle'
    : 'auth.forgotTitle';

  return (
    <div className="bp-scrim" onMouseDown={(e) => e.target === e.currentTarget && closeAuth()}>
      <div
        className="bp-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bp-auth-title"
        data-testid="auth-modal"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="bp-modal__head">
          <h2 className="bp-modal__title" id="bp-auth-title">{t(titleKey)}</h2>
          <button className="bp-icon-btn" onClick={closeAuth} aria-label={t('auth.close')}>
            <span className="material-symbols-outlined" aria-hidden="true">close</span>
          </button>
        </div>

        {errMsg && <div className="bp-banner" role="alert">{errMsg}</div>}

        {/* ── Step: email ── */}
        {step === 'email' && (
          <>
            <button className="bp-btn bp-btn--outline" disabled={busy} onClick={() => providerAction(authActions.google)}>
              {t('auth.continueGoogle')}
            </button>
            <button className="bp-btn bp-btn--outline" disabled={busy} onClick={() => providerAction(authActions.guest)}>
              {t('auth.guest')}
            </button>
            <div className="bp-sep">{t('auth.or')}</div>
            <div className="bp-field">
              <label htmlFor="bp-email">{t('auth.emailLabel')}</label>
              <input
                id="bp-email" ref={firstFieldRef} className="bp-input" type="email" dir="ltr"
                inputMode="email" autoComplete="email" value={email}
                placeholder={t('auth.emailPlaceholder')}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && continueEmail()}
              />
              <p style={{ margin: 0, fontSize: 12, color: 'var(--bp-ink-muted)' }}>{t('auth.helper')}</p>
            </div>
            <button className="bp-btn bp-btn--primary" disabled={busy} onClick={continueEmail}>
              {t('auth.continueEmail')}
            </button>
          </>
        )}

        {/* ── Step: login ── */}
        {step === 'login' && (
          <>
            <EmailRow email={email} onEdit={() => setStep('email')} editLabel={t('auth.editEmail')} />
            <div className="bp-field">
              <label htmlFor="bp-pw">{t('auth.passwordLabel')}</label>
              <input
                id="bp-pw" ref={firstFieldRef} className="bp-input" type={showPw ? 'text' : 'password'}
                autoComplete="current-password" value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && doLogin()}
              />
              <button className="bp-link" type="button" onClick={() => setShowPw((v) => !v)}>
                {showPw ? t('auth.hidePassword') : t('auth.showPassword')}
              </button>
            </div>
            <button className="bp-link" type="button" onClick={() => { setResetSent(false); setStep('forgot'); }}>
              {t('auth.forgot')}
            </button>
            <button className="bp-btn bp-btn--primary" disabled={busy} onClick={doLogin}>
              {t('auth.signIn')}
            </button>
          </>
        )}

        {/* ── Step: register ── */}
        {step === 'register' && (
          <>
            <EmailRow email={email} onEdit={() => setStep('email')} editLabel={t('auth.editEmail')} />
            <div className="bp-grid-2">
              <div className="bp-field">
                <label htmlFor="bp-fn">{t('auth.firstName')}</label>
                <input id="bp-fn" ref={firstFieldRef} className="bp-input" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
              </div>
              <div className="bp-field">
                <label htmlFor="bp-ln">{t('auth.lastName')}</label>
                <input id="bp-ln" className="bp-input" value={lastName} onChange={(e) => setLastName(e.target.value)} />
              </div>
            </div>
            <div className="bp-field">
              <label htmlFor="bp-mn">{t('auth.middleName')}</label>
              <input id="bp-mn" className="bp-input" value={middleName} onChange={(e) => setMiddleName(e.target.value)} />
            </div>
            <div className="bp-field">
              <label htmlFor="bp-ph">{t('auth.phone')}</label>
              <input id="bp-ph" className="bp-input" type="tel" dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="bp-grid-2">
              <div className="bp-field">
                <label htmlFor="bp-pw2">{t('auth.passwordLabel')}</label>
                <input id="bp-pw2" className="bp-input" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              <div className="bp-field">
                <label htmlFor="bp-cf">{t('auth.confirmLabel')}</label>
                <input id="bp-cf" className="bp-input" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
              </div>
            </div>
            <button className="bp-btn bp-btn--primary" disabled={busy} onClick={doRegister}>
              {t('auth.createAccount')}
            </button>
          </>
        )}

        {/* ── Step: forgot ── */}
        {step === 'forgot' && (
          <>
            {resetSent ? (
              <div className="bp-ok" role="status">{t('auth.resetSent')}</div>
            ) : (
              <>
                <EmailRow email={email} onEdit={() => setStep('email')} editLabel={t('auth.editEmail')} />
                <button className="bp-btn bp-btn--primary" disabled={busy} onClick={doReset}>
                  {t('auth.sendReset')}
                </button>
              </>
            )}
            <button className="bp-link" type="button" onClick={() => setStep('login')}>{t('auth.backToSignin')}</button>
          </>
        )}
      </div>
    </div>
  );
}

function EmailRow({ email, onEdit, editLabel }: { email: string; onEdit: () => void; editLabel: string }) {
  return (
    <div className="bp-field">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span dir="ltr" style={{ fontWeight: 600 }}>{email}</span>
        <button className="bp-link" type="button" onClick={onEdit}>{editLabel}</button>
      </div>
    </div>
  );
}
