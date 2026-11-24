import { useEffect, useState } from 'react';
import { figmaConnect, figmaDisconnect, figmaFiles, figmaStatus, isSignedIn } from '../api.js';

/*
 * Figma, made easy:
 * - <FigmaAccess>: "Connect Figma" once (Figma's own sign-in page, nothing to copy), or a
 *   personal access token as a fallback (and until Dixlab's Figma app is approved).
 * - <FigmaFilePicker>: paste links to Figma files, see them as cards with thumbnails, and
 *   tick the ones to use. The links are remembered. (A project or team link also works with
 *   a personal token that can read projects. Profile links are skipped: Figma doesn't share a
 *   profile's files with apps.)
 * After Figma's sign-in, people come back with ?figma=connected|cancelled|error in the address.
 */

/** Read (and clear) the ?figma=… a Figma sign-in came back with. */
export function useFigmaReturn() {
  const [back] = useState(() => {
    if (typeof window === 'undefined') return null;
    const q = new URLSearchParams(window.location.search);
    const v = q.get('figma');
    if (!v) return null;
    const message = q.get('message') || '';
    q.delete('figma'); q.delete('message');
    const rest = q.toString();
    window.history.replaceState(null, '', window.location.pathname + (rest ? `?${rest}` : '') + window.location.hash);
    return { result: v, message };
  });
  return back;
}

const BACK_TEXT = {
  connected: 'Figma is connected. Your files can be read without a token from now on.',
  cancelled: 'Figma wasn’t connected.',
  error: 'Figma couldn’t be connected.',
};

export function FigmaAccess({ token, onToken, back }) {
  const [st, setSt] = useState(null);
  const [busy, setBusy] = useState(false);
  const [showToken, setShowToken] = useState(Boolean(token));
  const [error, setError] = useState('');
  useEffect(() => { if (isSignedIn()) figmaStatus().then(setSt).catch(() => setSt({ available: false, connected: false })); }, []);
  const connect = async () => {
    setBusy(true); setError('');
    try {
      const { url } = await figmaConnect(window.location.pathname + window.location.search);
      window.location.assign(url);
    } catch (e) { setError(e.message); setBusy(false); }
  };
  const disconnect = async () => {
    await figmaDisconnect().catch(() => {});
    setSt({ ...st, connected: false, handle: '' });
  };
  if (!st) return null;
  return (
    <div className="fga">
      {back && <p className={`aia__note ${back.result === 'connected' ? 'is-ok' : ''}`}>{BACK_TEXT[back.result] || ''} {back.message}</p>}
      {st.connected ? (
        <p className="fga__on"><span className="fga__dot" aria-hidden /> Connected to Figma{st.handle ? ` as ${st.handle}` : ''}
          <button type="button" className="aia__add" onClick={disconnect}>Disconnect</button></p>
      ) : st.available && (
        <button type="button" className="app-btn app-btn--primary fga__connect" onClick={connect} disabled={busy}>
          {busy ? 'Opening Figma…' : 'Connect Figma'}
        </button>
      )}
      {!st.connected && (!showToken ? (
        <button type="button" className="aia__add" onClick={() => setShowToken(true)}>
          {st.available ? 'Or use a Figma access token instead' : 'Add your Figma access token'}
        </button>
      ) : (
        <label className="field">
          <span className="field__label">Figma access token</span>
          <input className="field__input" type="password" value={token} onChange={(e) => onToken(e.target.value)} autoComplete="off" spellCheck={false} placeholder="figd_…" />
          <small className="field__hint">In Figma: Settings → Security → Personal access tokens, with “File content: read only” (and “Projects: read only” to list a team’s files). Used for this read only, never saved.</small>
        </label>
      ))}
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  );
}

const SAVED = 'dixlab.figmaLinks';
const splitLinks = (text) => String(text || '').split(/[\s,]+/).map((s) => s.trim())
  .filter((s) => /figma\.com\//i.test(s) && !/figma\.com\/@/i.test(s));  // profile links bring nothing for now

/** Paste Figma file links → pick files. onChange(links) gets the ticked files' links. */
export function FigmaFilePicker({ token, onChange }) {
  const [text, setText] = useState(() => { try { return localStorage.getItem(SAVED) || ''; } catch { return ''; } });
  const [found, setFound] = useState(null);
  const [picked, setPicked] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const links = splitLinks(text);
  useEffect(() => {
    if (!found) { onChange(links); return; }  // not looked up yet: use what's pasted
    onChange(found.files.filter((f) => picked[f.link]).map((f) => f.link));
  }, [found, picked, text]); // eslint-disable-line react-hooks/exhaustive-deps
  const find = async () => {
    setBusy(true); setError('');
    try { localStorage.setItem(SAVED, text); } catch { /* private mode */ }
    try {
      const r = await figmaFiles({ urls: links, ...(token?.trim() ? { figmaToken: token.trim() } : {}) });
      setFound(r);
      setPicked(Object.fromEntries(r.files.slice(0, 6).map((f) => [f.link, true])));
    } catch (e) { setError(e.body?.error || e.message); }
    setBusy(false);
  };
  const count = found ? found.files.filter((f) => picked[f.link]).length : 0;
  return (
    <div className="fgp">
      <label className="field">
        <span className="field__label">Links to your Figma files</span>
        <textarea className="field__input fgp__text" value={text} onChange={(e) => { setText(e.target.value); setFound(null); }} spellCheck={false}
          placeholder={'Paste one or more, each on its own line.\nIn Figma, open a file and click Share → Copy link.'} />
      </label>
      <div className="aia__row">
        <button type="button" className="app-btn app-btn--ghost" onClick={find} disabled={!links.length || busy}>
          {busy ? <><span className="cz__spin" aria-hidden /> Looking…</> : found ? 'Look again' : 'Show my files'}
        </button>
        {found && <small className="aia__cost">{count} of {found.files.length} picked · showing files is free</small>}
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {found?.notes?.length > 0 && <ul className="aia__sources">{found.notes.map((n) => <li key={n.url} className="is-fail"><span aria-hidden>✕</span><div><b>{n.url.replace(/^https?:\/\/(www\.)?/, '')}</b><small>{n.message}</small></div></li>)}</ul>}
      {found?.files?.length > 0 && (
        <ul className="fgp__files">
          {found.files.map((f) => (
            <li key={f.link}>
              <label className={picked[f.link] ? 'is-on' : ''}>
                <input type="checkbox" checked={Boolean(picked[f.link])} onChange={(e) => setPicked({ ...picked, [f.link]: e.target.checked })} />
                <span className="fgp__thumb">{f.thumb ? <img src={f.thumb} alt="" /> : <i aria-hidden>F</i>}</span>
                <span className="fgp__name"><b>{f.name}</b>{f.edited && <small>Edited {f.edited}</small>}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
