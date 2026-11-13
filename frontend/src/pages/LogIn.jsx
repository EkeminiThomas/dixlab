import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { logIn } from '../api.js';
import { AuthLayout, Field, SubmitButton } from './AuthAside.jsx';

export default function LogIn() {
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password) return setError('Enter your email and password.');
    setBusy(true);
    setError('');
    try {
      await logIn({ email: email.trim(), password });
      nav('/dashboard');
    } catch (err) {
      setError(err.offline ? 'Can’t reach the Dixlab server. Make sure the backend is running, then try again.' : err.message);
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      mode="login"
      title="Welcome back."
      lead="Pick up your story where you left off."
      footer={<p className="auth__switch">New to Dixlab?&nbsp;&nbsp;<Link to="/signup">Create account</Link></p>}
    >
      <form className="auth__form" onSubmit={submit} noValidate>
        <Field label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="alex.morgan@email.com" autoComplete="email" />
        <Field label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••••" autoComplete="current-password" />
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="auth__submit"><SubmitButton busy={busy}>{busy ? 'Logging in…' : 'Log in'}</SubmitButton></div>
      </form>
    </AuthLayout>
  );
}
