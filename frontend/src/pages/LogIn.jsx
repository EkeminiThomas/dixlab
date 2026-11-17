import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { logIn, homeFor, nextPage } from '../api.js';
import { AuthLayout, Field, SubmitButton } from './AuthAside.jsx';

export default function LogIn() {
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [needsCode, setNeedsCode] = useState(false); // two-step login: the password was right, now the app's code
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password) return setError('Enter your email and password.');
    if (needsCode && !code.trim()) return setError('Enter the code from your authenticator app.');
    setBusy(true);
    setError('');
    try {
      const user = await logIn({ email: email.trim(), password, code: needsCode ? code.trim() : undefined });
      if (user.mustVerify) nav(`/confirm-email${nextPage() ? `?next=${encodeURIComponent(nextPage())}` : ''}`);
      else nav(nextPage() || homeFor(user));
    } catch (err) {
      if (err.body?.code === 'two_factor_required') {
        setNeedsCode(true);
      } else {
        setError(err.offline ? 'Can’t reach the Dixlab server. Make sure the backend is running, then try again.' : err.message);
        if (err.body?.code === 'two_factor_invalid') setCode('');
      }
      setBusy(false);
    }
  };

  const startOver = () => { setNeedsCode(false); setCode(''); setPassword(''); setError(''); };

  return (
    <AuthLayout
      mode="login"
      title={needsCode ? 'One more step.' : 'Welcome back.'}
      lead={needsCode ? 'Open your authenticator app and enter the 6-digit code for Dixlab.' : 'Pick up your story where you left off.'}
      footer={<p className="auth__switch">New to Dixlab?&nbsp;&nbsp;<Link to="/signup">Create account</Link></p>}
    >
      <form className="auth__form" onSubmit={submit} noValidate>
        {!needsCode ? (
          <>
            <Field label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="alex.morgan@email.com" autoComplete="email" />
            <Field label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••••" autoComplete="current-password" />
            <p className="auth__forgot"><Link to="/forgot-password" state={{ email: email.trim() }}>Forgot your password?</Link></p>
          </>
        ) : (
          <>
            <Field label="Authentication code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="123 456"
              autoComplete="one-time-code" inputMode="text" autoFocus maxLength={32} />
            <p className="auth__forgot">
              Lost your phone? Enter one of your recovery codes instead. ·{' '}
              <button type="button" className="auth__link-btn" onClick={startOver}>Use a different account</button>
            </p>
          </>
        )}
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="auth__submit">
          <SubmitButton busy={busy}>{busy ? (needsCode ? 'Checking…' : 'Logging in…') : (needsCode ? 'Verify' : 'Log in')}</SubmitButton>
        </div>
      </form>
    </AuthLayout>
  );
}
