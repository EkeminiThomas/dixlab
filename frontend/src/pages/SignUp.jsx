import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { signUp } from '../api.js';
import { AuthLayout, Field, SubmitButton } from './AuthAside.jsx';

export default function SignUp() {
  const nav = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim()) return setError('Add your name and email to continue.');
    if (form.password.length < 8) return setError('Your password needs at least 8 characters.');
    setBusy(true);
    setError('');
    try {
      await signUp({ name: form.name.trim(), email: form.email.trim(), password: form.password });
      nav('/dashboard');
    } catch (err) {
      setError(err.offline ? 'Can’t reach the Dixlab server. Make sure the backend is running, then try again.' : err.message);
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      mode="signup"
      title="Start with what you have."
      lead="Create your account and turn your experience into a story worth sharing."
      footer={<p className="auth__switch">Already have an account?&nbsp;&nbsp;<Link to="/login">Log in</Link></p>}
    >
      <form className="auth__form" onSubmit={submit} noValidate>
        <Field label="Your name" value={form.name} onChange={set('name')} placeholder="Alex Morgan" autoComplete="name" />
        <Field label="Email" type="email" value={form.email} onChange={set('email')} placeholder="alex.morgan@email.com" autoComplete="email" />
        <Field label="Password" type="password" value={form.password} onChange={set('password')} placeholder="••••••••••" hint="At least 8 characters." autoComplete="new-password" />
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="auth__submit"><SubmitButton busy={busy}>{busy ? 'Creating account…' : 'Create account'}</SubmitButton></div>
      </form>
    </AuthLayout>
  );
}
