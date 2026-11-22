import { useEffect, useState } from 'react';
import { request } from '../../api.js';

const n = (v) => (v >= 10000 ? `${(v / 1000).toFixed(v >= 100000 ? 0 : 1)}k` : (v || 0).toLocaleString());

/** Published portfolio: live GitHub and Stack Overflow numbers, refreshed every few hours by the server. */
export default function LiveStats({ slug, enabled }) {
  const [stats, setStats] = useState(null);
  useEffect(() => {
    if (!enabled) return;
    request(`/api/public/${encodeURIComponent(slug)}/stats`).then(setStats).catch(() => setStats(null));
  }, [slug, enabled]);
  const gh = stats?.github;
  const so = stats?.stackoverflow;
  if (!gh && !so) return null;
  return (
    <section className="pub-live" aria-label="Live stats">
      <div className="pub-live__in">
        {gh && (
          <div className="pub-live__card">
            <p className="pub-live__k"><GhIcon /> GitHub · <a href={gh.url} target="_blank" rel="noopener noreferrer">@{gh.login}</a></p>
            <div className="pub-live__nums">
              <span><b>{n(gh.repos)}</b> repositories</span>
              <span><b>{n(gh.stars)}</b> stars</span>
              <span><b>{n(gh.followers)}</b> followers</span>
            </div>
            {gh.languages.length > 0 && <p className="pub-live__tags">{gh.languages.map((l) => <i key={l}>{l}</i>)}</p>}
            {gh.top.length > 0 && (
              <ul className="pub-live__repos">
                {gh.top.map((r) => (
                  <li key={r.name}>
                    <a href={r.url} target="_blank" rel="noopener noreferrer">{r.name}</a>
                    {r.description && <span>{r.description}</span>}
                    <em>★ {n(r.stars)}{r.language ? ` · ${r.language}` : ''}</em>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {so && (
          <div className="pub-live__card">
            <p className="pub-live__k"><SoIcon /> Stack Overflow · <a href={so.url} target="_blank" rel="noopener noreferrer">{so.name}</a></p>
            <div className="pub-live__nums">
              <span><b>{n(so.reputation)}</b> reputation</span>
              <span><b className="is-gold">{so.gold}</b> gold</span>
              <span><b className="is-silver">{so.silver}</b> silver</span>
              <span><b className="is-bronze">{so.bronze}</b> bronze</span>
            </div>
            {so.tags.length > 0 && <p className="pub-live__tags">{so.tags.map((t) => <i key={t}>{t}</i>)}</p>}
          </div>
        )}
      </div>
      <p className="pub-live__note">Live from public profiles</p>
    </section>
  );
}

/** Editor: which profiles feed the strip. */
export function LiveStatsField({ value = {}, onChange }) {
  const v = value || {};
  const set = (k, x) => onChange({ ...v, [k]: x });
  const badSo = v.stackoverflow && !/^https?:\/\/(www\.)?stackoverflow\.com\/users\/\d+/i.test(v.stackoverflow.trim());
  return (
    <fieldset className="ed__set">
      <legend>Live stats <em className="field__opt">optional</em></legend>
      <small className="field__hint">Show your GitHub and Stack Overflow numbers on your portfolio. They update by themselves.</small>
      <div className="ed__pair">
        <label className="field">
          <span className="field__label">GitHub username</span>
          <input className="field__input" value={v.github || ''} maxLength={60} onChange={(e) => set('github', e.target.value.trim())} placeholder="octocat" />
        </label>
        <label className="field">
          <span className="field__label">Stack Overflow profile</span>
          <input className="field__input" type="url" value={v.stackoverflow || ''} onChange={(e) => set('stackoverflow', e.target.value.trim())} placeholder="https://stackoverflow.com/users/123/you" />
          {badSo && <small className="field__hint is-error">Use your profile link: stackoverflow.com/users/…</small>}
        </label>
      </div>
    </fieldset>
  );
}

const GhIcon = () => <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" /></svg>;
const SoIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden fill="currentColor"><path d="M15.7 21.2v-5.4h1.8V23H1.4v-7.2h1.8v5.4h12.5zM4.8 15.4l8.8 1.8.4-1.8-8.8-1.8-.4 1.8zm1.2-4.3 8.1 3.8.8-1.7-8.1-3.8-.8 1.7zm2.3-4 6.9 5.7 1.1-1.4-6.9-5.7-1.1 1.4zM12.7 3 11.2 4.1l5.4 7.2 1.4-1.1L12.7 3zM4.6 19.4h9v-1.8h-9v1.8z" /></svg>;
