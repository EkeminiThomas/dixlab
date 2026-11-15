import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { FORMATS } from './ui.jsx';
import { isSignedIn, getPublishStatus, publishProject, unpublishProject, publishUrl, resendVerification } from '../api.js';

/**
 * "Publish": turn the project into a link you can send to a recruiter or
 * client. Shows the link, sharing shortcuts, views, and whether the live page
 * is behind your latest edits.
 */
export default function PublishDialog({ project, onClose, onStatus }) {
  const [info, setInfo] = useState(null);       // { published, slug, views, publishedAt }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [unverified, setUnverified] = useState(false);
  const [resent, setResent] = useState('');
  const closeRef = useRef(null);
  const signedIn = isSignedIn();
  const kind = (FORMATS[project.type]?.label || 'page').toLowerCase();

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    if (signedIn) getPublishStatus(project.id).then(setInfo).catch(() => setInfo({ published: false }));
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const url = info?.slug ? publishUrl(info.slug) : '';
  const outdated = info?.published && (project.updatedAt || 0) > (info.publishedAt || 0);
  const name = project.title || project.name || `My ${kind}`;

  const publish = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await publishProject(project);
      setInfo(res);
      onStatus?.('Published');
    } catch (e) {
      if (e.body?.code === 'email_unverified') setUnverified(true);
      else setError(e.offline ? 'Can’t reach the Dixlab server. Check it’s running, then try again.' : e.message);
    } finally {
      setBusy(false);
    }
  };

  const unpublish = async () => {
    setBusy(true);
    try {
      await unpublishProject(project.id);
      setInfo({ published: false });
      onStatus?.('Draft');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    try { await navigator.clipboard.writeText(url); } catch { /* clipboard blocked; the field is selectable */ }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="confirm" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="confirm__box pub-dlg" role="dialog" aria-modal="true" aria-labelledby="pub-t">
        <button ref={closeRef} className="pub-dlg__x" onClick={onClose} aria-label="Close">×</button>
        <h2 id="pub-t" className="confirm__t">{info?.published ? 'Your link is live.' : 'Share a link, not a PDF.'}</h2>

        {!signedIn ? (
          <>
            <p className="confirm__d">Publishing gives your {kind} a page you can send to a recruiter or client. It needs a free account so your link keeps working.</p>
            <div className="confirm__actions">
              <Link to="/login" className="app-btn app-btn--ghost">Log in</Link>
              <Link to="/signup" className="app-btn app-btn--primary">Create account</Link>
            </div>
          </>
        ) : !info ? (
          <p className="confirm__d">Checking…</p>
        ) : info.published ? (
          <>
            <div className="pub-dlg__link">
              <input className="field__input" value={url} readOnly onFocus={(e) => e.target.select()} aria-label="Public link" />
              <button className="app-btn app-btn--primary" onClick={copy}>{copied ? 'Copied' : 'Copy link'}</button>
            </div>
            <div className="pub-dlg__share">
              <a className="app-btn app-btn--ghost" href={url} target="_blank" rel="noreferrer">Open ↗</a>
              <a className="app-btn app-btn--ghost" href={`mailto:?subject=${encodeURIComponent(name)}&body=${encodeURIComponent(`Here’s my ${kind}: ${url}`)}`}>Email</a>
              <a className="app-btn app-btn--ghost" href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`} target="_blank" rel="noreferrer">LinkedIn</a>
              <span className="pub-dlg__views">{info.views === 1 ? 'Viewed once' : `Viewed ${info.views} times`}</span>
            </div>
            <DomainSoon />
            {outdated && (
              <div className="pub-dlg__update">
                <p>You’ve made changes since publishing. Visitors still see the earlier version.</p>
                <button className="app-btn app-btn--primary" onClick={publish} disabled={busy}>{busy ? 'Updating…' : 'Update live page'}</button>
              </div>
            )}
            <p className="pub-dlg__note">Anyone with the link can view this page, including any contact details on it. Later edits stay private until you update.</p>
            <button className="ed__browse pub-dlg__off" onClick={unpublish} disabled={busy}>Unpublish this {kind}</button>
          </>
        ) : (
          <>
            <p className="confirm__d">Publish “{name}” to get a page you can send to a recruiter or client. It looks exactly like your preview, works on phones, and you can see how often it’s viewed.</p>
            <p className="pub-dlg__note">Anyone with the link can view it, including any contact details on it. Your later edits stay private until you choose to update.</p>
            <div className="confirm__actions">
              <button className="app-btn app-btn--ghost" onClick={onClose}>Not yet</button>
              <button className="app-btn app-btn--primary" onClick={publish} disabled={busy}>{busy ? 'Publishing…' : 'Publish and get link'}</button>
            </div>
          </>
        )}
        {unverified && (
          <div className="pub-dlg__update" role="alert">
            <p><b>Confirm your email first.</b> We sent a link to your inbox when you signed up. Confirming it lets you publish and receive messages from visitors.</p>
            {resent ? <p>{resent}</p> : (
              <button className="app-btn app-btn--ghost" onClick={() => resendVerification().then(() => setResent('Sent! Check your inbox, then publish again.')).catch((e) => setResent(e.message))}>Send the link again</button>
            )}
          </div>
        )}
        {error && <p className="form-error" role="alert">{error}</p>}
      </div>
    </div>
  );
}

/**
 * Custom domains: a placeholder for now. Later, "Get a domain" will search and
 * buy one (via Pxxl) and "Add my domain" will connect one the user already owns.
 */
function DomainSoon() {
  const [asked, setAsked] = useState('');
  return (
    <div className="pub-dom">
      <div className="pub-dom__head">
        <p className="pub-dom__t">Your own domain <span className="pub-dom__soon">Coming soon</span></p>
        <p className="pub-dom__d">Put this page on an address like <b>yourname.com</b>, or a free <b>yourname.dixlab.app</b>.</p>
      </div>
      <div className="pub-dom__actions">
        <button type="button" className="app-btn app-btn--ghost" aria-describedby="pub-dom-note" onClick={() => setAsked('get')}>Get a domain</button>
        <button type="button" className="app-btn app-btn--ghost" aria-describedby="pub-dom-note" onClick={() => setAsked('add')}>Add my domain</button>
      </div>
      <p id="pub-dom-note" className="pub-dom__note" role="status">
        {asked === 'get' && 'Buying a domain isn’t available yet. Soon you’ll be able to search and buy one without leaving Dixlab.'}
        {asked === 'add' && 'Connecting a domain isn’t available yet. Soon you’ll be able to add one you already own and we’ll walk you through the DNS settings.'}
      </p>
    </div>
  );
}
