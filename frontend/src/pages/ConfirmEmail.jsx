import { useEffect, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useUser } from '../components/ui.jsx';
import { isSignedIn, verifyCode, resendVerification, changeUnverifiedEmail, refreshUser, logOut, homeFor, nextPage } from '../api.js';
import { AuthLayout, Field, SubmitButton } from './AuthAside.jsx';

const COOLDOWN = 60; // seconds before "Send a new code" works again

/**
 * "Confirm your email": where new accounts land after sign-up (and unconfirmed
 * ones after logging in). Type the 6-digit code from the email, or click its
 * link; resend it, or fix a mistyped address. The rest of the app opens once
 * the address is confirmed.
 */
export default function ConfirmEmail() {
  const nav = useNavigate();
  const loc = useLocation();
  const user = useUser();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [wait, setWait] = useState(loc.state?.sent ? COOLDOWN : 0); // sign-up has just sent one
  const [fixing, setFixing] = useState(false);
  const [fix, setFix] = useState({ email: '', password: '' });
  const submitted = useRef('');
  const next = nextPage();

  // Clicked the link in the email (maybe on another device)? Notice and move on.
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === 'visible') refreshUser(); }, 5000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (wait <= 0) return undefined;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const confirm = async (value = code) => {
    const digits = value.replace(/\D/g, '');
    if (digits.length !== 6) return setError('Enter the 6-digit code from the email.');
    if (busy) return undefined;
    setBusy(true); setError(''); setNote('');
    try {
      await verifyCode(digits);
      nav(next || homeFor({ ...user, mustVerify: false }), { replace: true });
    } catch (e) {
      setError(e.offline ? 'Can’t reach the Dixlab server. Check your connection and try again.' : e.message);
      setCode('');
      setBusy(false);
    }
    return undefined;
  };
  const onCode = (e) => {
    const v = e.target.value.replace(/[^\d\s]/g, '').slice(0, 7);
    setCode(v);
    const digits = v.replace(/\D/g, '');
    if (digits.length === 6 && submitted.current !== digits) { submitted.current = digits; confirm(digits); } // pasted or typed in full
  };
  const resend = async () => {
    setError(''); setNote('');
    try {
      const res = await resendVerification();
      if (res?.verified) { await refreshUser(); return; }
      setNote('Sent. The new code replaces the old one, so use the latest email.');
      setWait(COOLDOWN);
    } catch (e) { setError(e.message); }
  };
  const saveEmail = async (e) => {
    e.preventDefault();
    if (!fix.email.trim() || !fix.password) return setError('Enter the right email and your password.');
    setBusy(true); setError(''); setNote('');
    try {
      const res = await changeUnverifiedEmail(fix.email.trim(), fix.password);
      setFixing(false); setFix({ email: '', password: '' }); setWait(COOLDOWN);
      setNote(res.sent ? `We sent a new code to ${res.email}.` : `Your email is now ${res.email}. Press “Send a new code” to get your code.`);
    } catch (err) { setError(err.message); }
    setBusy(false);
    return undefined;
  };

  if (!isSignedIn()) return <Navigate to="/login" replace />;
  if (user && user.mustVerify === false) return <Navigate to={next || homeFor(user)} replace />;

  return (
    <AuthLayout
      mode="verify"
      title="Confirm your email."
      lead={<>We sent a 6-digit code to <b className="cfm__email">{user?.email || 'your inbox'}</b>. Enter it below, or click the link in the same email.</>}
      footer={<p className="auth__switch">Not you?&nbsp;&nbsp;<button type="button" className="cfm__link" onClick={async () => { await logOut(); nav('/login'); }}>Log out</button></p>}
    >
      {!fixing ? (
        <form className="auth__form" onSubmit={(e) => { e.preventDefault(); confirm(); }} noValidate>
          <label className="field">
            <span className="field__label">Confirmation code</span>
            <input className="field__input cfm__code" value={code} onChange={onCode} placeholder="123 456" inputMode="numeric"
              autoComplete="one-time-code" autoFocus maxLength={7} aria-describedby="cfm-hint" disabled={busy} />
            <small id="cfm-hint" className="field__hint">The code works for 15 minutes. Can’t see the email? Check spam or promotions.</small>
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          {note && <p className="cfm__note" role="status">{note}</p>}
          <div className="auth__submit"><SubmitButton busy={busy}>{busy ? 'Checking…' : 'Confirm email'}</SubmitButton></div>
          <div className="cfm__row">
            <button type="button" className="cfm__link" onClick={resend} disabled={wait > 0}>
              {wait > 0 ? `Send a new code in ${wait}s` : 'Send a new code'}
            </button>
            <button type="button" className="cfm__link" onClick={() => { setFixing(true); setError(''); setNote(''); }}>Wrong email? Change it</button>
          </div>
        </form>
      ) : (
        <form className="auth__form" onSubmit={saveEmail} noValidate>
          <Field label="The right email" type="email" value={fix.email} onChange={(e) => setFix({ ...fix, email: e.target.value })}
            placeholder="alex.morgan@email.com" autoComplete="email" autoFocus />
          <Field label="Your password" type="password" value={fix.password} onChange={(e) => setFix({ ...fix, password: e.target.value })}
            placeholder="••••••••••" autoComplete="current-password" hint="So nobody else can move your account to their address." />
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="auth__submit"><SubmitButton busy={busy}>{busy ? 'Saving…' : 'Save and send a new code'}</SubmitButton></div>
          <div className="cfm__row"><button type="button" className="cfm__link" onClick={() => { setFixing(false); setError(''); }}>← Back to the code</button></div>
        </form>
      )}
    </AuthLayout>
  );
}
