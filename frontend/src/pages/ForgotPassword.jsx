import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { forgotPassword } from '../api.js';
import { AuthLayout, Field, SubmitButton } from './AuthAside.jsx';

/** Ask for a password reset link. The answer is the same whether or not the email has an account. */
export default function ForgotPassword() {
  const { state } = useLocation();
  const [email, setEmail] = useState(state?.email || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) return setError('Enter the email you signed up with.');
    setBusy(true); setError('');
    try {
      const r = await forgotPassword(email.trim());
      setDone(r.message);
    } catch (err) {
      setError(err.offline ? 'Can’t reach the Dixlab server. Please try again.' : err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      mode="reset"
      title="Forgot your password?"
      lead="Enter your email and we’ll send you a link to choose a new one."
      footer={<p className="auth__switch">Remembered it?&nbsp;&nbsp;<Link to="/login">Log in</Link></p>}
    >
      {done ? (
        <div className="auth__done" role="status">
          <b>Check your email.</b>
          <span>{done} The link works for an hour. If it doesn’t arrive, check your spam folder.</span>
        </div>
      ) : (
        <form className="auth__form" onSubmit={submit} noValidate>
          <Field label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="alex.morgan@email.com" autoComplete="email" autoFocus />
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="auth__submit"><SubmitButton busy={busy}>{busy ? 'Sending…' : 'Send reset link'}</SubmitButton></div>
        </form>
      )}
    </AuthLayout>
  );
}
