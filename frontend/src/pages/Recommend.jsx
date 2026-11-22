import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { openInvite, sendTestimonial } from '../api.js';
import { AuthLayout, Field, SubmitButton } from './AuthAside.jsx';

/**
 * /recommend/:token: someone asked you for a testimonial. No account needed.
 * What you write stays private until they approve it.
 */
export default function Recommend() {
  const { token } = useParams();
  const [info, setInfo] = useState(null);
  const [form, setForm] = useState({ name: '', role: '', company: '', relation: '', body: '', website: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    openInvite(token).then((r) => setInfo(r.kind === 'testimonial' ? r : { missing: true })).catch(() => setInfo({ missing: true }));
  }, [token]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const first = (info?.owner || '').split(' ')[0] || 'them';
  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || form.body.trim().length < 20) { setError('Add your name and at least a couple of sentences.'); return; }
    setBusy(true); setError('');
    try { await sendTestimonial(token, form); setDone(true); } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  if (!info) return <AuthLayout title="Loading…" lead="" />;
  if (info.missing) {
    return <AuthLayout title="This link isn’t active." lead="It may have been turned off. Ask the person who sent it for a new one." />;
  }
  return (
    <AuthLayout title={`Recommend ${info.owner}`} lead={`${first} asked you for a short testimonial for their portfolio. It only appears after ${first} approves it.`}>
      {done ? (
        <div className="auth__done" role="status">
          <b>Thank you!</b>
          <span>{first} will see your testimonial and can add it to their portfolio.</span>
        </div>
      ) : (
        <form className="auth__form" onSubmit={submit} noValidate>
          <Field label="Your name" value={form.name} onChange={set('name')} maxLength={80} autoComplete="name" autoFocus />
          <div className="ed__pair">
            <Field label="Your role" value={form.role} onChange={set('role')} maxLength={80} placeholder="Head of Product" />
            <Field label="Company" value={form.company} onChange={set('company')} maxLength={80} placeholder="Acme" />
          </div>
          <Field label={`How you know ${first}`} value={form.relation} onChange={set('relation')} maxLength={120} placeholder={`Managed ${first} for two years`} />
          <label className="field">
            <span className="field__label">Your testimonial</span>
            <textarea className="field__input" rows={6} value={form.body} onChange={set('body')} maxLength={1200}
              placeholder={`What was it like to work with ${first}? A specific moment or result helps most.`} />
            <small className="field__hint">{form.body.length}/1200</small>
          </label>
          <input className="hp" tabIndex={-1} autoComplete="off" value={form.website} onChange={set('website')} aria-hidden="true" />
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="auth__submit"><SubmitButton busy={busy}>{busy ? 'Sending…' : 'Send testimonial'}</SubmitButton></div>
        </form>
      )}
    </AuthLayout>
  );
}
