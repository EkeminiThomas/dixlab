import { useEffect, useState } from 'react';
import { assistCaseLinks, caseCheck, isSignedIn, usePlan } from '../api.js';
import { embedFor } from './case/extras.jsx';

/*
 * The case study's AI panel.
 * - "Build from project links": a GitHub/GitLab repository, a Figma file, a live
 *   site or a video walkthrough (plus a few lines about their part) becomes a
 *   whole draft case study. Figma and videos are added as live embeds.
 * - "Review my case study": scored against what hiring managers look for. Free,
 *   instant (no AI) and updated as they edit.
 * Nothing changes until they press Add or Replace, and both can be undone.
 */

const TEXT = ['title', 'tagline', 'role', 'client', 'timeline', 'team', 'notes', 'problem', 'goals', 'research',
  'contribution', 'tradeoffs', 'solution', 'learned', 'next', 'skills', 'link'];
const filled = (v) => (Array.isArray(v) ? v.some((x) => Object.values(x || {}).some((y) => String(y || '').trim())) : String(v ?? '').trim() !== '');

/** Fill what's empty (and add new embeds), or replace the sections the draft covers. */
function mergeCase(cur, draft, replace) {
  const patch = {};
  for (const k of TEXT) {
    if (filled(draft[k]) && (replace || !filled(cur[k]))) patch[k] = draft[k];
  }
  for (const k of ['process', 'metrics']) {
    if (filled(draft[k]) && (replace || !filled(cur[k]))) patch[k] = draft[k];
  }
  const have = (cur.embeds || []).filter((e) => e.url);
  const fresh = (draft.embeds || []).filter((e) => !have.some((h) => h.url === e.url));
  if (fresh.length) patch.embeds = [...have, ...fresh].slice(0, 4);
  return patch;
}

const KIND = (u) => {
  const e = embedFor(u);
  if (e) return e.kind;
  if (/github\.com\/[^/]+\/[^/]+/i.test(u)) return 'GitHub repo';
  if (/gitlab\.com\/[^/]+\/[^/]+/i.test(u)) return 'GitLab project';
  return u.trim() ? 'Website' : '';
};

export default function CaseAssist({ project, onApply }) {
  const { plan } = usePlan();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('links');
  const [links, setLinks] = useState(['', '']);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [undo, setUndo] = useState(null);
  const urls = links.map((l) => l.trim()).filter(Boolean).map((l) => (/^https?:\/\//i.test(l) ? l : `https://${l}`));

  const build = async () => {
    setBusy(true); setError(null); setResult(null); setUndo(null);
    try { setResult(await assistCaseLinks({ urls, notes: notes.trim() })); } catch (e) {
      setError(e.status === 402 ? { text: e.message } : { text: e.body?.error || e.message, sources: e.body?.sources });
    }
    setBusy(false);
  };
  const apply = (patch) => {
    setUndo(Object.fromEntries(Object.keys(patch).map((k) => [k, project[k] ?? (Array.isArray(patch[k]) ? [] : '')])));
    onApply(patch);
  };

  if (!open) {
    return (
      <button type="button" className="aia__open" onClick={() => setOpen(true)}>
        <span className="aia__spark" aria-hidden>✦</span>
        <span><b>Build it from your project links</b> Paste your GitHub repo, Figma file or live site and we’ll draft the case study. Or review what you have against what hiring managers look for.</span>
        <span aria-hidden>Open →</span>
      </button>
    );
  }

  return (
    <section className="aia" aria-label="Case study assistant">
      <div className="aia__head">
        <p className="aia__title"><span className="aia__spark" aria-hidden>✦</span>Case study assistant</p>
        {plan?.enforced && <span className="aia__units">{(plan.credits ?? 0).toLocaleString()} credits</span>}
        <button type="button" className="aia__x" onClick={() => setOpen(false)} aria-label="Close the case study assistant">✕</button>
      </div>
      <div className="aia__tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'links'} className={tab === 'links' ? 'is-on' : ''} onClick={() => setTab('links')}>Build from project links</button>
        <button role="tab" aria-selected={tab === 'review'} className={tab === 'review' ? 'is-on' : ''} onClick={() => setTab('review')}>Review my case study</button>
      </div>

      {tab === 'review' && <CaseReview project={project} />}

      {tab === 'links' && !isSignedIn() && <p className="aia__note">Log in to build a case study from your links.</p>}
      {tab === 'links' && isSignedIn() && (
        <div className="aia__body">
          <p className="aia__lead">Paste links to the project. We read the repository’s README, stack and releases, the live site, and your Figma file’s title. Figma files and videos are embedded so visitors can try them.</p>
          {links.map((l, i) => (
            <div className="caselink" key={i}>
              <input className="field__input" value={l} inputMode="url" spellCheck={false} aria-label={`Project link ${i + 1}`}
                onChange={(e) => setLinks(links.map((x, j) => (j === i ? e.target.value : x)))}
                placeholder={['github.com/you/project or gitlab.com/you/project', 'figma.com/design/… or your live site'][i] || 'youtube.com/watch?v=… or loom.com/share/…'} />
              {KIND(l) && <span className="caselink__kind">{KIND(l)}</span>}
            </div>
          ))}
          {links.length < 5 && <button type="button" className="aia__add" onClick={() => setLinks([...links, ''])}>+ Add another link</button>}
          <label className="field">
            <span className="field__label">Your part, in a few lines <em className="field__opt">recommended</em></span>
            <textarea className="field__input aia__text" value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="What was your role? What problem were you solving, what did you decide against, and what changed (numbers if you have them)? Links can’t tell us this part." />
          </label>
          <div className="aia__row">
            <button type="button" className="app-btn app-btn--primary" disabled={busy || (!urls.length && notes.trim().length < 40)} onClick={build}>
              {busy ? <><span className="cz__spin" aria-hidden /> Reading your project…</> : 'Build my case study'}
            </button>
            <small className="aia__cost">15 credits{busy ? ' · this can take up to a minute' : ''}</small>
          </div>
        </div>
      )}

      {error && (
        <div className="aia__error" role="alert">
          <p>{error.text}</p>
          {error.sources?.length > 0 && <ul className="aia__sources">{error.sources.map((s) => <li key={s.url} className="is-fail"><span aria-hidden>✕</span><div><b>{s.url}</b><small>{s.tip}</small></div></li>)}</ul>}
        </div>
      )}

      {tab === 'links' && result && (() => {
        const d = result.draft;
        return (
          <div className="aia__result">
            <p className="aia__k">Your draft case study</p>
            {result.sources?.length > 0 && (
              <ul className="aia__sources">
                {result.sources.map((s) => (
                  <li key={s.url} className={s.read ? 'is-ok' : 'is-fail'}><span aria-hidden>{s.read ? '✓' : '✕'}</span>
                    <div><b>{s.url.replace(/^https?:\/\/(www\.)?/, '')}</b>{s.read ? ' · read' : ' · couldn’t read'}{!s.read && s.tip && <small>{s.tip}</small>}</div></li>
                ))}
              </ul>
            )}
            <dl className="aia__diff">
              {d.title && <><dt>Title</dt><dd>{d.title}</dd></>}
              {d.tagline && <><dt>Tagline</dt><dd>{d.tagline}</dd></>}
              {d.problem && <><dt>Problem</dt><dd>{d.problem}</dd></>}
              {d.process?.length > 0 && <><dt>Process</dt><dd><ol>{d.process.map((s) => <li key={s.title}><b>{s.title}</b>{s.desc ? `: ${s.desc}` : ''}</li>)}</ol></dd></>}
              {d.solution && <><dt>Solution</dt><dd>{d.solution}</dd></>}
              {d.metrics?.length > 0 && <><dt>Results</dt><dd>{d.metrics.map((m) => `${m.value} ${m.label}`).join(' · ')}</dd></>}
              {d.embeds?.length > 0 && <><dt>Embedded</dt><dd>{d.embeds.map((e) => KIND(e.url)).join(', ')}</dd></>}
              {d.link && <><dt>Live link</dt><dd>{d.link}</dd></>}
            </dl>
            {!d.role && !d.contribution && <p className="aia__note">Your role isn’t in the links. Add it in the overview: hiring managers look for it first.</p>}
            <div className="aia__row">
              {undo ? <><span className="aia__done">Added to your case study.</span><button type="button" className="app-btn app-btn--ghost" onClick={() => { onApply(undo); setUndo(null); }}>Undo</button></>
                : <><button type="button" className="app-btn app-btn--primary" onClick={() => apply(mergeCase(project, d, false))}>Add to my case study</button>
                  <button type="button" className="app-btn app-btn--ghost" onClick={() => apply(mergeCase(project, d, true))}>Replace what’s there</button>
                  <button type="button" className="app-btn app-btn--ghost" onClick={() => setResult(null)}>Discard</button></>}
            </div>
            <small className="aia__note">“Add” fills empty sections and adds embeds; it never overwrites what you wrote.</small>
          </div>
        );
      })()}
    </section>
  );
}

const LEVEL = { fix: ['Fix', 'is-fix'], improve: ['Improve', 'is-improve'], ok: ['Good', 'is-ok'] };

function CaseReview({ project }) {
  const [res, setRes] = useState(null);
  const [error, setError] = useState('');
  const [showOk, setShowOk] = useState(false);
  const key = JSON.stringify([project.title, project.problem, project.role, project.contribution, project.process, project.tradeoffs,
    project.solution, project.metrics, project.learned, project.cover, project.gallery, project.compare, project.embeds, project.link, project.notes]);
  useEffect(() => {
    const t = setTimeout(() => { caseCheck(project).then((r) => { setRes(r); setError(''); }).catch((e) => setError(e.message)); }, 500);
    return () => clearTimeout(t);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  if (error) return <p className="aia__note">{error}</p>;
  if (!res) return <p className="aia__note"><span className="cz__spin" aria-hidden /> Checking…</p>;
  const todo = res.checks.filter((c) => c.level !== 'ok');
  const good = res.checks.filter((c) => c.level === 'ok');
  return (
    <div className="aia__body cvchk">
      <div className="cvchk__head">
        <div className={`cvchk__score ${res.score >= 85 ? 'is-good' : res.score >= 65 ? 'is-mid' : 'is-low'}`} aria-label={`Score ${res.score} out of 100`}>
          <b>{res.score}</b><span>/100</span>
        </div>
        <div>
          <p className="cvchk__grade">{res.grade} · {res.readMinutes} min read</p>
          <p className="aia__lead">Checked against what hiring managers and clients look for: a clear problem, your part, your process, what you cut, results in numbers, lessons, and the work itself. Free, and it updates as you edit.</p>
        </div>
      </div>
      {todo.length > 0 && (
        <ul className="cvchk__list">
          {todo.map((c) => <li key={c.id} className={LEVEL[c.level][1]}><span className="cvchk__tag">{LEVEL[c.level][0]}</span><div><b>{c.title}</b>{c.detail && <small>{c.detail}</small>}</div></li>)}
        </ul>
      )}
      {good.length > 0 && <button type="button" className="aia__add" onClick={() => setShowOk(!showOk)}>{showOk ? 'Hide' : 'Show'} what’s already good ({good.length})</button>}
      {showOk && <ul className="cvchk__list">{good.map((c) => <li key={c.id} className="is-ok"><span className="cvchk__tag">Good</span><div><b>{c.title}</b></div></li>)}</ul>}
    </div>
  );
}
