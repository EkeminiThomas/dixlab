import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { FORMATS } from './ui.jsx';
import { isSignedIn, getPublishStatus, publishProject, unpublishProject, publishUrl } from '../api.js';

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
      setError(e.offline ? 'Can’t reach the Dixlab server. Check it’s running, then try again.' : e.message);
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
        {error && <p className="form-error" role="alert">{error}</p>}
      </div>
    </div>
  );
}
