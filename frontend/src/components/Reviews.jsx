import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  isSignedIn, getInvite, makeInvite, stopInvite, listTestimonials, setTestimonial, deleteTestimonial,
  listFeedback, resolveFeedback, deleteFeedback,
} from '../api.js';

const when = (ms) => new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

/** A project's share link of one kind: get it, copy it, turn it off. */
function InviteLink({ project, kind, intro }) {
  const [link, setLink] = useState(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { getInvite(project.id, kind).then(setLink).catch(() => setLink({ active: false })); }, [project.id, kind]);

  const make = async () => {
    setBusy(true); setError('');
    try { setLink(await makeInvite(project, kind)); } catch (e) {
      setError(e.body?.detail?.code === 'email_unverified' ? 'Confirm your email first, then try again.' : e.message);
    } finally { setBusy(false); }
  };
  const stop = async () => { setBusy(true); try { await stopInvite(project.id, kind); setLink({ active: false }); } finally { setBusy(false); } };
  const copy = async () => {
    try { await navigator.clipboard.writeText(link.url); } catch { /* the field is selectable */ }
    setCopied(true); setTimeout(() => setCopied(false), 1600);
  };

  if (!link) return <p className="field__hint">Loading…</p>;
  return (
    <div className="rv-link">
      <p className="field__hint">{intro}</p>
      {link.active ? (
        <>
          <div className="pub-dlg__link">
            <input className="field__input" value={link.url} readOnly onFocus={(e) => e.target.select()} aria-label="Link to share" />
            <button type="button" className="app-btn app-btn--primary" onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
          </div>
          <button type="button" className="ed__browse rv-link__off" onClick={stop} disabled={busy}>Turn this link off</button>
        </>
      ) : (
        <button type="button" className="app-btn app-btn--ghost" onClick={make} disabled={busy}>{busy ? 'Creating…' : 'Get a link to share'}</button>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  );
}

/** Editor (portfolio): ask for testimonials and approve the ones to show. */
export function TestimonialsPanel({ project }) {
  const [items, setItems] = useState(null);
  const signedIn = isSignedIn();
  useEffect(() => {
    if (signedIn) listTestimonials(project.id).then((r) => setItems(r.testimonials)).catch(() => setItems([]));
  }, [project.id, signedIn]);

  const change = async (t, status) => {
    const next = await setTestimonial(t.id, status);
    setItems((list) => list.map((x) => (x.id === t.id ? next : x)));
  };
  const remove = async (t) => { await deleteTestimonial(t.id); setItems((list) => list.filter((x) => x.id !== t.id)); };

  return (
    <fieldset className="ed__set">
      <legend>Testimonials <em className="field__opt">optional</em></legend>
      {!signedIn ? (
        <p className="field__hint"><Link to="/signup">Create a free account</Link> to collect testimonials from colleagues and clients.</p>
      ) : (
        <>
          <InviteLink project={project} kind="testimonial"
            intro="Send this link to a manager, colleague or client. They write a short recommendation; it shows on your published portfolio only after you approve it." />
          {items?.length > 0 && (
            <ul className="rv-list">
              {items.map((t) => (
                <li key={t.id} className={`rv-item is-${t.status}`}>
                  <div className="rv-item__head">
                    <b>{t.name}</b>
                    <span>{[t.role, t.company].filter(Boolean).join(', ')}</span>
                    <em className={`rv-badge is-${t.status}`}>{{ pending: 'Waiting for you', approved: 'Shown', hidden: 'Hidden' }[t.status]}</em>
                  </div>
                  <p className="rv-item__body">“{t.body}”</p>
                  {t.relation && <p className="rv-item__meta">{t.relation} · {when(t.createdAt)}</p>}
                  <div className="rv-item__actions">
                    {t.status !== 'approved' && <button type="button" className="app-btn app-btn--primary" onClick={() => change(t, 'approved')}>Approve and show</button>}
                    {t.status === 'approved' && <button type="button" className="app-btn app-btn--ghost" onClick={() => change(t, 'hidden')}>Hide</button>}
                    <button type="button" className="ed__remove" onClick={() => remove(t)}>Delete</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {items?.some((t) => t.status === 'approved') && <p className="field__hint">Approved testimonials appear on your live page straight away. No need to republish.</p>}
        </>
      )}
    </fieldset>
  );
}

/** Editor bar → "Feedback": share the draft for comments and read them. */
export function FeedbackDialog({ project, onClose }) {
  const [items, setItems] = useState(null);
  const closeRef = useRef(null);
  const signedIn = isSignedIn();
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    if (signedIn) listFeedback(project.id).then((r) => setItems(r.feedback)).catch(() => setItems([]));
    return () => window.removeEventListener('keydown', onKey);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = async (f) => {
    const next = await resolveFeedback(f.id, !f.resolved);
    setItems((list) => list.map((x) => (x.id === f.id ? next : x)));
  };
  const remove = async (f) => { await deleteFeedback(f.id); setItems((list) => list.filter((x) => x.id !== f.id)); };
  const open = items?.filter((f) => !f.resolved).length || 0;

  return (
    <div className="confirm" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="confirm__box pub-dlg" role="dialog" aria-modal="true" aria-labelledby="fb-t">
        <button ref={closeRef} className="pub-dlg__x" onClick={onClose} aria-label="Close">×</button>
        <h2 id="fb-t" className="confirm__t">Get feedback on your draft</h2>
        {!signedIn ? (
          <p className="confirm__d"><Link to="/signup">Create a free account</Link> to share drafts for feedback.</p>
        ) : (
          <>
            <InviteLink project={project} kind="feedback"
              intro="Anyone with this link sees your latest saved draft (no need to publish) and can leave comments only you can read." />
            <div className="rv-fb">
              <p className="ana__t">Comments {open > 0 && <span className="ana__tag">{open} open</span>}</p>
              {!items ? <p className="field__hint">Loading…</p> : items.length === 0 ? (
                <p className="field__hint">No comments yet. Share the link with a friend, mentor or someone in your field.</p>
              ) : (
                <ul className="rv-list">
                  {items.map((f) => (
                    <li key={f.id} className={`rv-item ${f.resolved ? 'is-done' : ''}`}>
                      <div className="rv-item__head"><b>{f.name}</b>{f.section && <span>on {f.section}</span>}<span>{when(f.createdAt)}</span></div>
                      <p className="rv-item__body">{f.body}</p>
                      <div className="rv-item__actions">
                        <button type="button" className="app-btn app-btn--ghost" onClick={() => toggle(f)}>{f.resolved ? 'Reopen' : 'Mark as done'}</button>
                        <button type="button" className="ed__remove" onClick={() => remove(f)}>Delete</button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
