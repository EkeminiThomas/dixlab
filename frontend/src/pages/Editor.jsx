import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  AppArrow, AppSparkles15, AppSparkles18, AppStickyNote, AppFileCheck,
  FORMATS, TEMPLATES, loadProjects, saveProjects, loadUser,
  deleteProject, ConfirmDelete, TrashIcon,
} from '../components/ui.jsx';
import { LiveSite, SITE_TEMPLATES } from '../components/sites/index.jsx';
import TemplateViewer from '../components/sites/Viewer.jsx';
import Customize from '../components/sites/Customize.jsx';
import { blankSiteProject, blankSiteRole, projectToSite } from '../components/sites/shared.jsx';
import { ScaledDoc, CvDoc, CV_TEMPLATES } from '../components/cv/index.jsx';
import { projectToCv, blankCvRole, blankCvEdu } from '../components/cv/data.js';
import CvViewer from '../components/cv/CvViewer.jsx';
import { pushProject, fetchProject, uploadImage, isSignedIn, useSyncStatus } from '../api.js';
import PublishDialog from '../components/Publish.jsx';
import { draftKeysFor } from '../components/case/interview.js';
import MediaField from '../components/MediaField.jsx';
import FileField from '../components/FileField.jsx';
import ProfilePhotoField from '../components/ProfilePhotoField.jsx';
import { uploadMedia, ACCEPT } from '../components/media.js';
import { CasePreview, CASE_TEMPLATES } from '../components/case/index.jsx';
import { projectToCase, caseStrength, CASE_FIELDS, blankStep, blankMetric, readImage, MAX_GALLERY } from '../components/case/data.js';

const STEPS = [
  { id: 'notes', n: '01 —', name: 'Start with what you have', hint: 'Rough notes are enough.' },
  { id: 'story', n: '02 —', name: 'Find the story', hint: 'Three questions to bring it into focus.' },
  { id: 'format', n: '03 —', name: 'Make it yours', hint: 'Choose a format and template.' },
];

const QUESTIONS = [
  ['problem', 'The challenge', 'What problem did you solve?', 'Campus events lived across scattered group chats. Students had no single place to discover what was happening or find their community.'],
  ['contribution', 'My contribution', 'What part did you own?', 'I designed and built the API with Node.js and TypeScript, working with a team of four to simplify event discovery.'],
  ['learned', 'What I learned', 'What did you learn?', 'Clear contracts between front end and back end save more time than clever code. Small, regular demos kept the team aligned.'],
];

const SITE_STEP = { id: 'site', n: '02 —', name: 'Show your work', hint: 'Projects, experience and contact.' };
const CUSTOM_STEP = { id: 'custom', n: '04 —', name: 'Customize', hint: 'Fonts, colour and motion.' };

const CV_STEPS = [
  { id: 'cv-basics', n: '01 —', name: 'Your details', hint: 'Name, headline and contact.' },
  { id: 'cv-exp', n: '02 —', name: 'Experience', hint: 'Roles and what you achieved.' },
  { id: 'cv-edu', n: '03 —', name: 'Education & skills', hint: 'Study, skills and languages.' },
  { id: 'format', n: '04 —', name: 'Make it yours', hint: 'Choose a format and template.' },
  { id: 'custom', n: '05 —', name: 'Customize', hint: 'Fonts, colour and text size.' },
];

const CASE_STEPS = [
  { id: 'cs-overview', n: '01 —', name: 'Overview', hint: 'Title, role and the essentials.' },
  { id: 'cs-problem', n: '02 —', name: 'Problem & goals', hint: 'What needed solving, and why.' },
  { id: 'cs-process', n: '03 —', name: 'Process', hint: 'Research, steps and your part.' },
  { id: 'cs-results', n: '04 —', name: 'Results', hint: 'Solution, numbers and lessons.' },
  { id: 'cs-materials', n: '05 —', name: 'Materials', hint: 'Cover, visuals and links.' },
  { id: 'format', n: '06 —', name: 'Make it yours', hint: 'Choose a format and template.' },
  { id: 'custom', n: '07 —', name: 'Customize', hint: 'Fonts, colour and motion.' },
];

const DEFAULT_TEMPLATE = { portfolio: 'folio', cv: 'classic', case: 'snapshot' };

const Rec = () => <em className="field__rec">Recommended</em>;
const Opt = () => <em className="field__opt">optional</em>;

/** Can a project of `type` use template `t`? */
const fits = (type, t) => (type === 'portfolio' ? Boolean(SITE_TEMPLATES[t]) || t === 'studio'
  : type === 'cv' ? Boolean(CV_TEMPLATES[t]) || t === 'outline'
  : Boolean(TEMPLATES[t]) && !TEMPLATES[t].site && !TEMPLATES[t].cv);
const isStory = (t) => Boolean(TEMPLATES[t]) && !TEMPLATES[t].site && !TEMPLATES[t].cv && !TEMPLATES[t].cs;

/** Fields the portfolio site templates use; filled in for records saved before they existed. */
function withSiteFields(p) {
  const user = loadUser();
  return {
    title: '', notes: '', role: '', skills: '', problem: '', contribution: '', learned: '', status: 'Draft',
    name: user.name || '', tagline: '', email: user.email || '', certs: '', brand: {},
    phone: '', location: '', website: '', languages: '',
    client: '', team: '', timeline: '', industry: '', goals: '', audience: '', constraints: '', research: '',
    solution: '', quote: '', quoteBy: '', next: '', link: '', cover: null, gallery: [], files: [],
    ...p,
    process: p.process?.length ? p.process : [blankStep()],
    metrics: p.metrics?.length ? p.metrics : [blankMetric()],
    projects: p.projects?.length ? p.projects : [blankSiteProject()],
    experience: p.experience?.length ? p.experience : [blankSiteRole()],
    education: p.education?.length ? p.education : [blankCvEdu()],
  };
}

function blankProject(type) {
  return {
    id: `p-${Date.now().toString(36)}`,
    type, status: 'Draft', template: DEFAULT_TEMPLATE[type] || 'outline', updatedAt: Date.now(),
    title: '', notes: '', role: '', skills: '', problem: '', contribution: '', learned: '',
  };
}

export default function Editor() {
  const { id } = useParams();
  const [search] = useSearchParams();
  const nav = useNavigate();

  const [d, setD] = useState(() => {
    const found = id && loadProjects().find((p) => p.id === id);
    if (found) return withSiteFields(found);
    const type = FORMATS[search.get('format')] ? search.get('format') : 'case';
    const fresh = blankProject(type);
    if (TEMPLATES[search.get('template')]) fresh.template = search.get('template');
    return withSiteFields(fresh);
  });
  const [step, setStep] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [storeFull, setStoreFull] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const dirty = useRef(Boolean(id) && d.id === id);
  const loadedAt = useRef(d.updatedAt);
  const sync = useSyncStatus();

  // Save to this browser, and to the account when signed in.
  const persist = (record, push = true) => {
    const all = loadProjects();
    const exists = all.some((p) => p.id === record.id);
    setStoreFull(!saveProjects(exists ? all.map((p) => (p.id === record.id ? record : p)) : [record, ...all]));
    if (push) pushProject(record);
  };

  // Save every change. New stories are only stored once edited.
  useEffect(() => {
    if (dirty.current) persist(d, d.updatedAt !== loadedAt.current);
  }, [d]);

  // Opening /editor/:id for a project this browser hasn't cached yet: load it from the account.
  useEffect(() => {
    if (!id || d.id === id || !isSignedIn()) return;
    let live = true;
    fetchProject(id).then((p) => {
      if (!live || !p) return;
      loadedAt.current = p.updatedAt;
      dirty.current = true;
      setD(withSiteFields(p));
    });
    return () => { live = false; };
  }, [id]);

  const update = (patch) => { dirty.current = true; setD((prev) => ({ ...prev, ...patch, sample: false, updatedAt: Date.now() })); };
  const bind = (k) => ({ value: d[k], onChange: (e) => update({ [k]: e.target.value }) });

  const finish = () => {
    persist({ ...d, title: d.title.trim() || 'Untitled story', updatedAt: Date.now() });
    nav('/dashboard');
  };
  const saved = () => loadProjects().some((p) => p.id === d.id);
  const remove = () => {
    dirty.current = false; // don't re-save on the way out
    deleteProject(d.id);
    nav(d.type === 'portfolio' ? '/portfolio' : '/dashboard');
  };
  const go = (n) => { setStep(n); window.scrollTo({ top: 0 }); };

  const skills = d.skills.split(',').map((s) => s.trim()).filter(Boolean);
  // Portfolios can use a site template; everything else uses a story template.
  const isSite = d.type === 'portfolio' && Boolean(SITE_TEMPLATES[d.template]);
  const isCv = d.type === 'cv' && Boolean(CV_TEMPLATES[d.template]);
  const isCase = d.type === 'case' && Boolean(CASE_TEMPLATES[d.template]);
  const tpl = isSite || isCv || isCase ? d.template : (isStory(d.template) ? d.template : 'outline');
  const steps = isCase ? CASE_STEPS : isCv ? CV_STEPS : isSite ? [STEPS[0], SITE_STEP, STEPS[2], CUSTOM_STEP] : STEPS;
  const strength = isCase ? caseStrength(d) : null;

  // Set one field from an async uploader (always on the latest state).
  const setField = (k, v) => { dirty.current = true; setD((prev) => ({ ...prev, [k]: v, sample: false, updatedAt: Date.now() })); };
  const cur = Math.min(step, steps.length - 1); // stays valid if the template changes
  const sid = steps[cur].id;
  const customAt = steps.findIndex((s) => s.id === 'custom');
  const pickable = Object.keys(TEMPLATES).filter((k) => fits(d.type, k)).map((k) => [k, TEMPLATES[k]]);
  const setType = (k) => update({ type: k, template: fits(k, d.template) ? d.template : DEFAULT_TEMPLATE[k] });

  // A CV prints on its own, at real A4 size, named after the person.
  const exportPdf = () => {
    if (!isCv) { window.print(); return; }
    const title = document.title;
    document.title = `${(d.name || 'My').trim()} CV`;
    document.body.classList.add('is-printing-cv');
    const done = () => {
      document.body.classList.remove('is-printing-cv');
      document.title = title;
      window.removeEventListener('afterprint', done);
    };
    window.addEventListener('afterprint', done);
    window.print();
  };

  // Repeating rows (projects, experience) for the Folio template
  const setRow = (list, i, k) => (e) => update({ [list]: d[list].map((r, j) => (j === i ? { ...r, [k]: e.target.value } : r)) });
  const addRow = (list, make) => update({ [list]: [...d[list], make()] });
  const removeRow = (list, i) => update({ [list]: d[list].filter((_, j) => j !== i) });

  return (
    <div className="ed">
      <header className="ed__bar">
        <Link to="/dashboard" className="ed__back">← Your work</Link>
        <input className="ed__title" {...bind('title')} placeholder={isCv ? 'Untitled CV' : isCase ? 'Untitled case study' : 'Untitled story'} aria-label="Title" />
        <p className={`ed__status ${storeFull ? 'is-error' : ''}`} role={storeFull ? 'alert' : undefined}>{storeFull ? 'Storage full: remove an image to keep saving'
          : !dirty.current ? 'Not saved yet'
          : !isSignedIn() ? 'Saved in this browser'
          : { syncing: 'Saving…', saved: 'Saved to your account', offline: 'Offline · saved in this browser', error: 'Couldn’t save to your account' }[sync] || 'Saved in this browser'}</p>
        {saved() && <button className="app-btn app-btn--ghost ed__del" onClick={() => setConfirming(true)} aria-label="Delete this project" title="Delete"><TrashIcon /></button>}
        <button className="app-btn app-btn--ghost" onClick={exportPdf}>Export PDF</button>
        <button className="app-btn app-btn--ghost ed__publish" onClick={() => { if (dirty.current) persist(d); setPublishing(true); }}>{d.status === 'Published' ? 'Published ✓' : 'Publish'}</button>
        <button className="app-btn app-btn--primary" onClick={finish}>Done</button>
      </header>

      <div className="ed__body">
        <nav className="ed__steps" aria-label="Steps">
          {steps.map((s, i) => (
            <button key={s.n} className={`ed__step ${i === cur ? 'is-active' : ''}`} onClick={() => go(i)} aria-current={i === cur ? 'step' : undefined}>
              <span className="ed__step-n">{s.n}</span>
              <span>
                <span className="ed__step-t">{s.name}</span>
                <span className="ed__step-h">{s.hint}</span>
              </span>
            </button>
          ))}
          {strength && (
            <div className="ed__strength" aria-live="polite">
              <div className="ed__strength-head">
                <span>Case study strength</span>
                <b>{strength.done}/{strength.total}</b>
              </div>
              <div className="ed__strength-bar"><i style={{ width: `${(strength.done / strength.total) * 100}%` }} /></div>
              {strength.missing.length > 0 ? (
                <>
                  <p className="ed__strength-k">Recommended next</p>
                  <ul className="ed__strength-list">
                    {strength.missing.slice(0, 5).map((f) => (
                      <li key={f.key}><button type="button" onClick={() => go(steps.findIndex((s) => s.id === f.step))}>{f.label}</button></li>
                    ))}
                  </ul>
                </>
              ) : <p className="ed__strength-k is-done">Every recommended detail is in. Nice work.</p>}
            </div>
          )}
        </nav>

        <section className="ed__main">
          <div className="ed__form">
            {sid === 'notes' && (
              <>
                <div>
                  <p className="section-label"><AppStickyNote /><span>My project notes</span></p>
                  <h2 className="ed__h2">You don’t need a finished story. Just a place to start.</h2>
                </div>
                <p className="ed__lead">A project, a role, a course, or a few rough notes. Write it the way you’d say it to a friend.</p>
                {isSite && !d.interview?.drafted && (
                  <Link to={`/interview/${d.id}`} className="ed__interview">
                    <span><b>Rather talk it through?</b> A ten-minute interview writes your portfolio in your own words.</span>
                    <span aria-hidden>Start the interview →</span>
                  </Link>
                )}
                {d.type === 'portfolio' && (
                  <ProfilePhotoField value={d.photo || ''} name={d.name} onChange={(url) => setField('photo', url)} siteTemplate={isSite} />
                )}
                <label className="field">
                  <span className="field__label">{isSite ? 'About you' : 'Your notes'}</span>
                  <textarea className="field__input field__input--notes" {...bind('notes')} placeholder={isSite ? 'I like building solid, well-considered software. Leave a blank line to start a new paragraph.' : 'Built a campus events app. Worked on the API. Made it easier to find things.'} />
                </label>
                <label className="field">
                  <span className="field__label">Your role</span>
                  <input className="field__input" {...bind('role')} placeholder="Full-stack developer" />
                </label>
                <label className="field">
                  <span className="field__label">Skills and tools</span>
                  <input className="field__input" {...bind('skills')} placeholder="React, Node.js, TypeScript" />
                  <small className="field__hint">Separate with commas.</small>
                </label>
              </>
            )}

            {sid === 'site' && (
              <>
                <div>
                  <p className="section-label"><AppSparkles15 /><span>Show your work</span></p>
                  <h2 className="ed__h2">Projects, experience, and a way to reach you.</h2>
                </div>
                <div className="ed__pair">
                  <label className="field">
                    <span className="field__label">Name on your portfolio</span>
                    <input className="field__input" {...bind('name')} placeholder="Alex Morgan" />
                  </label>
                  <label className="field">
                    <span className="field__label">Contact email</span>
                    <input className="field__input" type="email" {...bind('email')} placeholder="alex.morgan@email.com" />
                  </label>
                </div>
                <label className="field">
                  <span className="field__label">Tagline</span>
                  <textarea className="field__input" rows={2} {...bind('tagline')} placeholder={'Building thoughtful, accessible products.\nStudent by day, maker by night.'} />
                </label>
                <label className="field">
                  <span className="field__label">Certifications &amp; awards <em className="field__opt">optional</em></span>
                  <input className="field__input" {...bind('certs')} placeholder={tpl === 'sentinel' ? 'OSCP, CompTIA Security+, CISSP' : 'Google UX Certificate, Awwwards Honourable Mention'} />
                  <small className="field__hint">Separate with commas.{tpl === 'sentinel' ? ' Shown as badges at the top of your Sentinel portfolio.' : ''}</small>
                </label>

                <fieldset className="ed__set">
                  <legend>Projects</legend>
                  {d.projects.map((p, i) => (
                    <div key={i} className="ed__row">
                      <div className="ed__row-head">
                        <span>Project {String(i + 1).padStart(2, '0')}</span>
                        {d.projects.length > 1 && <button type="button" className="ed__remove" onClick={() => removeRow('projects', i)}>Remove</button>}
                      </div>
                      <input className="field__input" value={p.title} onChange={setRow('projects', i, 'title')} placeholder="Project name" aria-label={`Project ${i + 1} name`} />
                      <textarea className="field__input" rows={2} value={p.desc} onChange={setRow('projects', i, 'desc')} placeholder="One or two lines on what it is and who it helps." aria-label={`Project ${i + 1} description`} />
                      <input className="field__input" type="url" value={p.link} onChange={setRow('projects', i, 'link')} placeholder="https://… (optional)" aria-label={`Project ${i + 1} link`} />
                      <MediaField
                        value={p.media || []}
                        onChange={(media) => { dirty.current = true; setD((prev) => ({ ...prev, sample: false, updatedAt: Date.now(), projects: prev.projects.map((r, j) => (j === i ? { ...r, media } : r)) })); }}
                      />
                      <details className="ed__more" open={Boolean(p.details || p.role || p.year || p.tools) || undefined}>
                        <summary>Project page details <em className="field__opt">optional</em></summary>
                        <small className="field__hint">Visitors click a project to open its own page. These fill it out, alongside every image and video above.</small>
                        <div className="ed__pair">
                          <input className="field__input" value={p.role || ''} onChange={setRow('projects', i, 'role')} placeholder="Your role, e.g. Lead designer" aria-label={`Project ${i + 1} your role`} />
                          <input className="field__input" value={p.year || ''} onChange={setRow('projects', i, 'year')} placeholder="Year, e.g. 2025" aria-label={`Project ${i + 1} year`} />
                        </div>
                        <input className="field__input" value={p.tools || ''} onChange={setRow('projects', i, 'tools')} placeholder="Tools, separated by commas: Figma, React, After Effects" aria-label={`Project ${i + 1} tools`} />
                        <textarea className="field__input" rows={5} value={p.details || ''} onChange={setRow('projects', i, 'details')} placeholder={'The full story: the brief, what you did, how it turned out.\n\nLeave a blank line between paragraphs.'} aria-label={`Project ${i + 1} full write-up`} />
                      </details>
                    </div>
                  ))}
                  {d.projects.length < 6 && <button type="button" className="ed__add" onClick={() => addRow('projects', blankSiteProject)}>+ Add project</button>}
                </fieldset>

                <fieldset className="ed__set">
                  <legend>Work experience</legend>
                  {d.experience.map((x, i) => (
                    <div key={i} className="ed__row">
                      <div className="ed__row-head">
                        <span>Role {String(i + 1).padStart(2, '0')}</span>
                        {d.experience.length > 1 && <button type="button" className="ed__remove" onClick={() => removeRow('experience', i)}>Remove</button>}
                      </div>
                      <div className="ed__pair">
                        <input className="field__input" value={x.role} onChange={setRow('experience', i, 'role')} placeholder="Role" aria-label={`Role ${i + 1} title`} />
                        <input className="field__input" value={x.company} onChange={setRow('experience', i, 'company')} placeholder="Company" aria-label={`Role ${i + 1} company`} />
                      </div>
                      <div className="ed__pair">
                        <input className="field__input" value={x.from} onChange={setRow('experience', i, 'from')} placeholder="From (e.g. 2024)" aria-label={`Role ${i + 1} start`} />
                        <input className="field__input" value={x.to} onChange={setRow('experience', i, 'to')} placeholder="To (e.g. Present)" aria-label={`Role ${i + 1} end`} />
                      </div>
                    </div>
                  ))}
                  {d.experience.length < 8 && <button type="button" className="ed__add" onClick={() => addRow('experience', blankSiteRole)}>+ Add role</button>}
                </fieldset>
              </>
            )}

            {sid === 'story' && (
              <>
                <div>
                  <p className="section-label"><AppSparkles15 /><span>A little help finding the words</span></p>
                  <h2 className="ed__h2">Three questions bring your contribution into focus.</h2>
                </div>
                {QUESTIONS.map(([k, , q, eg]) => (
                  <label key={k} className="field">
                    <span className="field__label">{q}</span>
                    <textarea className="field__input field__input--q" {...bind(k)} placeholder={eg} />
                  </label>
                ))}
                <div className="ed__note">
                  <AppSparkles18 />
                  <p>AI rewriting isn’t connected in this build. The preview arranges your own words, so your experience remains the source of truth.</p>
                </div>
              </>
            )}

            {sid === 'format' && (
              <>
                <div>
                  <p className="section-label"><AppFileCheck /><span>A story worth sharing</span></p>
                  <h2 className="ed__h2">Your work has character. Your presentation should, too.</h2>
                </div>
                <fieldset className="ed__set">
                  <legend>Format</legend>
                  <div className="pills">
                    {Object.entries(FORMATS).map(([k, f]) => (
                      <button key={k} type="button" className={`pill-btn ${d.type === k ? 'is-active' : ''}`} aria-pressed={d.type === k} onClick={() => setType(k)}>{f.label}</button>
                    ))}
                  </div>
                </fieldset>
                <fieldset className="ed__set">
                  <legend>Template</legend>
                  <div className="tpls">
                    {pickable.map(([k, t]) => (
                      <button key={k} type="button" className={`tpl-card ${tpl === k ? 'is-active' : ''}`} aria-pressed={tpl === k} onClick={() => update({ template: k })}>
                        <span className="tpl-card__swatch" style={{ background: t.swatch }} />
                        <span className="tpl-card__name">{t.name}</span>
                        <span className="tpl-card__desc">{t.desc}</span>
                      </button>
                    ))}
                  </div>
                  {d.type === 'portfolio' && <Link to="/portfolio" className="ed__browse">Browse the full template collection →</Link>}
                  {d.type === 'cv' && <Link to="/cv" className="ed__browse">Browse all CV templates →</Link>}
                  {d.type === 'case' && <Link to="/case" className="ed__browse">Browse all case study templates →</Link>}
                </fieldset>
              </>
            )}

            {sid === 'custom' && (
              <Customize project={d} template={tpl} onPatch={update} kind={isCv ? 'cv' : isCase ? 'case' : 'site'} />
            )}

            {(isCase || isSite) && d.interview?.drafted && !d.interview.reviewed && (
              <div className="ed__drafted" role="status">
                <p><b>Drafted from your interview.</b> Read it through and fix anything that doesn’t sound like you. {d.interview.source === 'local' ? 'Your answers were placed into the right sections as you said them.' : 'Only what you said was used; nothing was invented.'}</p>
                <div>
                  <button type="button" className="app-btn app-btn--primary" onClick={() => update({ interview: { ...d.interview, reviewed: true } })}>Looks right</button>
                  <Link to={`/interview/${d.id}`} className="app-btn app-btn--ghost">Keep talking</Link>
                  {d.draftBackup && <button type="button" className="ed__browse" onClick={() => update({ ...Object.fromEntries(draftKeysFor(d.type).map((k) => [k, d.draftBackup[k] ?? ''])), draftBackup: null, interview: { ...d.interview, drafted: false } })}>Undo draft</button>}
                </div>
              </div>
            )}

            {sid === 'cs-overview' && (
              <>
                <div>
                  <p className="section-label"><AppStickyNote /><span>Overview</span></p>
                  <h2 className="ed__h2">Start with the headline facts.</h2>
                </div>
                <p className="ed__lead">Fields marked <Rec /> are what reviewers look for first. Rough answers are fine; you can polish later.</p>
                {!d.interview?.drafted && (
                  <Link to={`/interview/${d.id}`} className="ed__interview">
                    <span><b>Rather talk it through?</b> A ten-minute interview fills this in, in your own words.</span>
                    <span aria-hidden>Start the interview →</span>
                  </Link>
                )}
                <label className="field">
                  <span className="field__label">Project title <Rec /></span>
                  <input className="field__input" {...bind('title')} placeholder="Booking a hospital appointment in under a minute" />
                  <small className="field__hint">Lead with the outcome, not the project name.</small>
                </label>
                <label className="field">
                  <span className="field__label">One-line summary <Rec /></span>
                  <input className="field__input" {...bind('tagline')} placeholder="Redesigning outpatient booking for 1.2 million patients a year." />
                </label>
                <div className="ed__pair">
                  <label className="field"><span className="field__label">Your role <Rec /></span><input className="field__input" {...bind('role')} placeholder="Lead product designer" /></label>
                  <label className="field"><span className="field__label">Client or company <Opt /></span><input className="field__input" {...bind('client')} placeholder="Northwind Health" /></label>
                </div>
                <div className="ed__pair ed__pair--3">
                  <label className="field"><span className="field__label">Timeline <Opt /></span><input className="field__input" {...bind('timeline')} placeholder="14 weeks · 2025" /></label>
                  <label className="field"><span className="field__label">Team <Opt /></span><input className="field__input" {...bind('team')} placeholder="1 designer, 4 engineers" /></label>
                  <label className="field"><span className="field__label">Industry <Opt /></span><input className="field__input" {...bind('industry')} placeholder="Healthcare" /></label>
                </div>
                <label className="field">
                  <span className="field__label">Tools & skills <Rec /></span>
                  <input className="field__input" {...bind('skills')} placeholder="User research, Figma, Prototyping" />
                  <small className="field__hint">Separate with commas.</small>
                </label>
              </>
            )}

            {sid === 'cs-problem' && (
              <>
                <div>
                  <p className="section-label"><AppSparkles15 /><span>Problem & goals</span></p>
                  <h2 className="ed__h2">What needed solving, and why it mattered.</h2>
                </div>
                <label className="field">
                  <span className="field__label">Background <Rec /></span>
                  <textarea className="field__input field__input--q" {...bind('notes')} placeholder="Patients booked by phone or through a 12-step form built in 2014. Call centres were overwhelmed." />
                  <small className="field__hint">Set the scene in two or three sentences: who, where, and what was going on.</small>
                </label>
                <label className="field">
                  <span className="field__label">The problem <Rec /></span>
                  <textarea className="field__input field__input--q" {...bind('problem')} placeholder="Seven in ten patients gave up before confirming their appointment." />
                  <small className="field__hint">Be specific. A number makes the problem real.</small>
                </label>
                <label className="field">
                  <span className="field__label">Goals <Rec /></span>
                  <textarea className="field__input" rows={3} {...bind('goals')} placeholder={'Cut the time to book by half\nRaise online completion above 60%'} />
                  <small className="field__hint">One goal per line. What would success look like?</small>
                </label>
                <div className="ed__pair">
                  <label className="field"><span className="field__label">Audience or users <Opt /></span><textarea className="field__input" rows={2} {...bind('audience')} placeholder="Outpatients aged 18–90" /></label>
                  <label className="field"><span className="field__label">Constraints <Opt /></span><textarea className="field__input" rows={2} {...bind('constraints')} placeholder="Had to use the existing scheduling system" /></label>
                </div>
              </>
            )}

            {sid === 'cs-process' && (
              <>
                <div>
                  <p className="section-label"><AppSparkles15 /><span>Process</span></p>
                  <h2 className="ed__h2">How you got from problem to solution.</h2>
                </div>
                <label className="field">
                  <span className="field__label">Research & discovery <Opt /></span>
                  <textarea className="field__input" rows={3} {...bind('research')} placeholder="Interviewed 18 patients, ran a diary study and audited 3,000 abandoned sessions." />
                </label>
                <fieldset className="ed__set">
                  <legend>Process steps <Rec /></legend>
                  {d.process.map((s, i) => (
                    <div key={i} className="ed__row">
                      <div className="ed__row-head">
                        <span>Step {String(i + 1).padStart(2, '0')}</span>
                        {d.process.length > 1 && <button type="button" className="ed__remove" onClick={() => removeRow('process', i)}>Remove</button>}
                      </div>
                      <input className="field__input" value={s.title || ''} onChange={setRow('process', i, 'title')} placeholder={['Discover', 'Define', 'Prototype', 'Ship'][i] || 'Step name'} aria-label={`Step ${i + 1} name`} />
                      <textarea className="field__input" rows={2} value={s.desc || ''} onChange={setRow('process', i, 'desc')} placeholder="What you did, and a key decision you made." aria-label={`Step ${i + 1} description`} />
                    </div>
                  ))}
                  {d.process.length < 8 && <button type="button" className="ed__add" onClick={() => addRow('process', blankStep)}>+ Add step</button>}
                  <small className="field__hint">Three to five steps reads best. Mention trade-offs and why you chose your direction.</small>
                </fieldset>
                <label className="field">
                  <span className="field__label">What you cut, and why <Rec /></span>
                  <textarea className="field__input field__input--q" {...bind('tradeoffs')} placeholder="I cut rescheduling from the first release. It would have doubled the timeline, and people were dropping out at booking, not rescheduling." />
                  <small className="field__hint">The options you ruled out show your judgement better than anything you shipped.</small>
                </label>
                <label className="field">
                  <span className="field__label">Your contribution <Rec /></span>
                  <textarea className="field__input field__input--q" {...bind('contribution')} placeholder="I led research and design end to end and ran every usability session." />
                  <small className="field__hint">Say “I”, not “we”, for the parts you owned.</small>
                </label>
              </>
            )}

            {sid === 'cs-results' && (
              <>
                <div>
                  <p className="section-label"><AppFileCheck /><span>Results</span></p>
                  <h2 className="ed__h2">What changed because of your work.</h2>
                </div>
                <label className="field">
                  <span className="field__label">The solution <Rec /></span>
                  <textarea className="field__input field__input--q" {...bind('solution')} placeholder="A three-step flow that suggests the earliest slots first and works fully by keyboard." />
                </label>
                <fieldset className="ed__set">
                  <legend>Results in numbers <Rec /></legend>
                  {d.metrics.map((m, i) => (
                    <div key={i} className="ed__metric">
                      <input className="field__input" value={m.value || ''} onChange={setRow('metrics', i, 'value')} placeholder={['54s', '71%', '−38%'][i] || 'Value'} aria-label={`Result ${i + 1} value`} />
                      <input className="field__input" value={m.label || ''} onChange={setRow('metrics', i, 'label')} placeholder={['median time to book', 'online completion', 'calls to the booking line'][i] || 'What it measures'} aria-label={`Result ${i + 1} label`} />
                      {d.metrics.length > 1 && <button type="button" className="ed__remove" onClick={() => removeRow('metrics', i)} aria-label={`Remove result ${i + 1}`}>Remove</button>}
                    </div>
                  ))}
                  {d.metrics.length < 6 && <button type="button" className="ed__add" onClick={() => addRow('metrics', blankMetric)}>+ Add result</button>}
                  <small className="field__hint">No hard numbers? Use what you have: users tested, time saved, feedback received.</small>
                </fieldset>
                <div className="ed__pair">
                  <label className="field"><span className="field__label">Testimonial <Opt /></span><textarea className="field__input" rows={2} {...bind('quote')} placeholder="Patients tell us it’s the easiest thing they’ve done online." /></label>
                  <label className="field"><span className="field__label">Quote from <Opt /></span><input className="field__input" {...bind('quoteBy')} placeholder="Head of Outpatients" /></label>
                </div>
                <label className="field">
                  <span className="field__label">What you learned <Rec /></span>
                  <textarea className="field__input field__input--q" {...bind('learned')} placeholder="Accessibility work done early made the product better for everyone." />
                </label>
                <label className="field">
                  <span className="field__label">Next steps <Opt /></span>
                  <input className="field__input" {...bind('next')} placeholder="Bring the same patterns to test results." />
                </label>
              </>
            )}

            {sid === 'cs-materials' && (
              <>
                <div>
                  <p className="section-label"><AppSparkles15 /><span>Materials</span></p>
                  <h2 className="ed__h2">Show the work: screens, sketches, photos and links.</h2>
                </div>
                <div className="field">
                  <span className="field__label">Cover image or video <Rec /></span>
                  <MediaField
                    value={d.cover?.src ? [d.cover] : []}
                    max={1}
                    mode="single"
                    label="case study cover"
                    hint="Your strongest final screen, photo or a short clip. Wide works best."
                    onChange={(items) => setField('cover', items[0] || null)}
                  />
                </div>

                <fieldset className="ed__set">
                  <legend>Supporting visuals <Opt /> <span className="up__count">{d.gallery.length}/{MAX_GALLERY}</span></legend>
                  <MediaField
                    value={d.gallery}
                    max={MAX_GALLERY}
                    mode="order"
                    label="case study"
                    hint="Sketches, wireframes, before/after shots, charts or screen recordings. Caption each one."
                    onChange={(items) => setField('gallery', items)}
                  />
                </fieldset>

                <fieldset className="ed__set">
                  <legend>Files & attachments <Opt /> <span className="up__count">{(d.files || []).length}/8</span></legend>
                  <FileField value={d.files || []} max={8} onChange={(files) => setField('files', files)} />
                  <small className="field__hint">Research reports, pitch decks, specs or data, so reviewers can dig deeper. Visitors can open or download them from your published page.</small>
                </fieldset>

                <label className="field">
                  <span className="field__label">Live link or prototype <Opt /></span>
                  <input className="field__input" type="url" {...bind('link')} placeholder="https://figma.com/proto/… or https://github.com/…" />
                </label>
              </>
            )}

            {sid === 'cv-basics' && (
              <>
                <div>
                  <p className="section-label"><AppStickyNote /><span>Your details</span></p>
                  <h2 className="ed__h2">The essentials, right at the top of the page.</h2>
                </div>
                <div className="ed__pair">
                  <label className="field"><span className="field__label">Full name</span><input className="field__input" {...bind('name')} placeholder="Alex Morgan" autoComplete="name" /></label>
                  <label className="field"><span className="field__label">Headline</span><input className="field__input" {...bind('role')} placeholder="Software engineer" /></label>
                </div>
                <div className="ed__pair">
                  <label className="field"><span className="field__label">Email</span><input className="field__input" type="email" {...bind('email')} placeholder="alex.morgan@email.com" autoComplete="email" /></label>
                  <label className="field"><span className="field__label">Phone <em className="field__opt">optional</em></span><input className="field__input" type="tel" {...bind('phone')} placeholder="+44 7700 900123" autoComplete="tel" /></label>
                </div>
                <div className="ed__pair">
                  <label className="field"><span className="field__label">Location <em className="field__opt">optional</em></span><input className="field__input" {...bind('location')} placeholder="London, UK" /></label>
                  <label className="field"><span className="field__label">Website or LinkedIn <em className="field__opt">optional</em></span><input className="field__input" {...bind('website')} placeholder="linkedin.com/in/alexmorgan" /></label>
                </div>
                <label className="field">
                  <span className="field__label">Professional summary</span>
                  <textarea className="field__input field__input--notes" {...bind('notes')} placeholder="Software engineer with three years’ experience building accessible web products. I care about clear code and helping teams ship with confidence." />
                  <small className="field__hint">Two to four sentences: who you are, what you’re great at, and what you want next.</small>
                </label>
              </>
            )}

            {sid === 'cv-exp' && (
              <>
                <div>
                  <p className="section-label"><AppSparkles15 /><span>Experience</span></p>
                  <h2 className="ed__h2">Where you’ve worked, and what changed because you were there.</h2>
                </div>
                <fieldset className="ed__set">
                  <legend>Work experience</legend>
                  {d.experience.map((x, i) => (
                    <div key={i} className="ed__row">
                      <div className="ed__row-head">
                        <span>Role {String(i + 1).padStart(2, '0')}</span>
                        {d.experience.length > 1 && <button type="button" className="ed__remove" onClick={() => removeRow('experience', i)}>Remove</button>}
                      </div>
                      <div className="ed__pair">
                        <input className="field__input" value={x.role || ''} onChange={setRow('experience', i, 'role')} placeholder="Job title" aria-label={`Role ${i + 1} title`} />
                        <input className="field__input" value={x.company || ''} onChange={setRow('experience', i, 'company')} placeholder="Employer" aria-label={`Role ${i + 1} employer`} />
                      </div>
                      <div className="ed__pair ed__pair--3">
                        <input className="field__input" value={x.from || ''} onChange={setRow('experience', i, 'from')} placeholder="From (e.g. 2022)" aria-label={`Role ${i + 1} start`} />
                        <input className="field__input" value={x.to || ''} onChange={setRow('experience', i, 'to')} placeholder="To (e.g. Present)" aria-label={`Role ${i + 1} end`} />
                        <input className="field__input" value={x.loc || ''} onChange={setRow('experience', i, 'loc')} placeholder="City (optional)" aria-label={`Role ${i + 1} location`} />
                      </div>
                      <textarea className="field__input" rows={3} value={x.desc || ''} onChange={setRow('experience', i, 'desc')} placeholder={'Led the rebuild of the events platform, cutting load time by 48%.\nDesigned an API used by 40,000 students.'} aria-label={`Role ${i + 1} achievements`} />
                    </div>
                  ))}
                  {d.experience.length < 10 && <button type="button" className="ed__add" onClick={() => addRow('experience', blankCvRole)}>+ Add role</button>}
                  <small className="field__hint">One achievement per line. Start with a verb and add a number where you can.</small>
                </fieldset>
                <fieldset className="ed__set">
                  <legend>Projects <em className="field__opt">optional</em></legend>
                  {d.projects.map((p, i) => (
                    <div key={i} className="ed__row">
                      <div className="ed__row-head">
                        <span>Project {String(i + 1).padStart(2, '0')}</span>
                        {d.projects.length > 1 && <button type="button" className="ed__remove" onClick={() => removeRow('projects', i)}>Remove</button>}
                      </div>
                      <div className="ed__pair">
                        <input className="field__input" value={p.title || ''} onChange={setRow('projects', i, 'title')} placeholder="Project name" aria-label={`Project ${i + 1} name`} />
                        <input className="field__input" value={p.link || ''} onChange={setRow('projects', i, 'link')} placeholder="Link (optional)" aria-label={`Project ${i + 1} link`} />
                      </div>
                      <input className="field__input" value={p.desc || ''} onChange={setRow('projects', i, 'desc')} placeholder="One line on what it is and the result." aria-label={`Project ${i + 1} description`} />
                    </div>
                  ))}
                  {d.projects.length < 6 && <button type="button" className="ed__add" onClick={() => addRow('projects', blankSiteProject)}>+ Add project</button>}
                </fieldset>
              </>
            )}

            {sid === 'cv-edu' && (
              <>
                <div>
                  <p className="section-label"><AppFileCheck /><span>Education & skills</span></p>
                  <h2 className="ed__h2">What you studied, and what you’re good at.</h2>
                </div>
                <fieldset className="ed__set">
                  <legend>Education</legend>
                  {d.education.map((x, i) => (
                    <div key={i} className="ed__row">
                      <div className="ed__row-head">
                        <span>Education {String(i + 1).padStart(2, '0')}</span>
                        {d.education.length > 1 && <button type="button" className="ed__remove" onClick={() => removeRow('education', i)}>Remove</button>}
                      </div>
                      <div className="ed__pair">
                        <input className="field__input" value={x.degree || ''} onChange={setRow('education', i, 'degree')} placeholder="Qualification (e.g. BSc Computer Science)" aria-label={`Education ${i + 1} qualification`} />
                        <input className="field__input" value={x.school || ''} onChange={setRow('education', i, 'school')} placeholder="School or university" aria-label={`Education ${i + 1} school`} />
                      </div>
                      <div className="ed__pair">
                        <input className="field__input" value={x.from || ''} onChange={setRow('education', i, 'from')} placeholder="From" aria-label={`Education ${i + 1} start`} />
                        <input className="field__input" value={x.to || ''} onChange={setRow('education', i, 'to')} placeholder="To" aria-label={`Education ${i + 1} end`} />
                      </div>
                      <input className="field__input" value={x.desc || ''} onChange={setRow('education', i, 'desc')} placeholder="Grade, modules or dissertation (optional)" aria-label={`Education ${i + 1} details`} />
                    </div>
                  ))}
                  {d.education.length < 6 && <button type="button" className="ed__add" onClick={() => addRow('education', blankCvEdu)}>+ Add education</button>}
                </fieldset>
                <label className="field">
                  <span className="field__label">Skills</span>
                  <input className="field__input" {...bind('skills')} placeholder="React, TypeScript, Stakeholder management" />
                  <small className="field__hint">Separate with commas. Use the words from the job ad; applicant tracking systems look for them.</small>
                </label>
                <div className="ed__pair">
                  <label className="field">
                    <span className="field__label">Languages <em className="field__opt">optional</em></span>
                    <input className="field__input" {...bind('languages')} placeholder="English (native), Spanish (conversational)" />
                  </label>
                  <label className="field">
                    <span className="field__label">Certifications &amp; awards <em className="field__opt">optional</em></span>
                    <input className="field__input" {...bind('certs')} placeholder="AWS Certified Developer, Dean’s List" />
                  </label>
                </div>
              </>
            )}

            <div className="ed__nav">
              {cur > 0 ? <button className="app-btn app-btn--ghost app-btn--tall" onClick={() => go(cur - 1)}>Back</button> : <span />}
              {cur < steps.length - 1
                ? <button className="app-btn app-btn--primary" onClick={() => go(cur + 1)}><span>{steps[cur + 1].name}</span><AppArrow /></button>
                : <button className="app-btn app-btn--primary" onClick={finish}><span>Save and finish</span><AppArrow /></button>}
            </div>
          </div>
        </section>

        <aside className="ed__preview">
          <div className="ed__preview-head">
            <p>Live preview</p>
            <p className="ed__preview-meta">
              {TEMPLATES[tpl].name}
              {customAt >= 0 && <button className={`ed__expand ${sid === 'custom' ? 'is-on' : ''}`} onClick={() => go(customAt)} title={isCv ? 'Fonts, colour and text size' : 'Fonts, colour and motion'}>Customize</button>}
              {(isSite || isCv || isCase) && <button className="ed__expand" onClick={() => setExpanded(true)} title="Open full screen preview">Expand ⤢</button>}
            </p>
          </div>
          {isCase ? (
            <CasePreview template={tpl} data={projectToCase(d)} />
          ) : isCv ? (
            <ScaledDoc template={tpl} data={projectToCv(d)} className="ed__cv" />
          ) : isSite ? (
            <LiveSite template={tpl} data={projectToSite(d)} />
          ) : (
          <article className={`story story--${tpl}`}>
            <p className="story__k">{FORMATS[d.type].label}{d.role ? ` · ${d.role}` : ''}</p>
            <h2 className="story__title">{d.title || 'Untitled story'}</h2>
            <p className="story__lead">{d.notes || <span className="story__empty">Your notes will appear here.</span>}</p>
            {QUESTIONS.map(([k, label, q]) => (
              <div key={k} className="story__sec">
                <h3>{label}</h3>
                {d[k] ? <p>{d[k]}</p> : <p className="story__empty">{q}</p>}
              </div>
            ))}
            {skills.length > 0 && <ul className="story__tags">{skills.map((s) => <li key={s}>{s}</li>)}</ul>}
          </article>
          )}
        </aside>
      </div>

      {expanded && isSite && (
        <TemplateViewer
          template={tpl}
          data={projectToSite(d)}
          title={d.title || 'Live preview'}
          subtitle={`${TEMPLATES[tpl].name} template · your content`}
          onClose={() => setExpanded(false)}
        />
      )}
      {expanded && isCase && (
        <TemplateViewer
          template={tpl}
          info={CASE_TEMPLATES[tpl]}
          title={d.title || 'Your case study'}
          subtitle={`${TEMPLATES[tpl].name} template · your content`}
          render={() => <CasePreview template={tpl} data={{ ...projectToCase(d), ghost: false }} />}
          onClose={() => setExpanded(false)}
        />
      )}
      {expanded && isCv && (
        <CvViewer
          template={tpl}
          data={{ ...projectToCv(d), ghost: false }}
          title={d.title || d.name || 'Your CV'}
          subtitle={`${TEMPLATES[tpl].name} template · your content`}
          onClose={() => setExpanded(false)}
          actions={<button className="app-btn app-btn--primary" onClick={exportPdf}>Export PDF</button>}
        />
      )}
      {isCv && <div className="cvprint" aria-hidden><CvDoc template={tpl} data={{ ...projectToCv(d), ghost: false }} /></div>}
      {publishing && (
        <PublishDialog
          project={d}
          onClose={() => setPublishing(false)}
          onStatus={(status) => setD((prev) => ({ ...prev, status }))}
        />
      )}
      {confirming && <ConfirmDelete project={d} onCancel={() => setConfirming(false)} onConfirm={remove} />}
    </div>
  );
}
