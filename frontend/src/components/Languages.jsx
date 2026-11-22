import { useEffect, useRef, useState } from 'react';
import { request, isSignedIn } from '../api.js';

export const LANGS = {
  en: 'English', fr: 'Français', es: 'Español', pt: 'Português', de: 'Deutsch', it: 'Italiano', nl: 'Nederlands',
  pl: 'Polski', tr: 'Türkçe', ar: 'العربية', sw: 'Kiswahili', yo: 'Yorùbá', ha: 'Hausa', ig: 'Igbo',
  zh: '中文', ja: '日本語', ko: '한국어', hi: 'हिन्दी',
};
const RTL = new Set(['ar']);

/** The project with one translation swapped in ({ "path.to.field": "text" }). */
export function applyTranslation(project, lang) {
  const overlay = project?.translations?.[lang];
  if (!overlay) return project;
  const out = structuredClone(project);
  for (const [path, text] of Object.entries(overlay)) {
    const parts = path.split('.');
    let node = out;
    for (const p of parts.slice(0, -1)) { node = node?.[Array.isArray(node) ? Number(p) : p]; if (node == null) break; }
    const last = parts[parts.length - 1];
    if (node != null && typeof node[Array.isArray(node) ? Number(last) : last] === 'string') node[Array.isArray(node) ? Number(last) : last] = text;
  }
  return out;
}

/** Which languages a page offers: its own first, then its translations. */
export const pageLangs = (project) => [project?.lang || 'en', ...Object.keys(project?.translations || {}).filter((l) => l !== (project?.lang || 'en'))];
export const isRtl = (lang) => RTL.has(lang);

/** Public page: a small language switcher (only when there's more than one language). */
export function LangSwitch({ langs, value, onChange }) {
  if (langs.length < 2) return null;
  return (
    <label className="lang-sw">
      <span className="lang-sw__icon" aria-hidden>文A</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} aria-label="Language">
        {langs.map((l) => <option key={l} value={l}>{LANGS[l] || l}</option>)}
      </select>
    </label>
  );
}

/** Editor bar → "Languages": the page's language, and AI translations into others. */
export function LanguagesDialog({ project, onApply, onClose }) {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [add, setAdd] = useState('');
  const closeRef = useRef(null);
  const base = project.lang || 'en';
  const have = Object.keys(project.translations || {});
  const stale = (l) => (project.translationsAt?.[l] || 0) < (project.updatedAt || 0) - 5000;

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const translate = async (lang) => {
    setBusy(lang); setError('');
    try {
      const { translations, translationsAt, ...source } = project; // eslint-disable-line no-unused-vars
      const r = await request('/api/assist/translate', { method: 'POST', body: { project: source, lang } });
      onApply({
        translations: { ...(project.translations || {}), [lang]: r.strings },
        translationsAt: { ...(project.translationsAt || {}), [lang]: Date.now() + 10000 },
      });
      setAdd('');
    } catch (e) {
      setError(e.body?.unavailable ? 'AI translation isn’t available on this account or server right now.' : e.message);
    } finally { setBusy(''); }
  };
  const remove = (lang) => {
    const { [lang]: _, ...rest } = project.translations || {}; // eslint-disable-line no-unused-vars
    onApply({ translations: rest });
  };

  return (
    <div className="confirm" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="confirm__box pub-dlg" role="dialog" aria-modal="true" aria-labelledby="lang-t">
        <button ref={closeRef} className="pub-dlg__x" onClick={onClose} aria-label="Close">×</button>
        <h2 id="lang-t" className="confirm__t">Languages</h2>
        <p className="confirm__d">Offer your page in more than one language. Visitors pick theirs from a switcher, and we show their browser’s language first when you have it.</p>
        <label className="field lang-dlg__row">
          <span className="field__label">This page is written in</span>
          <select className="field__input" value={base} onChange={(e) => onApply({ lang: e.target.value })}>
            {Object.entries(LANGS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        {have.length > 0 && (
          <ul className="rv-list">
            {have.map((l) => (
              <li key={l} className="rv-item">
                <div className="rv-item__head"><b>{LANGS[l] || l}</b><span>{Object.keys(project.translations[l]).length} passages</span>
                  {stale(l) && <em className="rv-badge">Edited since</em>}</div>
                <div className="rv-item__actions">
                  <button type="button" className="app-btn app-btn--ghost" onClick={() => translate(l)} disabled={!!busy}>{busy === l ? 'Translating…' : 'Translate again'}</button>
                  <button type="button" className="ed__remove" onClick={() => remove(l)}>Remove</button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {!isSignedIn() ? <p className="field__hint">Log in to translate with AI.</p> : (
          <div className="pw__form">
            <select className="field__input" value={add} onChange={(e) => setAdd(e.target.value)} aria-label="Add a language">
              <option value="">Add a language…</option>
              {Object.entries(LANGS).filter(([k]) => k !== base && !have.includes(k)).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <button type="button" className="app-btn app-btn--primary" disabled={!add || !!busy} onClick={() => translate(add)}>{busy && busy === add ? 'Translating…' : 'Translate with AI'}</button>
          </div>
        )}
        <p className="pw__d">Uses 10 credits per language. Names, links, dates and tools stay as they are. After big edits, choose “Translate again”, then update your live page.</p>
        {error && <p className="form-error" role="alert">{error}</p>}
      </div>
    </div>
  );
}
