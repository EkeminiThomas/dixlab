import { useEffect, useState } from 'react';
import { assistCaseLinks, caseCheck, caseProjects, isSignedIn, usePlan } from '../api.js';
import { embedFor, FIGMA_LINK } from './case/extras.jsx';
import { MAX_GALLERY } from './case/data.js';
import { FONT_PAIRS } from './sites/brand.js';

/*
 * The case study's AI panel.
 * - "Build from project links": a GitHub/GitLab repository, a Figma file, a live
 *   site or a video walkthrough (plus a few lines about their part) becomes a
 *   whole draft case study. Figma and videos are added as live embeds. A Figma
 *   file (when the server has a Figma token, or they add their own) also brings
 *   its screens as images, its fonts and colours, and its page structure.
 * - "From my profile": a GitHub, GitLab or Hugging Face profile (or a Figma team or
 *   project) lists their strongest projects; one click builds the whole case study,
 *   pictures included, with nothing to type. An empty case study is filled at once.
 * - "Review my case study": scored against what hiring managers look for. Free,
 *   instant (no AI) and updated as they edit.
 * Nothing changes until they press Add or Replace, and both can be undone.
 */

const TEXT = ['title', 'tagline', 'role', 'client', 'timeline', 'team', 'notes', 'problem', 'goals', 'audience', 'constraints', 'research',
  'contribution', 'tradeoffs', 'solution', 'learned', 'next', 'skills', 'link'];
const filled = (v) => (Array.isArray(v) ? v.some((x) => Object.values(x || {}).some((y) => String(y || '').trim())) : String(v ?? '').trim() !== '');

/** Fill what's empty (and add new embeds), or replace the sections the draft covers. */
function mergeCase(cur, draft, replace, useBrand = true) {
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
  // Screens from Figma: the cover, and the gallery (added after theirs, up to the limit).
  if (draft.cover?.src && (replace || !cur.cover?.src)) patch.cover = draft.cover;
  if (draft.gallery?.length) {
    const mine = replace ? [] : (cur.gallery || []).filter((g) => g.src);
    patch.gallery = [...mine, ...draft.gallery.filter((g) => !mine.some((m) => m.src === g.src))].slice(0, MAX_GALLERY);
  }
  if (draft.design) patch.design = draft.design;
  if (useBrand && draft.brand && Object.keys(draft.brand).length) {
    const b = cur.brand || {};
    const set = Object.fromEntries(Object.entries(draft.brand).filter(([k]) => replace || !b[k] || b[k] === 'default'));
    if (Object.keys(set).length) patch.brand = { ...b, ...set };
  }
  return patch;
}

const KIND = (u) => {
  const e = embedFor(u);
  if (e) return e.kind;
  if (FIGMA_LINK.test(u)) return 'Figma';
  if (/github\.com\/[^/]+\/[^/]+/i.test(u)) return 'GitHub repo';
  if (/gitlab\.com\/[^/]+\/[^/]+/i.test(u)) return 'GitLab project';
  return u.trim() ? 'Website' : '';
};

/** Nothing written yet: a build can fill it straight away. */
const isEmptyCase = (p) => !['title', 'problem', 'solution', 'notes', 'contribution'].some((k) => String(p[k] || '').trim())
  && !(p.process || []).some((s) => s.title?.trim());

export default function CaseAssist({ project, onApply }) {
  const { plan } = usePlan();
  const [open, setOpen] = useState(() => isEmptyCase(project));
  const [tab, setTab] = useState('profile');
  const [profile, setProfile] = useState('');
  const [found, setFound] = useState(null);
  const [finding, setFinding] = useState(false);
  const [building, setBuilding] = useState('');
  const [links, setLinks] = useState(['', '']);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [undo, setUndo] = useState(null);
  const [figmaToken, setFigmaToken] = useState('');  // only for this request: never saved
  const [showToken, setShowToken] = useState(false);
  const [screens, setScreens] = useState(true);
  const [useBrand, setUseBrand] = useState(true);
  const hasFigma = links.some((l) => /figma\.com\/(file|design|proto|board|slides|deck)\//i.test(l));
  const urls = links.map((l) => l.trim()).filter(Boolean).map((l) => (/^https?:\/\//i.test(l) ? l : `https://${l}`));

  const token = figmaToken.trim() ? { figmaToken: figmaToken.trim() } : {};
  const run = async (body, auto) => {
    setBusy(true); setError(null); setResult(null); setUndo(null);
    try {
      const r = await assistCaseLinks({ screens, ...token, ...body });
      setResult(r);
      if (auto && isEmptyCase(project)) apply(mergeCase(project, r.draft, true, useBrand));  // nothing to keep: fill it in
    } catch (e) {
      setError(e.status === 402 ? { text: e.message } : { text: e.body?.error || e.message, sources: e.body?.sources });
    }
    setBusy(false); setBuilding('');
  };
  const build = () => run({ urls, notes: notes.trim() }, false);
  const profileUrl = profile.trim() ? (/^https?:\/\//i.test(profile.trim()) ? profile.trim() : `https://${profile.trim()}`) : '';
  const profileIsFigma = /figma\.com\//i.test(profileUrl);
  const find = async (e) => {
    e?.preventDefault();
    setFinding(true); setError(null); setFound(null); setResult(null);
    try {
      const r = await caseProjects({ url: profileUrl, ...token });
      if (r.single) { setFound(r); await buildFrom(r, r.projects[0]); } else setFound(r);
    } catch (err) { setError({ text: err.body?.error || err.message }); }
    setFinding(false);
  };
  const buildFrom = (f, proj) => {
    setBuilding(proj.url);
    return run({ urls: proj.links, owner: f.owner ? `${f.platform}:${f.owner}` : '' }, true);
  };
  const apply = (patch) => {
    setUndo(Object.fromEntries(Object.keys(patch).map((k) => [k, project[k] ?? (Array.isArray(patch[k]) ? [] : ['cover', 'design', 'brand'].includes(k) ? null : '')])));
    onApply(patch);
  };

  if (!open) {
    return (
      <button type="button" className="aia__open" onClick={() => setOpen(true)}>
        <span className="aia__spark" aria-hidden>✦</span>
        <span><b>Build it from your profile or project links</b> Paste your GitHub, GitLab or Figma link and we’ll write the whole case study, pictures included. Or review what you have against what hiring managers look for.</span>
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
        <button role="tab" aria-selected={tab === 'profile'} className={tab === 'profile' ? 'is-on' : ''} onClick={() => setTab('profile')}>From my profile</button>
        <button role="tab" aria-selected={tab === 'links'} className={tab === 'links' ? 'is-on' : ''} onClick={() => setTab('links')}>From project links</button>
        <button role="tab" aria-selected={tab === 'review'} className={tab === 'review' ? 'is-on' : ''} onClick={() => setTab('review')}>Review my case study</button>
      </div>

      {tab === 'review' && <CaseReview project={project} />}

      {tab === 'profile' && !isSignedIn() && <p className="aia__note">Log in to build a case study from your profile.</p>}
      {tab === 'profile' && isSignedIn() && (
        <div className="aia__body">
          <p className="aia__lead">Paste your profile and pick a project. We read it, write every section, and add its pictures: screenshots from the README, the live site’s preview, or the screens of a Figma file. Nothing to type.</p>
          <form className="caselink" onSubmit={find}>
            <input className="field__input" value={profile} inputMode="url" spellCheck={false} aria-label="Your profile link" onChange={(e) => setProfile(e.target.value)}
              placeholder="github.com/you · gitlab.com/you · huggingface.co/you · a Figma team or file link" />
            <button type="submit" className="app-btn app-btn--primary" disabled={!profileUrl || finding || busy}>{finding ? 'Looking…' : 'Find my projects'}</button>
          </form>
          {profileIsFigma && (
            <label className="field">
              <span className="field__label">Figma access token <em className="field__opt">needed for teams and private files</em></span>
              <input className="field__input" type="password" value={figmaToken} onChange={(e) => setFigmaToken(e.target.value)} autoComplete="off" spellCheck={false} placeholder="figd_…" />
              <small className="field__hint">In Figma: Settings → Security → Personal access tokens, with “File content: read only” and “Projects: read only”. Used for this read only, never saved.</small>
            </label>
          )}
          {found && !found.single && (
            <ul className="aia__projects">
              {found.projects.map((p) => (
                <li key={p.url}>
                  <div><b>{p.title}</b><small>{[p.kind, ...p.meta].filter(Boolean).join(' · ')}</small>{p.desc && <span>{p.desc}</span>}</div>
                  <button type="button" className="app-btn app-btn--ghost" disabled={busy} onClick={() => buildFrom(found, p)}>
                    {building === p.url ? <><span className="cz__spin" aria-hidden /> Writing…</> : 'Build this one'}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {busy && <p className="aia__note"><span className="cz__spin" aria-hidden /> Reading the project and writing your case study. This can take up to a minute.</p>}
          <small className="aia__cost">Finding projects is free · building one costs 15 credits</small>
        </div>
      )}

      {tab === 'links' && !isSignedIn() && <p className="aia__note">Log in to build a case study from your links.</p>}
      {tab === 'links' && isSignedIn() && (
        <div className="aia__body">
          <p className="aia__lead">Paste links to the project. We read the repository’s README, stack and releases, and the live site. From a Figma file we take its screens, the words on them, its fonts, colours and page structure, and add a link to open it in Figma. Videos are embedded so visitors can watch them.</p>
          {links.map((l, i) => (
            <div className="caselink" key={i}>
              <input className="field__input" value={l} inputMode="url" spellCheck={false} aria-label={`Project link ${i + 1}`}
                onChange={(e) => setLinks(links.map((x, j) => (j === i ? e.target.value : x)))}
                placeholder={['github.com/you/project or gitlab.com/you/project', 'figma.com/design/… or your live site'][i] || 'youtube.com/watch?v=… or loom.com/share/…'} />
              {KIND(l) && <span className="caselink__kind">{KIND(l)}</span>}
            </div>
          ))}
          {links.length < 5 && <button type="button" className="aia__add" onClick={() => setLinks([...links, ''])}>+ Add another link</button>}
          {(urls.length > 0 || hasFigma) && (
            <div className="aia__figma">
              <label className="aia__check"><input type="checkbox" checked={screens} onChange={(e) => setScreens(e.target.checked)} />
                <span>Add pictures from the project: README and repo screenshots, the live site’s preview, Figma screens <small>(uses your storage)</small></span></label>
              {hasFigma && (!showToken ? (
                <button type="button" className="aia__add" onClick={() => setShowToken(true)}>Add your Figma access token (recommended: works for private files and uses your own Figma limits)</button>
              ) : (
                <label className="field">
                  <span className="field__label">Figma access token <em className="field__opt">recommended</em></span>
                  <input className="field__input" type="password" value={figmaToken} onChange={(e) => setFigmaToken(e.target.value)} autoComplete="off" spellCheck={false} placeholder="figd_…" />
                  <small className="field__hint">In Figma: Settings → Security → Personal access tokens, with “File content: read only”. We use it for this one read and never save it. Without it we try with Dixlab’s own access, which only opens files shared as “Anyone with the link can view” and is limited by Figma to a few reads a month.</small>
                </label>
              ))}
            </div>
          )}
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

      {tab !== 'review' && result && (() => {
        const d = result.draft;
        return (
          <div className="aia__result">
            <p className="aia__k">Your draft case study</p>
            {result.sources?.length > 0 && (
              <ul className="aia__sources">
                {result.sources.map((s) => (
                  <li key={s.url} className={s.read ? 'is-ok' : 'is-fail'}><span aria-hidden>{s.read ? '✓' : '✕'}</span>
                    <div><b>{s.url.replace(/^https?:\/\/(www\.)?/, '')}</b>{s.read ? ` · ${s.detail || 'read'}` : ' · couldn’t read'}{s.tip && <small>{s.tip}</small>}</div></li>
                ))}
              </ul>
            )}
            {result.figmaSetup && <p className="aia__note">We could only read your Figma file’s title. Add your Figma access token above and build again to pull in its screens, fonts and colours.</p>}
            {result.note && <p className="aia__note">{result.note}</p>}
            {(d.cover || d.gallery?.length > 0) && (
              <div className="aia__shots" aria-label="Screens from your Figma file">
                {[d.cover, ...(d.gallery || [])].filter(Boolean).slice(0, 9).map((g, i) => (
                  <figure key={g.src + i}><img src={g.src} alt={g.caption || (i === 0 ? 'Cover' : 'Screen')} loading="lazy" /><figcaption>{i === 0 && d.cover ? 'Cover' : g.caption}</figcaption></figure>
                ))}
              </div>
            )}
            {d.design && (
              <div className="aia__ds">
                {d.design.fonts?.length > 0 && <p><b>Fonts</b> {d.design.fonts.map((f) => f.family + (f.role ? ` (${f.role.toLowerCase()})` : '')).join(', ')}</p>}
                {d.design.colors?.length > 0 && <p className="aia__swatches"><b>Colours</b> {d.design.colors.map((c) => <i key={c.hex} title={c.name || c.hex} style={{ background: /^#[0-9a-f]{6}$/i.test(c.hex) ? c.hex : 'transparent' }} />)}</p>}
                {d.brand && Object.keys(d.brand).length > 0 && (
                  <label className="aia__check"><input type="checkbox" checked={useBrand} onChange={(e) => setUseBrand(e.target.checked)} />
                    <span>Style the case study like the file{d.brand.font ? `: ${FONT_PAIRS[d.brand.font]?.label || d.brand.font} fonts` : ''}{d.brand.accent ? `${d.brand.font ? ',' : ':'} accent ${d.brand.accent.toUpperCase()}` : ''}</span></label>
                )}
              </div>
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
                : <><button type="button" className="app-btn app-btn--primary" onClick={() => apply(mergeCase(project, d, false, useBrand))}>Add to my case study</button>
                  <button type="button" className="app-btn app-btn--ghost" onClick={() => apply(mergeCase(project, d, true, useBrand))}>Replace what’s there</button>
                  <button type="button" className="app-btn app-btn--ghost" onClick={() => setResult(null)}>Discard</button></>}
            </div>
            <small className="aia__note">“Add” fills empty sections and adds embeds and screens; it never overwrites what you wrote.</small>
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
