import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Logo, FORMATS } from '../components/ui.jsx';
import { openInvite, sendFeedback } from '../api.js';
import { SitePreview, SITE_TEMPLATES } from '../components/sites/index.jsx';
import { projectToSite } from '../components/sites/shared.jsx';
import { ScaledDoc, CV_TEMPLATES } from '../components/cv/index.jsx';
import { projectToCv } from '../components/cv/data.js';
import { CasePreview, CASE_TEMPLATES } from '../components/case/index.jsx';
import { projectToCase } from '../components/case/data.js';

const SECTIONS = {
  portfolio: ['Overall', 'Intro and about', 'Projects', 'Experience', 'Design and layout'],
  cv: ['Overall', 'Summary', 'Experience', 'Skills', 'Education', 'Layout'],
  case: ['Overall', 'Title and summary', 'Problem', 'Process', 'Results', 'Visuals'],
};

/**
 * /review/:token: someone asked for your feedback on a draft. You see the draft
 * as it is right now and leave comments only they can read. No account needed.
 */
export default function Review() {
  const { token } = useParams();
  const [info, setInfo] = useState(null);
  const [form, setForm] = useState({ name: '', section: 'Overall', body: '', website: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(0);

  useEffect(() => {
    openInvite(token).then((r) => setInfo(r.kind === 'feedback' ? r : { missing: true })).catch(() => setInfo({ missing: true }));
  }, [token]);
  useEffect(() => {
    const prev = document.title;
    document.title = info?.owner ? `Feedback for ${info.owner} · Dixlab` : 'Feedback · Dixlab';
    return () => { document.title = prev; };
  }, [info]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    if (form.body.trim().length < 2) { setError('Write a comment first.'); return; }
    setBusy(true); setError('');
    try {
      await sendFeedback(token, form);
      setSent((n) => n + 1);
      setForm({ ...form, body: '' });
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  if (!info) return <div className="pub pub--msg"><span className="cz__spin" aria-label="Loading" /></div>;
  if (info.missing) {
    return (
      <div className="pub pub--msg">
        <Logo to="/" />
        <h1>This link isn’t active.</h1>
        <p>It may have been turned off. Ask the person who sent it for a new one.</p>
      </div>
    );
  }
  const p = info.project;
  const first = info.owner.split(' ')[0];
  const kind = (FORMATS[p.type]?.label || 'draft').toLowerCase();
  return (
    <div className="rvw">
      <header className="rvw__bar">
        <Logo to="/" />
        <p><b>{info.owner}</b> asked for your feedback on this {kind}. It’s a draft: only people with this link can see it.</p>
      </header>
      <div className="rvw__body">
        <main className="rvw__doc" aria-label="Draft"><Draft p={p} /></main>
        <aside className="rvw__side">
          <h2>Your feedback</h2>
          <p className="rvw__lead">Only {first} sees your comments. Be specific: what works, what’s unclear, what you’d change.</p>
          <form onSubmit={submit} noValidate className="rvw__form">
            <label className="field">
              <span className="field__label">About</span>
              <select className="field__input" value={form.section} onChange={set('section')}>
                {(SECTIONS[p.type] || SECTIONS.portfolio).map((s) => <option key={s}>{s}</option>)}
              </select>
            </label>
            <label className="field">
              <span className="field__label">Comment</span>
              <textarea className="field__input" rows={6} value={form.body} onChange={set('body')} maxLength={3000}
                placeholder="The first project is the strongest. I’d move it to the top." />
            </label>
            <label className="field">
              <span className="field__label">Your name <em className="field__opt">optional</em></span>
              <input className="field__input" value={form.name} onChange={set('name')} maxLength={80} autoComplete="name" />
            </label>
            <input className="hp" tabIndex={-1} autoComplete="off" value={form.website} onChange={set('website')} aria-hidden="true" />
            {error && <p className="form-error" role="alert">{error}</p>}
            {sent > 0 && !error && <p className="rvw__ok" role="status">Sent{sent > 1 ? ` (${sent})` : ''}. Add another comment if you like.</p>}
            <button type="submit" className="app-btn app-btn--primary" disabled={busy}>{busy ? 'Sending…' : 'Send comment'}</button>
          </form>
        </aside>
      </div>
    </div>
  );
}

function Draft({ p }) {
  if (p.type === 'case' && CASE_TEMPLATES[p.template]) return <CasePreview template={p.template} data={{ ...projectToCase(p), ghost: false }} meta />;
  if (p.type === 'cv' && CV_TEMPLATES[p.template]) return <div className="pub__cv"><ScaledDoc template={p.template} data={{ ...projectToCv(p), ghost: false }} /></div>;
  if (p.type === 'portfolio' && SITE_TEMPLATES[p.template]) return <SitePreview template={p.template} data={projectToSite(p)} />;
  return (
    <article className="story story--outline pub__story">
      <h1 className="story__title">{p.title || 'Untitled'}</h1>
      {p.notes && <p className="story__lead">{p.notes}</p>}
      {[['problem', 'The challenge'], ['contribution', 'My contribution'], ['learned', 'What I learned']].map(([k, label]) => p[k] && (
        <div key={k} className="story__sec"><h3>{label}</h3><p>{p[k]}</p></div>
      ))}
    </article>
  );
}
