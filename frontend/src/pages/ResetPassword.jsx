import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { resetPassword } from '../api.js';
import { AuthLayout, Field, SubmitButton } from './AuthAside.jsx';
import { useLinkToken } from './VerifyEmail.jsx';

/** Choose a new password from the emailed link. */
export default function ResetPassword() {
  const token = useLinkToken();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  useEffect(() => { if (token === '') setError('This link is incomplete. Ask for a new one.'); }, [token]);

  const submit = async (e) => {
    e.preventDefault();
    if (password.length < 8) return setError('Use at least 8 characters.');
    if (password !== confirm) return setError('The two passwords don’t match.');
    setBusy(true); setError('');
    try {
      await resetPassword(token, password);
      setDone(true);
    } catch (err) {
      setError(err.offline ? 'Can’t reach the Dixlab server. Please try again.'
        : err.status === 422 ? 'This link is incomplete or damaged. Ask for a new one below.' : err.message);
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      mode="reset"
      title={done ? 'Password changed.' : 'Choose a new password.'}
      lead={done ? 'For your security, you’ve been logged out everywhere. Log in with your new password.' : 'Pick something you don’t use anywhere else.'}
      footer={!done && <p className="auth__switch">Link not working?&nbsp;&nbsp;<Link to="/forgot-password">Send a new one</Link></p>}
    >
      {done ? (
        <div className="auth__submit"><Link to="/login" className="app-btn app-btn--primary">Log in</Link></div>
      ) : (
        <form className="auth__form" onSubmit={submit} noValidate>
          <Field label="New password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" hint="At least 8 characters." autoFocus />
          <Field label="Type it again" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="auth__submit"><SubmitButton busy={busy}>{busy ? 'Saving…' : 'Save new password'}</SubmitButton></div>
        </form>
      )}
    </AuthLayout>
  );
}
