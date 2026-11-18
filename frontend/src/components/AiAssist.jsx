import { useEffect, useState } from 'react';
import { assistTailorCv, assistProfiles, cvCheck, isSignedIn, usePlan, PLAN_RANK } from '../api.js';

/*
 * The editor's AI assistant.
 * - "Tailor to a job" (CVs): paste a job link or description; Claude reshapes the
 *   headline, summary, skills order and bullets around it, from the CV's own facts.
 * - "From my profiles" (CVs and portfolios): paste GitHub / LinkedIn / X / website
 *   links or profile text; Claude reads them and drafts the CV or portfolio.
 * Nothing changes until the person presses Apply, and Apply can be undone.
 */

const list = (s) => (Array.isArray(s) ? s : String(s || '').split(',')).map((x) => String(x).trim()).filter(Boolean);
const same = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
const filledRows = (rows, keys) => (rows || []).filter((r) => keys.some((k) => String(r[k] || '').trim()));
const ROW_KEYS = { experience: ['role', 'company'], education: ['degree', 'school'], projects: ['title'] };

/** Merge a draft into the project: fill what's empty and add new items, or replace those sections. */
export function mergeDraft(cur, draft, replace) {
  const patch = {};
  for (const k of ['name', 'role', 'tagline', 'notes', 'website']) {
    if (draft[k] && (replace || !String(cur[k] || '').trim())) patch[k] = draft[k];
  }
  for (const k of ['skills', 'certs', 'languages']) {
    const add = list(draft[k]);
    if (!add.length) continue;
    const have = list(cur[k]);
    patch[k] = (replace ? add : [...have, ...add.filter((x) => !have.some((y) => same(x, y)))]).join(', ');
  }
  for (const [k, keys] of Object.entries(ROW_KEYS)) {
    const add = draft[k] || [];
    if (!add.length) continue;
    const have = filledRows(cur[k], keys);
    const fresh = add.filter((r) => !have.some((h) => keys.every((x) => same(h[x], r[x]))));
    patch[k] = replace ? add : [...have, ...fresh];
  }
  return patch;
}

function Sources({ sources }) {
  if (!sources?.length) return null;
  return (
    <ul className="aia__sources">
      {sources.map((s) => (
        <li key={s.url} className={s.read ? 'is-ok' : 'is-fail'}>
          <span aria-hidden>{s.read ? '✓' : '✕'}</span>
          <div><b>{s.url.replace(/^https?:\/\/(www\.)?/, '')}</b>{s.read ? ' · read' : ' · couldn’t read'}{!s.read && s.tip && <small>{s.tip}</small>}</div>
        </li>
      ))}
    </ul>
  );
}

export default function AiAssist({ kind, project, onApply }) {
  const { plan } = usePlan();
  const isCv = kind === 'cv';
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState(isCv ? 'job' : 'profiles');
  const [jobUrl, setJobUrl] = useState('');
  const [jobText, setJobText] = useState('');
  const [links, setLinks] = useState(['', '', '']);
  const [text, setText] = useState('');
  const [bgLinks, setBgLinks] = useState(['', '']);  // about the person, for a job-aimed CV
  const [bgText, setBgText] = useState('');
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);   // { type: 'job' | 'profiles', ... }
  const [undo, setUndo] = useState(null);       // the fields as they were before Apply

  const signedIn = isSignedIn();
  const needsPro = plan?.enforced && PLAN_RANK[plan.plan] < PLAN_RANK.pro;
  const units = plan?.usage?.ai;
  // An empty CV can't be tailored, so the job tab builds one from the person's background instead.
  const hasCv = Boolean(String(project.notes || '').trim() || list(project.skills).length
    || (project.experience || []).some((r) => String(r.role || '').trim() || String(r.desc || '').trim()));
  const hasBg = bgLinks.some((l) => l.trim()) || bgText.trim().length >= 40;
  const hasJob = jobUrl.trim() || jobText.trim().length >= 80;

  const run = async (fn) => {
    setBusy(true); setError(null); setResult(null); setUndo(null);
    try { setResult(await fn()); } catch (e) {
      if (e.status === 402) setError({ text: e.message });  // the upgrade dialog explains the rest
      else setError({ text: e.body?.error || e.message, sources: e.body?.sources, detail: e.body?.detail });
    }
    setBusy(false);
  };
  const tailor = () => run(async () => {
    const cv = { ...project, skills: list(project.skills).join(', '), certs: list(project.certs).join(', '), languages: list(project.languages).join(', '),
      experience: filledRows(project.experience, ROW_KEYS.experience), education: filledRows(project.education, ROW_KEYS.education),
      projects: filledRows(project.projects, ROW_KEYS.projects) };
    const keep = ['role', 'notes', 'skills', 'certs', 'languages', 'experience', 'education', 'projects', 'name'];
    const res = await assistTailorCv({
      job_url: jobUrl.trim(), job_text: jobText.trim(), cv: Object.fromEntries(keep.map((k) => [k, cv[k] ?? (Array.isArray(cv[k]) ? [] : '')])),
      background_urls: bgLinks.map((l) => l.trim()).filter(Boolean), background_text: bgText.trim(),
    });
    if (res.built) return { type: 'build', ...res };
    return { type: 'job', ...res, experience: cv.experience };
  });
  const readProfiles = () => run(async () => {
    const res = await assistProfiles({ kind, urls: links.map((l) => l.trim()).filter(Boolean), text: text.trim() });
    return { type: 'profiles', ...res };
  });

  const apply = (patch) => {
    setUndo(Object.fromEntries(Object.keys(patch).map((k) => [k, project[k] ?? (Array.isArray(patch[k]) ? [] : '')])));
    onApply(patch);
  };
  const applyTailored = () => {
    const t = result.tailored;
    const experience = result.experience.map((r, i) => {
      const hit = t.experience.find((e) => e.index === i);
      return hit ? { ...r, desc: hit.desc } : r;
    });
    apply({ role: t.role, notes: t.summary, skills: t.skills.join(', '), experience });
  };

  if (!open) {
    return (
      <button type="button" className="aia__open" onClick={() => setOpen(true)}>
        <span className="aia__spark" aria-hidden>✦</span>
        <span><b>{isCv ? 'Let AI shape your CV' : 'Let AI build your portfolio'}</b>
          {isCv ? ' Check it against the standard hiring platforms like Mercor screen for, tailor it to a job, or build it from your GitHub, LinkedIn or X.' : ' From your GitHub, LinkedIn, X or website: your projects, how you work, what you build.'}</span>
        <span aria-hidden>Open →</span>
      </button>
    );
  }

  return (
    <section className="aia" aria-label="AI assistant">
      <div className="aia__head">
        <p className="aia__title"><span className="aia__spark" aria-hidden>✦</span>AI assistant</p>
        {units && <span className="aia__units">{Math.max(0, units.allowance - units.units)} AI units left</span>}
        <button type="button" className="aia__x" onClick={() => setOpen(false)} aria-label="Close the AI assistant">✕</button>
      </div>
      {isCv && (
        <div className="aia__tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'job'} className={tab === 'job' ? 'is-on' : ''} onClick={() => { setTab('job'); setResult(null); setError(null); }}>Tailor to a job</button>
          <button role="tab" aria-selected={tab === 'profiles'} className={tab === 'profiles' ? 'is-on' : ''} onClick={() => { setTab('profiles'); setResult(null); setError(null); }}>From my profiles</button>
          <button role="tab" aria-selected={tab === 'check'} className={tab === 'check' ? 'is-on' : ''} onClick={() => { setTab('check'); setResult(null); setError(null); }}>Check my CV</button>
        </div>
      )}

      {isCv && tab === 'check' && <CvCheck project={project} onApply={onApply} />}

      {!signedIn && tab !== 'check' && <p className="aia__note">Log in to use the AI assistant.</p>}

      {signedIn && tab === 'job' && (
        <div className="aia__body">
          <p className="aia__lead">{hasCv
            ? 'Paste the job advert. We’ll reshape your headline, summary, skills and bullet points around what this employer asks for, using only what’s true about you.'
            : 'Paste the job advert and tell us about you. We’ll write a CV aimed at this job, using only what’s true about you.'}</p>
          <label className="field">
            <span className="field__label">Job link</span>
            <input className="field__input" value={jobUrl} onChange={(e) => setJobUrl(e.target.value)} placeholder="https://careers.example.com/jobs/frontend-engineer" inputMode="url" />
          </label>
          <label className="field">
            <span className="field__label">Or paste the job description <em className="field__opt">best if the link needs a login</em></span>
            <textarea className="field__input aia__text" value={jobText} onChange={(e) => setJobText(e.target.value)} placeholder="About the role… What you’ll do… What we’re looking for…" />
          </label>
          {hasCv && !more && <button type="button" className="aia__add" onClick={() => setMore(true)}>+ Add more about you (optional: profile links or an old CV)</button>}
          {(!hasCv || more) && (
            <div className={`aia__about ${hasCv ? '' : 'is-needed'}`}>
              <p className="aia__about-t">{hasCv ? 'More about you' : <><b>Your CV is empty,</b> so we’ll build one for this job. Tell us about you:</>}</p>
              {bgLinks.map((l, i) => (
                <input key={i} className="field__input" value={l} inputMode="url" aria-label={`Your profile link ${i + 1}`}
                  onChange={(e) => setBgLinks(bgLinks.map((x, j) => (j === i ? e.target.value : x)))}
                  placeholder={['github.com/yourname or your website', 'linkedin.com/in/yourname'][i]} />
              ))}
              <textarea className="field__input aia__text" value={bgText} onChange={(e) => setBgText(e.target.value)}
                aria-label="Your old CV or experience"
                placeholder="Paste your old CV, or describe your experience: where you’ve worked, what you did, what you studied, the tools you use. LinkedIn needs a login, so paste your profile’s Experience section here." />
            </div>
          )}
          <div className="aia__row">
            <button type="button" className="app-btn app-btn--primary" disabled={busy || !hasJob || (!hasCv && !hasBg)} onClick={tailor}>
              {busy ? <><span className="cz__spin" aria-hidden /> {hasCv ? 'Reading the job…' : 'Writing your CV…'}</> : hasCv ? 'Tailor my CV' : 'Build my CV for this job'}
            </button>
            <small className="aia__cost">{needsPro ? 'Part of Pro and Premium · ' : ''}20 AI units</small>
          </div>
        </div>
      )}

      {signedIn && tab === 'profiles' && (
        <div className="aia__body">
          <p className="aia__lead">Paste your public profiles. We’ll read your work, the products you build and how you solve problems, then {isCv ? 'draft your CV' : 'write your portfolio'} from them.</p>
          {links.map((l, i) => (
            <input key={i} className="field__input" value={l} inputMode="url" aria-label={`Profile link ${i + 1}`}
              onChange={(e) => setLinks(links.map((x, j) => (j === i ? e.target.value : x)))}
              placeholder={['github.com/yourname', 'linkedin.com/in/yourname', 'x.com/yourname or yoursite.com'][i] || 'Another link'} />
          ))}
          {links.length < 5 && <button type="button" className="aia__add" onClick={() => setLinks([...links, ''])}>+ Add another link</button>}
          <label className="field">
            <span className="field__label">Profile text <em className="field__opt">optional · recommended for LinkedIn and X</em></span>
            <textarea className="field__input aia__text" value={text} onChange={(e) => setText(e.target.value)} placeholder="LinkedIn and X only show profiles to signed-in members, so paste your About, Experience or a few posts here." />
          </label>
          <div className="aia__row">
            <button type="button" className="app-btn app-btn--primary" disabled={busy || (!links.some((l) => l.trim()) && text.trim().length < 40)} onClick={readProfiles}>
              {busy ? <><span className="cz__spin" aria-hidden /> Reading your profiles…</> : 'Read my profiles'}
            </button>
            <small className="aia__cost">15 AI units{busy ? ' · this can take up to a minute' : ''}</small>
          </div>
        </div>
      )}

      {error && (
        <div className="aia__error" role="alert">
          <p>{error.text}</p>
          {error.detail && <small className="aia__detail">Anthropic said: {error.detail}</small>}
          <Sources sources={error.sources} />
        </div>
      )}

      {result?.type === 'job' && (() => {
        const t = result.tailored;
        return (
          <div className="aia__result">
            <p className="aia__k">Tailored for {t.job_title || 'this job'}{t.company ? ` at ${t.company}` : ''}</p>
            <Sources sources={result.sources} />
            <dl className="aia__diff">
              <dt>Headline</dt><dd>{t.role}</dd>
              <dt>Summary</dt><dd>{t.summary}</dd>
              <dt>Skills, most relevant first</dt><dd>{t.skills.join(' · ')}</dd>
              {t.experience.map((e) => (
                <div key={e.index} className="aia__role">
                  <dt>{result.experience[e.index]?.role} · {result.experience[e.index]?.company}</dt>
                  <dd><ul>{e.desc.split('\n').map((b) => <li key={b}>{b}</li>)}</ul></dd>
                </div>
              ))}
            </dl>
            {t.matched.length > 0 && <div className="aia__chips"><span>You match</span>{t.matched.map((m) => <i key={m}>{m}</i>)}</div>}
            {t.gaps.length > 0 && (
              <div className="aia__gaps"><p>Not in your CV yet. Add these only if they’re true:</p><ul>{t.gaps.map((g) => <li key={g}>{g}</li>)}</ul></div>
            )}
            <div className="aia__row">
              {undo ? <><span className="aia__done">Applied to your CV.</span><button type="button" className="app-btn app-btn--ghost" onClick={() => { onApply(undo); setUndo(null); }}>Undo</button></>
                : <><button type="button" className="app-btn app-btn--primary" onClick={applyTailored}>Apply to my CV</button>
                  <button type="button" className="app-btn app-btn--ghost" onClick={() => setResult(null)}>Discard</button></>}
            </div>
          </div>
        );
      })()}

      {result?.type === 'build' && (() => {
        const d = result.built;
        return (
          <div className="aia__result">
            <p className="aia__k">A CV for {result.job_title || 'this job'}{result.company ? ` at ${result.company}` : ''}</p>
            <Sources sources={result.sources} />
            <dl className="aia__diff">
              {d.role && <><dt>Headline</dt><dd>{d.role}</dd></>}
              {d.notes && <><dt>Summary</dt><dd>{d.notes}</dd></>}
              {d.skills && <><dt>Skills, most relevant first</dt><dd>{list(d.skills).join(' · ')}</dd></>}
              {d.experience.map((e) => (
                <div key={e.role + e.company} className="aia__role">
                  <dt>{e.role} · {e.company}{e.from ? ` (${[e.from, e.to].filter(Boolean).join(' – ')})` : ''}</dt>
                  {e.desc && <dd><ul>{e.desc.split('\n').map((b) => <li key={b}>{b}</li>)}</ul></dd>}
                </div>
              ))}
              {d.education.length > 0 && <><dt>Education</dt><dd><ul>{d.education.map((e) => <li key={e.degree + e.school}>{e.degree}, {e.school}</li>)}</ul></dd></>}
              {d.projects.length > 0 && <><dt>Projects</dt><dd><ul>{d.projects.map((p) => <li key={p.title}><b>{p.title}</b>: {p.desc}</li>)}</ul></dd></>}
            </dl>
            {result.matched.length > 0 && <div className="aia__chips"><span>You match</span>{result.matched.map((m) => <i key={m}>{m}</i>)}</div>}
            {result.gaps.length > 0 && (
              <div className="aia__gaps"><p>Not in your CV yet. Add these only if they’re true:</p><ul>{result.gaps.map((g) => <li key={g}>{g}</li>)}</ul></div>
            )}
            <div className="aia__row">
              {undo ? <><span className="aia__done">Your CV is ready. Check each section, then pick a template.</span><button type="button" className="app-btn app-btn--ghost" onClick={() => { onApply(undo); setUndo(null); }}>Undo</button></>
                : <><button type="button" className="app-btn app-btn--primary" onClick={() => apply(mergeDraft(project, d, false))}>Use this CV</button>
                  <button type="button" className="app-btn app-btn--ghost" onClick={() => setResult(null)}>Discard</button></>}
            </div>
          </div>
        );
      })()}

      {result?.type === 'profiles' && (() => {
        const d = result.draft;
        const n = (k) => (d[k] || []).length;
        return (
          <div className="aia__result">
            <p className="aia__k">What we found</p>
            <Sources sources={result.sources} />
            {result.insights?.length > 0 && <ul className="aia__insights">{result.insights.map((x) => <li key={x}>{x}</li>)}</ul>}
            <dl className="aia__diff">
              {d.role && <><dt>Headline</dt><dd>{d.role}</dd></>}
              {d.tagline && <><dt>Tagline</dt><dd>{d.tagline}</dd></>}
              {d.notes && <><dt>{isCv ? 'Summary' : 'About you'}</dt><dd>{d.notes}</dd></>}
              {d.skills && <><dt>Skills</dt><dd>{list(d.skills).join(' · ')}</dd></>}
              {n('projects') > 0 && <><dt>Projects ({n('projects')})</dt><dd><ul>{d.projects.map((p) => <li key={p.title}><b>{p.title}</b>: {p.desc}</li>)}</ul></dd></>}
              {n('experience') > 0 && <><dt>Experience ({n('experience')})</dt><dd><ul>{d.experience.map((e) => <li key={e.role + e.company}>{e.role}, {e.company} {e.from && `(${[e.from, e.to].filter(Boolean).join(' – ')})`}</li>)}</ul></dd></>}
              {n('education') > 0 && <><dt>Education</dt><dd><ul>{d.education.map((e) => <li key={e.degree + e.school}>{e.degree}, {e.school}</li>)}</ul></dd></>}
            </dl>
            <div className="aia__row">
              {undo ? <><span className="aia__done">Added to your {isCv ? 'CV' : 'portfolio'}.</span><button type="button" className="app-btn app-btn--ghost" onClick={() => { onApply(undo); setUndo(null); }}>Undo</button></>
                : <><button type="button" className="app-btn app-btn--primary" onClick={() => apply(mergeDraft(project, d, false))}>Add to my {isCv ? 'CV' : 'portfolio'}</button>
                  <button type="button" className="app-btn app-btn--ghost" onClick={() => apply(mergeDraft(project, d, true))}>Replace what’s there</button>
                  <button type="button" className="app-btn app-btn--ghost" onClick={() => setResult(null)}>Discard</button></>}
            </div>
            <small className="aia__note">“Add” fills empty fields and adds new projects and roles; it never overwrites what you wrote.</small>
          </div>
        );
      })()}
    </section>
  );
}

/* ---------- Check my CV: the hiring-platform standard, instantly and for free ---------- */

const LEVEL = { fix: ['Fix', 'is-fix'], improve: ['Improve', 'is-improve'], ok: ['Good', 'is-ok'] };

function CvCheck({ project, onApply }) {
  const [res, setRes] = useState(null);
  const [error, setError] = useState('');
  const [showOk, setShowOk] = useState(false);
  // Re-check as they edit (debounced): it's free and takes milliseconds.
  const key = JSON.stringify([project.name, project.email, project.phone, project.location, project.website, project.notes,
    project.skills, project.experience, project.education, project.projects, project.template]);
  useEffect(() => {
    const t = setTimeout(() => {
      cvCheck({ ...project, skills: list(project.skills).join(', ') }).then((r) => { setRes(r); setError(''); })
        .catch((e) => setError(e.message));
    }, 500);
    return () => clearTimeout(t);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) return <p className="aia__note">{error}</p>;
  if (!res) return <p className="aia__note"><span className="cz__spin" aria-hidden /> Checking…</p>;
  const todo = res.checks.filter((c) => c.level !== 'ok');
  const good = res.checks.filter((c) => c.level === 'ok');
  const layout = res.checks.find((c) => c.id === 'layout' && c.level !== 'ok');
  return (
    <div className="aia__body cvchk">
      <div className="cvchk__head">
        <div className={`cvchk__score ${res.score >= 85 ? 'is-good' : res.score >= 65 ? 'is-mid' : 'is-low'}`} aria-label={`Score ${res.score} out of 100`}>
          <b>{res.score}</b><span>/100</span>
        </div>
        <div>
          <p className="cvchk__grade">{res.grade}</p>
          <p className="aia__lead">Checked against what expert-hiring platforms like Mercor screen for: outcome-led bullets with numbers, focused skills, 1–2 pages, a simple layout and complete contact details. Free, and it updates as you edit.</p>
        </div>
      </div>
      {todo.length > 0 && (
        <ul className="cvchk__list">
          {todo.map((c) => (
            <li key={c.id} className={LEVEL[c.level][1]}>
              <span className="cvchk__tag">{LEVEL[c.level][0]}</span>
              <div><b>{c.title}</b>{c.detail && <small>{c.detail}</small>}</div>
            </li>
          ))}
        </ul>
      )}
      {layout && (
        <div className="aia__row">
          <button type="button" className="app-btn app-btn--ghost" onClick={() => onApply({ template: 'plain' })}>Switch to the Plain template</button>
          <button type="button" className="app-btn app-btn--ghost" onClick={() => onApply({ template: 'classic' })}>Switch to Classic</button>
        </div>
      )}
      {good.length > 0 && (
        <button type="button" className="aia__add" onClick={() => setShowOk(!showOk)}>{showOk ? 'Hide' : 'Show'} what’s already good ({good.length})</button>
      )}
      {showOk && <ul className="cvchk__list">{good.map((c) => <li key={c.id} className="is-ok"><span className="cvchk__tag">Good</span><div><b>{c.title}</b></div></li>)}</ul>}
      <small className="aia__note">Tip: “Tailor to a job” rewrites your bullets to this standard for a specific role. Export as PDF from the editor: it’s text-based, as screening systems need.</small>
    </div>
  );
}
