import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { FORMATS } from './ui.jsx';
import Analytics from './Analytics.jsx';
import BuyDomain from './BuyDomain.jsx';
import { isSignedIn, getPublishStatus, publishProject, unpublishProject, publishUrl, resendVerification, setPagePassword, setGalleryListing, getDomain, setDomain, checkDomain, removeDomain, setSubdomain, removeSubdomain, usePlan, hasFeature, openUpgrade } from '../api.js';

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
            <PagePassword projectId={project.id} on={info.protected} onChange={(v) => setInfo({ ...info, protected: v })} />
            <GalleryOptIn projectId={project.id} status={info.gallery} locked={info.protected} onChange={(g) => setInfo({ ...info, gallery: g })} />
            <Analytics projectId={project.id} />
            <DomainPanel projectId={project.id} />
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
 * Addresses for this page: a Dixlab address (yourname.dixlab.click, unlocked with
 * credits) and, free to connect, a domain they own (bought on pxxl.app or elsewhere).
 */
function DomainPanel({ projectId }) {
  const { plan } = usePlan();
  const hasSub = hasFeature('subdomain', plan);
  const [info, setInfo] = useState(null);
  const [value, setValue] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [checked, setChecked] = useState(null);
  const [mode, setMode] = useState('buy');
  const reload = () => getDomain(projectId).then(setInfo).catch(() => {});

  useEffect(() => { getDomain(projectId).then(setInfo).catch(() => setInfo({ domain: null })); }, [projectId]);

  const run = async (what, fn) => {
    setBusy(what); setError('');
    try { await fn(); } catch (e) { setError(e.message); } finally { setBusy(''); }
  };
  const add = (e) => { e.preventDefault(); run('add', async () => { const r = await setDomain(projectId, value); setInfo({ ...info, ...r }); setValue(''); setChecked(null); }); };
  const check = () => run('check', async () => { const r = await checkDomain(projectId); setInfo({ ...info, ...r }); setChecked(r); });
  const remove = () => run('remove', async () => { await removeDomain(projectId); setInfo({ ...info, domain: null }); setChecked(null); });
  const claim = (e) => { e.preventDefault(); run('sub', async () => { const sub = await setSubdomain(projectId, name); setInfo({ ...info, sub }); setName(''); }); };
  const dropSub = () => run('dropsub', async () => { await removeSubdomain(projectId); setInfo({ ...info, sub: null }); });
  const base = info?.subBase || 'dixlab.click';

  return (
    <div className="pub-dom">
      <div className="pub-dom__head">
        <p className="pub-dom__t">Your Dixlab address {!hasSub && <span className="ana__tag">Unlock</span>}</p>
        <p className="pub-dom__d">A free web address for this page, like <b>yourname.{base}</b>. No domain to buy.</p>
      </div>
      {!info ? <p className="pw__d">Loading…</p> : !hasSub ? (
        <button type="button" className="app-btn app-btn--ghost" onClick={() => openUpgrade({ code: 'unlock_needed', feature: 'subdomain' })}>Unlock with credits</button>
      ) : info.sub ? (
        <div className="dom">
          <p className="dom__status"><a href={info.sub.url} target="_blank" rel="noreferrer"><b>{info.sub.domain}</b> ↗</a><span className="rv-badge is-approved">Live</span></p>
          <div className="pw__btns">
            <button type="button" className="ed__browse" onClick={() => setInfo({ ...info, sub: null, renaming: info.sub })}>Change</button>
            <button type="button" className="ed__browse" onClick={dropSub} disabled={!!busy}>Remove</button>
          </div>
        </div>
      ) : (
        <form className="pw__form dom__sub" onSubmit={claim}>
          <span className="dom__sub-field">
            <input className="field__input" value={name} onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
              placeholder={info.renaming ? info.renaming.domain.split('.')[0] : 'yourname'} aria-label="Your Dixlab address" maxLength={30} autoComplete="off" />
            <i>.{base}</i>
          </span>
          <button type="submit" className="app-btn app-btn--primary" disabled={name.length < 3 || !!busy}>{busy === 'sub' ? 'Saving…' : 'Claim'}</button>
        </form>
      )}

      <div className="pub-dom__head dom__own">
        <p className="pub-dom__t">Your own domain</p>
        <p className="pub-dom__d">{info?.sales === 'off'
          ? <>Have a domain like <b>yourname.com</b> (from <a href="https://pxxl.app" target="_blank" rel="noreferrer">pxxl.app</a> or anywhere)? Connect it for free.</>
          : <>An address like <b>yourname.com</b>. Buy one here (through <a href="https://pxxl.app" target="_blank" rel="noreferrer">pxxl.app</a>), or connect one you already have for free.</>}</p>
      </div>
      {info && !info.domain && info.sales !== 'off' && (
        <div className="ana__ranges dom__modes" role="group" aria-label="Own domain">
          <button type="button" className={`ana__range ${mode === 'buy' ? 'is-active' : ''}`} aria-pressed={mode === 'buy'} onClick={() => setMode('buy')}>Buy a domain</button>
          <button type="button" className={`ana__range ${mode === 'connect' ? 'is-active' : ''}`} aria-pressed={mode === 'connect'} onClick={() => setMode('connect')}>I already have one</button>
        </div>
      )}
      {!info ? null : !info.domain && mode === 'buy' && info.sales !== 'off' ? <BuyDomain projectId={projectId} demo={info.sales === 'demo'} onLive={reload} /> : !info.domain ? (
        <form className="pw__form" onSubmit={add}>
          <input className="field__input" value={value} onChange={(e) => setValue(e.target.value)} placeholder="yourname.com" aria-label="Your domain" autoComplete="off" />
          <button type="submit" className="app-btn app-btn--primary" disabled={!value.trim() || !!busy}>{busy === 'add' ? 'Adding…' : 'Connect'}</button>
        </form>
      ) : (
        <div className="dom">
          <p className="dom__status">
            <b>{info.domain}</b>
            {info.verified ? <span className="rv-badge is-approved">Connected</span> : <span className="rv-badge">Waiting for DNS</span>}
          </p>
          {!info.verified && (
            <>
              <p className="pw__d">In your domain’s DNS settings (where you bought it), add:</p>
              <table className="dom__table">
                <thead><tr><th>Type</th><th>Name</th><th>Value</th></tr></thead>
                <tbody>{info.records.map((r) => (
                  <tr key={r.type}><td>{r.type}</td><td><code>{r.name}</code></td><td><code>{r.value}</code></td></tr>
                ))}</tbody>
              </table>
              <p className="pw__d">DNS changes can take a few minutes, sometimes a few hours.</p>
            </>
          )}
          {checked && !info.verified && (
            <p className="pw__d" role="status">{checked.owned ? 'Ownership confirmed.' : 'We can’t see the TXT record yet.'} {checked.pointed ? 'The domain points to Dixlab.' : 'The domain doesn’t point to Dixlab yet.'}</p>
          )}
          {info.verified && <p className="pw__d">Live at <a href={info.url} target="_blank" rel="noreferrer">{info.url} ↗</a>. HTTPS is set up automatically and can take a few minutes the first time.</p>}
          {!info.connected && <p className="pw__d">Almost there: the Dixlab team is attaching your domain to our servers.</p>}
          <div className="pw__btns">
            {!info.verified && <button type="button" className="app-btn app-btn--primary" onClick={check} disabled={!!busy}>{busy === 'check' ? 'Checking…' : 'Check DNS'}</button>}
            <button type="button" className="ed__browse" onClick={remove} disabled={!!busy}>Remove domain</button>
          </div>
        </div>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  );
}

/** Pro and Premium: only people with the password can open the page (handy for NDA work). */
function PagePassword({ projectId, on, onChange }) {
  const { plan } = usePlan();
  const allowed = hasFeature('password', plan);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = async (password) => {
    setBusy(true); setError('');
    try {
      const r = await setPagePassword(projectId, password);
      onChange(r.protected); setEditing(false); setValue('');
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const start = () => {
    if (!allowed) { openUpgrade({ code: 'unlock_needed', feature: 'password' }); return; }
    setEditing(true);
  };

  return (
    <div className="pw">
      <div className="pw__row">
        <p className="pw__t">{on ? '🔒 Password protected' : 'Password protection'} {!allowed && <span className="ana__tag">Unlock</span>}</p>
        {!editing && (on ? (
          <span className="pw__btns">
            <button type="button" className="ed__browse" onClick={start}>Change</button>
            <button type="button" className="ed__browse" onClick={() => save(null)} disabled={busy}>Remove</button>
          </span>
        ) : <button type="button" className="ed__browse" onClick={start}>Add a password</button>)}
      </div>
      {editing && (
        <form className="pw__form" onSubmit={(e) => { e.preventDefault(); save(value); }}>
          <input className="field__input" type="text" value={value} onChange={(e) => setValue(e.target.value)} minLength={4} maxLength={128}
            placeholder="At least 4 characters" aria-label="Page password" autoFocus autoComplete="off" />
          <button type="submit" className="app-btn app-btn--primary" disabled={busy || value.trim().length < 4}>Save</button>
          <button type="button" className="app-btn app-btn--ghost" onClick={() => setEditing(false)}>Cancel</button>
        </form>
      )}
      <p className="pw__d">{on
        ? 'Visitors need the password to see this page. Share it alongside the link. The link itself (which includes your title) is still visible.'
        : 'For NDA or client work: only people with the password can open the page. Link previews stay generic.'}</p>
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  );
}

/** Ask to appear in the public gallery at /gallery (the Dixlab team picks what's featured). */
function GalleryOptIn({ projectId, status, locked, onChange }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const on = status === 'requested' || status === 'featured';
  const toggle = async () => {
    setBusy(true); setError('');
    try { onChange((await setGalleryListing(projectId, !on)).gallery); } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const note = locked ? 'Password-protected pages can’t be in the gallery.'
    : status === 'featured' ? 'Featured in the Dixlab gallery. 🎉'
    : status === 'requested' ? 'Requested. The Dixlab team reviews pages before they’re featured.'
    : status === 'declined' ? 'Not featured this time. Polish it and ask again.'
    : 'Ask to be featured in the public gallery, where people browse great work for inspiration and hiring.';
  return (
    <div className="pw">
      <div className="pw__row">
        <p className="pw__t">Dixlab gallery</p>
        {!locked && <label className="pw__switch"><input type="checkbox" checked={on} onChange={toggle} disabled={busy} /> <span>{on ? 'On' : 'Off'}</span></label>}
      </div>
      <p className="pw__d">{note} <a href="/gallery" target="_blank" rel="noreferrer">See the gallery ↗</a></p>
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  );
}
