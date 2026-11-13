import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { pushProject, removeProject } from '../api.js';
import { Link } from 'react-router-dom';
import { img } from '../assets.js';

/* ---------- Brand ---------- */

export function Logo({ to = '/' }) {
  return (
    <Link to={to} className="logo" aria-label="Dixlab home">
      <img src={img.wordmarkLightLg} width="85.431" height="26" alt="Dixlab" />
    </Link>
  );
}

/* ---------- Icons ---------- */

/**
 * An exported icon at its design size. Rendered as a mask so it takes the
 * surrounding text colour (currentColor) and stays legible on any surface.
 */
export function Icon({ src, size, className = '' }) {
  const mask = `url("${src}")`;
  return (
    <span
      className={`icon ${className}`}
      style={{ width: size, height: size, WebkitMaskImage: mask, maskImage: mask }}
      aria-hidden
    />
  );
}

/* ---------- Ambient interaction: cursor spotlight + scroll reveal ---------- */

const SPOT = '.flow__card, .cap__show, .use, .tpl__canvas, .starter, .voice__demo, .work__thumb, .focus';
const REVEAL = '.sec__intro, .sec__aside, .flow, .steps, .caps, .uses, .gallery, .voice__demo, .benefits, .belief__copy, .lens, .faq__list, .invite__copy, .invite__go';

export function useAmbient() {
  useEffect(() => {
    const move = (e) => {
      const el = e.target.closest?.(SPOT);
      if (!el) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty('--mx', `${e.clientX - r.left}px`);
      el.style.setProperty('--my', `${e.clientY - r.top}px`);
    };
    document.addEventListener('pointermove', move, { passive: true });

    let io;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (!reduce && 'IntersectionObserver' in window) {
      const root = document.documentElement;
      root.classList.add('has-reveal');
      io = new IntersectionObserver((entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); }
        });
      }, { rootMargin: '0px 0px -6% 0px' });
      document.querySelectorAll(REVEAL).forEach((el) => { el.classList.add('rv'); io.observe(el); });
    }
    return () => {
      document.removeEventListener('pointermove', move);
      io?.disconnect();
      document.documentElement.classList.remove('has-reveal');
    };
  }, []);
}

/**
 * Icons exported from the app screens are a glyph placed inside a fixed box
 * (inset), bleeding past the glyph bounds for the stroke, optionally masked.
 */
export function InsetIcon({ src, size, inset, bleed, mask, maskOffset }) {
  return (
    <span className="inset-icon" style={{ width: size, height: size }} aria-hidden>
      <span
        className="inset-icon__frame"
        style={{
          inset,
          ...(mask && {
            WebkitMaskImage: `url("${mask}")`,
            maskImage: `url("${mask}")`,
            WebkitMaskSize: `${size}px ${size}px`,
            maskSize: `${size}px ${size}px`,
            WebkitMaskPosition: maskOffset,
            maskPosition: maskOffset,
            WebkitMaskRepeat: 'no-repeat',
            maskRepeat: 'no-repeat',
          }),
        }}
      >
        <span className="inset-icon__bleed" style={{ inset: bleed }}>
          <img src={src} alt="" />
        </span>
      </span>
    </span>
  );
}

export const AppArrow = () => <InsetIcon src={img.arrowUpRightWhiteSm} size={18} inset="29.17%" bleed="-11.34%" />;
export const AppArrowAccent = () => <InsetIcon src={img.arrowUpRightAccentSm} size={20} inset="29.17%" bleed="-10.2%" />;
export const AppSparkles13 = () => (
  <InsetIcon src={img.sparklesGlyph13} mask={img.sparklesMask13} maskOffset="-1.082px -1.083px" size={13} inset="8.33% 8.32% 8.32% 8.32%" bleed="-7.84%" />
);
export const AppSparkles15 = () => (
  <InsetIcon src={img.sparklesGlyph15} mask={img.sparklesMask15} maskOffset="-1.248px -1.25px" size={15} inset="8.33% 8.32% 8.32% 8.32%" bleed="-6.8%" />
);
export const AppSparkles18 = () => (
  <InsetIcon src={img.sparklesGlyph18} mask={img.sparklesMask18} maskOffset="-1.498px -1.499px" size={18} inset="8.33% 8.32% 8.32% 8.32%" bleed="-5.67% -5.66%" />
);
export const AppStickyNote = () => <InsetIcon src={img.stickyNoteGlyph} size={15} inset="12.5%" bleed="-7.56%" />;
export const AppFileCheck = () => <InsetIcon src={img.fileCheckGlyph} size={15} inset="8.33% 16.67%" bleed="-6.8% -8.5% -9.62% -8.5%" />;

/* ---------- Text pieces ---------- */

export function SectionLabel({ children, light, marker }) {
  const src = marker || (light ? img.markerLight : img.marker);
  return (
    <p className={`section-label ${light ? 'section-label--light' : ''}`}>
      <Icon src={src} size={6} />
      <span>{children}</span>
    </p>
  );
}

/* ---------- Asset previews (portfolio, CV) ---------- */

/**
 * Mini portfolio website. Designed at 520px wide; `width` scales every
 * measurement proportionally, matching the smaller copies in the design.
 */
export function PortfolioPreview({ width = 520, theme = 'light', photo = img.photoChair }) {
  const s = width / 520;
  const dark = theme === 'dark';
  const dot = dark ? img.browserDotDark : s < 1 ? img.browserDotSm : img.browserDot;
  const arrow = dark ? img.arrowUpRightDarkXs : s < 1 ? img.arrowUpRightInkXs : img.arrowUpRightInk10;
  return (
    <div className={`pf ${dark ? 'pf--dark' : ''}`} style={{ '--s': s, width }}>
      <div className="pf__bar">
        <img src={dot} alt="" /><img src={dot} alt="" /><img src={dot} alt="" />
        <p>maya-chen.portfolio</p>
        <img className="pf__arrow" src={arrow} alt="" />
      </div>
      <div className="pf__body">
        <div className="pf__nav">
          <p className="pf__brand">MAYA CHEN®</p>
          <p className="pf__links">Work&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; About&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; Contact ↗</p>
        </div>
        <div className="pf__intro">
          <p className="pf__title">Thoughtful design.<br />Everyday impact.</p>
          <p className="pf__meta">Product designer<br />Digital &amp; physical<br />Based in London</p>
        </div>
        <img className="pf__photo" src={photo} alt="" />
        <div className="pf__foot">
          <div>
            <p className="pf__work">Form &amp; function</p>
            <p className="pf__tags">Brand strategy · Art direction · Digital design</p>
          </div>
          <p className="pf__year">2026 ↗</p>
        </div>
      </div>
    </div>
  );
}

const CV_SECTIONS = [
  ['PROFILE', 'Curious by nature. Practical by design.', ['Computer science graduate turning complex problems into thoughtful, accessible software.']],
  ['SELECTED EXPERIENCE', 'Student developer · Campus Collective', ['Built an events platform with React and Node.js, working with a team of four to simplify event discovery.']],
  ['EDUCATION', 'BSc Computer Science', ['University of Bristol · 2023–2026', 'Final project: accessible route planning']],
  ['SKILLS', 'React · TypeScript · Node.js · Git', ['Problem solving · Collaboration · User research']],
];

/** Mini CV page. Designed at 230px wide; `width` scales it. */
export function CVPreview({ width = 230 }) {
  return (
    <div className="cv" style={{ '--s': width / 230, width }}>
      <div className="cv__head">
        <p className="cv__name">Alex Morgan</p>
        <p className="cv__role">Graduate software developer</p>
        <p className="cv__contact">Bristol, UK&nbsp;&nbsp;·&nbsp;&nbsp;alex.morgan@email.com</p>
      </div>
      {CV_SECTIONS.map(([label, title, lines]) => (
        <div key={label} className="cv__section">
          <p className="cv__label">{label}</p>
          <p className="cv__title">{title}</p>
          <p className="cv__text">{lines.map((l, i) => <span key={i}>{l}{i < lines.length - 1 && <br />}</span>)}</p>
        </div>
      ))}
    </div>
  );
}

/* ---------- Local data (saved in this browser) ---------- */

const PROJECTS_KEY = 'dixlab.projects.v2';
const USER_KEY = 'dixlab.user';

export const FORMATS = {
  portfolio: { label: 'Portfolio', plural: 'Portfolios' },
  cv: { label: 'CV', plural: 'CVs' },
  case: { label: 'Case study', plural: 'Case studies' },
};

export const TEMPLATES = {
  studio: { name: 'Studio', desc: 'Bold & considered', thumb: '#dde1d5', swatch: '#292c28' },
  outline: { name: 'Outline', desc: 'Focused & professional', thumb: '#e2dff1', swatch: '#ffffff' },
  narrative: { name: 'Narrative', desc: 'Editorial & expressive', thumb: '#e9ddd0', swatch: '#fbf9f4' },
  // Portfolio site templates (rendered by components/sites)
  folio: { site: true, name: 'Folio', desc: 'Personal & minimal', swatch: 'linear-gradient(135deg, #ffffff 55%, #f0662e 55%)' },
  bento: { site: true, name: 'Bento', desc: 'Everything at a glance', swatch: 'linear-gradient(135deg, #f3f1ec 50%, #ff6b3d 50%, #ff6b3d 75%, #c7f36b 75%)' },
  terminal: { site: true, name: 'Terminal', desc: 'For people who ship code', swatch: 'linear-gradient(135deg, #0b0f0c 60%, #7ee787 60%)' },
  journal: { site: true, name: 'Journal', desc: 'Editorial & considered', swatch: 'linear-gradient(135deg, #f4efe6 60%, #c2410c 60%)' },
  grid: { site: true, name: 'Grid', desc: 'Swiss & precise', swatch: 'linear-gradient(135deg, #fafaf8 60%, #e3261b 60%)' },
  exhibit: { site: true, name: 'Exhibit', desc: 'Let the work lead', swatch: 'linear-gradient(135deg, #eeebe5 50%, #1b1b1d 50%)' },
  punch: { site: true, name: 'Punch', desc: 'Bold & playful', swatch: 'linear-gradient(135deg, #d9ff3f 50%, #7b5cff 50%)' },
  casebook: { site: true, name: 'Casebook', desc: 'Case studies first', swatch: 'linear-gradient(135deg, #f7f7fb 55%, #6366f1 55%)' },
  sentinel: { site: true, name: 'Sentinel', desc: 'For security professionals', swatch: 'linear-gradient(135deg, #060b14 60%, #22d3ee 60%)' },
  reel: { site: true, name: 'Reel', desc: 'Showreel first', swatch: 'linear-gradient(135deg, #0a0a0a 60%, #ff3d2e 60%)' },
  // CV templates (rendered by components/cv)
  classic: { cv: true, name: 'Classic', desc: 'Timeless & traditional', swatch: 'linear-gradient(135deg, #ffffff 60%, #7a1f2b 60%)' },
  meridian: { cv: true, name: 'Meridian', desc: 'Modern two-column', swatch: 'linear-gradient(90deg, #dfeeec 35%, #ffffff 35%)' },
  executive: { cv: true, name: 'Executive', desc: 'Senior & assured', swatch: 'linear-gradient(180deg, #101b30 40%, #ffffff 40%, #ffffff 88%, #b8912f 88%)' },
  margin: { cv: true, name: 'Margin', desc: 'Minimal & airy', swatch: 'linear-gradient(135deg, #ffffff 70%, #c2410c 70%)' },
  timeline: { cv: true, name: 'Timeline', desc: 'Your career at a glance', swatch: 'linear-gradient(90deg, #ffffff 40%, #0e7490 40%, #0e7490 46%, #ffffff 46%)' },
  plain: { cv: true, name: 'Plain', desc: 'ATS-safe & simple', swatch: 'linear-gradient(180deg, #ffffff 30%, #111111 30%, #111111 33%, #ffffff 33%)' },
  canvas: { cv: true, name: 'Canvas', desc: 'Bold & creative', swatch: 'linear-gradient(180deg, #ff5a36 45%, #ffffff 45%)' },
  stack: { cv: true, name: 'Stack', desc: 'For technical roles', swatch: 'linear-gradient(135deg, #f6f6f7 60%, #059669 60%)' },
  graduate: { cv: true, name: 'Graduate', desc: 'Education first', swatch: 'linear-gradient(90deg, #7c3aed 12%, #ffffff 12%)' },
  atelier: { cv: true, name: 'Atelier', desc: 'Refined & elegant', swatch: 'linear-gradient(135deg, #faf6ef 60%, #9a6b3f 60%)' },
  // Case study templates (rendered by components/case)
  chronicle: { cs: true, name: 'Chronicle', desc: 'Editorial long-read', swatch: 'linear-gradient(135deg, #f7f3ec 60%, #b4461b 60%)' },
  snapshot: { cs: true, name: 'Snapshot', desc: 'Scannable one-pager', swatch: 'linear-gradient(135deg, #ffffff 55%, #2563eb 55%)' },
  blueprint: { cs: true, name: 'Blueprint', desc: 'Process-led & technical', swatch: 'linear-gradient(135deg, #f4f7fd 60%, #1d4ed8 60%)' },
  spotlight: { cs: true, name: 'Spotlight', desc: 'Dark & cinematic', swatch: 'linear-gradient(135deg, #0c0c0e 60%, #f59e0b 60%)' },
  framework: { cs: true, name: 'Framework', desc: 'Situation → result', swatch: 'linear-gradient(90deg, #f1f5f4 33%, #cfe6e3 33%, #cfe6e3 66%, #0f766e 66%)' },
  lab: { cs: true, name: 'Lab', desc: 'Research report', swatch: 'linear-gradient(135deg, #fcfcfa 60%, #7c3aed 60%)' },
  showcase: { cs: true, name: 'Showcase', desc: 'Visuals first', swatch: 'linear-gradient(135deg, #1e1b4b 50%, #a5b4fc 50%)' },
  impact: { cs: true, name: 'Impact', desc: 'Numbers first', swatch: 'linear-gradient(135deg, #ffffff 50%, #059669 50%)' },
  deck: { cs: true, name: 'Deck', desc: 'Slides you scroll', swatch: 'linear-gradient(180deg, #e11d48 50%, #111114 50%)' },
  brief: { cs: true, name: 'Brief', desc: 'Swiss & compact', swatch: 'linear-gradient(135deg, #ffffff 65%, #e3261b 65%)' },
};

/** Create and save a new project, returning it. */
export function createProject(type, template) {
  const user = loadUser();
  const p = {
    id: `p-${Date.now().toString(36)}`,
    type, status: 'Draft', template, updatedAt: Date.now(),
    title: '', notes: '', role: '', skills: '', problem: '', contribution: '', learned: '',
    name: user.name || '', email: user.email || '', tagline: '', certs: '', brand: {},
    phone: '', location: '', website: '', languages: '',
    projects: [{ title: '', desc: '', link: '' }],
    experience: [{ from: '', to: '', role: '', company: '', loc: '', desc: '' }],
    education: [{ degree: '', school: '', from: '', to: '', desc: '' }],
    client: '', team: '', timeline: '', industry: '', goals: '', audience: '', constraints: '', research: '', tradeoffs: '',
    process: [{ title: '', desc: '' }], solution: '', metrics: [{ value: '', label: '' }], quote: '', quoteBy: '', next: '', link: '',
    cover: null, gallery: [],
  };
  saveProjects([p, ...loadProjects()]);
  pushProject(p);
  return p;
}

const DAY = 86400000;

function seedProjects() {
  const now = Date.now();
  return [
    {
      id: 'p-signup', sample: true, type: 'case', status: 'Draft', template: 'narrative', updatedAt: now,
      title: 'Redesigning sign-up for a student project',
      notes: 'I redesigned the sign-up flow for a student project. I did interviews and made prototypes.',
      role: 'Product designer', skills: 'User research, Interaction design, Figma',
      problem: '', contribution: '', learned: '',
    },
    {
      id: 'p-campus', sample: true, type: 'case', status: 'Published', template: 'narrative', updatedAt: now - 2 * DAY,
      title: 'Connecting a campus, one event at a time',
      notes: 'Built a campus events app. Worked on the API. Made it easier to find things.',
      role: 'Full-stack developer', skills: 'React, Node.js, TypeScript',
      problem: 'Campus events lived across scattered group chats. Students had no single place to discover what was happening or find their community.',
      contribution: 'I designed and built the API with Node.js and TypeScript, working with a team of four to simplify event discovery.',
      learned: 'Clear contracts between front end and back end save more time than clever code. Small, regular demos kept the team aligned.',
    },
    {
      id: 'p-cv', sample: true, type: 'cv', status: 'Draft', template: 'outline', updatedAt: now - 8 * DAY,
      title: 'Graduate software developer CV',
      notes: 'Computer science graduate. Built an events platform at university.',
      role: 'Graduate software developer', skills: 'React, TypeScript, Node.js, Git',
      problem: '', contribution: '', learned: '',
    },
    {
      id: 'p-portfolio', sample: true, type: 'portfolio', status: 'Draft', template: 'studio', updatedAt: now - 21 * DAY,
      title: 'Thoughtful design. Everyday impact.',
      notes: 'Product designer working across digital and physical products.',
      role: 'Product designer', skills: 'Brand strategy, Art direction, Digital design',
      problem: '', contribution: '', learned: '',
    },
  ];
}

/* Projects are cached in this browser (and synced to the account by api.js).
   Components read them with useProjects() so they re-render after a sync. */
let projectsVersion = 0;
const projectSubs = new Set();
const notify = () => { projectsVersion += 1; projectSubs.forEach((fn) => fn()); };
const writeProjects = (projects) => {
  try { localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects)); return true; } catch { return false; }
};

export function loadProjects() {
  try {
    const raw = localStorage.getItem(PROJECTS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  const seeded = seedProjects(); // demo content for signed-out visitors
  writeProjects(seeded);
  return seeded;
}

/** Save projects to this browser. Returns false if storage is full. */
export function saveProjects(projects) {
  const ok = writeProjects(projects);
  notify();
  return ok;
}

/** Forget the cached projects (e.g. on log out). */
export function clearProjects() {
  try { localStorage.removeItem(PROJECTS_KEY); } catch {}
  notify();
}

/** All cached projects; re-renders when they change. */
export function useProjects() {
  const v = useSyncExternalStore((fn) => { projectSubs.add(fn); return () => projectSubs.delete(fn); }, () => projectsVersion);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => loadProjects(), [v]);
}

export function loadUser() {
  try { return JSON.parse(localStorage.getItem(USER_KEY)) || { name: 'Alex Morgan' }; } catch { return { name: 'Alex Morgan' }; }
}

export function saveUser(user) {
  try {
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    else localStorage.removeItem(USER_KEY);
  } catch {}
  userVersion += 1;
  userSubs.forEach((fn) => fn());
}

let userVersion = 0;
const userSubs = new Set();
/** The current user; re-renders when it changes (log in, log out, profile refresh). */
export function useUser() {
  const v = useSyncExternalStore((fn) => { userSubs.add(fn); return () => userSubs.delete(fn); }, () => userVersion);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => loadUser(), [v]);
}

export function initials(name = '') {
  return name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() || '').join('') || 'A';
}

export function timeAgo(ts) {
  const diff = Date.now() - ts;
  const min = Math.round(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} minute${min === 1 ? '' : 's'} ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? '' : 's'} ago`;
  const day = Math.round(hr / 24);
  if (day === 1) return 'yesterday';
  if (day < 7) return `${day} days ago`;
  const wk = Math.round(day / 7);
  if (wk === 1) return 'last week';
  if (wk < 5) return `${wk} weeks ago`;
  return new Date(ts).toLocaleDateString();
}

/** Remove a saved project from this browser. */
export function deleteProject(id) {
  saveProjects(loadProjects().filter((p) => p.id !== id));
  removeProject(id);
}

export const TrashIcon = ({ size = 15 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
  </svg>
);

/** Ask before deleting a project. Esc or the backdrop cancels. */
export function ConfirmDelete({ project, onCancel, onConfirm }) {
  const cancelRef = useRef(null);
  const cb = useRef({ onCancel });
  cb.current.onCancel = onCancel;
  useEffect(() => {
    cancelRef.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') cb.current.onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  if (!project) return null;
  const name = project.title || project.name || 'Untitled';
  const kind = (FORMATS[project.type]?.label || 'project').toLowerCase();
  return (
    <div className="confirm" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="confirm__box" role="alertdialog" aria-modal="true" aria-labelledby="confirm-t" aria-describedby="confirm-d">
        <span className="confirm__icon"><TrashIcon size={18} /></span>
        <h2 id="confirm-t" className="confirm__t">Delete this {kind}?</h2>
        <p id="confirm-d" className="confirm__d">“{name}” will be removed from this browser. This can’t be undone.</p>
        <div className="confirm__actions">
          <button ref={cancelRef} className="app-btn app-btn--ghost" onClick={onCancel}>Cancel</button>
          <button className="app-btn app-btn--danger" onClick={onConfirm}>Delete</button>
        </div>
      </div>
    </div>
  );
}
