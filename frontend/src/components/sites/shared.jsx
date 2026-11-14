import { createContext, useContext } from 'react';
import { initials, loadUser } from '../ui.jsx';

/**
 * True when a site is rendered as a non-interactive thumbnail (often inside a
 * card that is itself a link). Links then render as plain spans, which avoids
 * invalid <a>-inside-<a> markup.
 */
export const StaticSite = createContext(false);

/* ==========================================================================
   Shared pieces for the portfolio site templates.
   Every template renders the same data shape, so a user can switch freely.
   ========================================================================== */

export const SAMPLE = {
  name: 'Alex Morgan',
  role: 'Software engineer',
  tagline: 'Building thoughtful, accessible products.\nStudent by day, maker by night.',
  about: 'I like to build solid, well-considered software with a clear experience at its heart.\n\nI’m a computer science graduate working across web development, APIs and design systems. I care about accessibility, tidy code, and helping other people get started in tech.',
  skills: ['React', 'TypeScript', 'Node.js', 'Figma', 'Git'],
  projects: [
    { title: 'Campus Events', desc: 'A single place for students to discover what’s happening and find their community.', link: '' },
    { title: 'Route Planner', desc: 'Accessible route planning for people with step-free travel needs.', link: '' },
    { title: 'Study Buddy', desc: 'Pairs students for focused study sessions, with shared timers and notes.', link: '' },
    { title: 'Pocket Budget', desc: 'A lightweight budgeting app that makes monthly spending easy to see.', link: '' },
  ],
  experience: [
    { from: '2025', to: 'Present', role: 'Graduate developer', company: 'Campus Collective' },
    { from: '2024', to: '2025', role: 'Front-end intern', company: 'Brightside Studio' },
    { from: '2023', to: '2024', role: 'Teaching assistant', company: 'University of Bristol' },
  ],
  email: 'alex.morgan@email.com',
};

export const blankSiteProject = () => ({ title: '', desc: '', link: '' });
export const blankSiteRole = () => ({ from: '', to: '', role: '', company: '' });

/** Map a saved Dixlab project to the data a site template renders. */
export function projectToSite(p) {
  return {
    name: p.name ?? loadUser().name,
    role: p.role,
    tagline: p.tagline ?? '',
    about: p.notes,
    email: p.email ?? '',
    photo: p.photo || '',
    skills: (p.skills || '').split(',').map((s) => s.trim()).filter(Boolean),
    projects: p.projects || [],
    experience: p.experience || [],
    certs: (p.certs || '').split(',').map((s) => s.trim()).filter(Boolean),
    brand: p.brand || {},
  };
}

export function roman(n) {
  const map = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let out = '';
  for (const [v, r] of map) while (n >= v) { out += r; n -= v; }
  return out;
}

/** Short, stable hex id from a string (used for "commit hashes"). */
export function hash(str = '') {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16).padStart(8, '0').slice(0, 7);
}

/** Normalise template data. Missing keys fall back to the sample content. */
export function site(data = {}) {
  const d = { ...SAMPLE, ...data };
  const name = d.name?.trim() || 'Your name';
  const first = name.split(/\s+/)[0];
  const projects = (d.projects || []).filter((p) => p.title || p.desc);
  const year = new Date().getFullYear();
  return {
    name,
    first,
    rest: name.split(/\s+/).slice(1).join(' '),
    handle: first.toLowerCase().replace(/[^a-z0-9]/g, ''),
    mono: initials(name),
    role: d.role?.trim() || 'Your role',
    tagline: d.tagline || '',
    paras: (d.about || '').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean),
    skills: d.skills || [],
    hasProjects: projects.length > 0,
    projects: projects.length ? projects : [{ title: 'Your first project', desc: 'Add a project to show it here.', link: '' }],
    experience: (d.experience || []).filter((e) => e.role || e.company),
    reel: projects.flatMap((p) => p.media || []).find((m) => m.type === 'video') || null,
    certs: d.certs || [],
    email: d.email || '',
    photo: typeof d.photo === 'string' ? d.photo : '',
    year,
    roman: roman(year),
  };
}

export const SHOTS = [
  { bg: '#0f0f12', ink: '#ffffff', hi: '#a594ff' },
  { bg: '#1c1208', ink: '#ffd9a8', hi: '#ff8a3d' },
  { bg: '#f1ece2', ink: '#1d1a14', hi: '#b4461b' },
  { bg: '#e8eef8', ink: '#0f1f3d', hi: '#2f6bff' },
  { bg: '#10201a', ink: '#d8f5e4', hi: '#3ddc97' },
  { bg: '#f7e8ef', ink: '#3a1024', hi: '#e0447c' },
];

/**
 * The person's profile photo, or their initials when they haven't added one.
 * With `fallback={false}` nothing renders without a photo.
 */
export function Avatar({ s, className = '', fallback = true }) {
  if (!s.photo) return fallback ? <span className={className}>{s.mono}</span> : null;
  return (
    <span className={`${className} has-photo`}>
      <img src={s.photo} alt={s.name === 'Your name' ? 'Profile photo' : s.name} draggable={false} />
    </span>
  );
}

/**
 * A project's thumbnail: the user's image or video when they've added one,
 * otherwise a mock "screenshot" generated from its title.
 */
export function Shot({ title, i = 0, palette = SHOTS, className = '', media }) {
  const isStatic = useContext(StaticSite);
  if (media?.src) {
    return (
      <div className={`shot shot--media ${className}`}>
        {media.type === 'video'
          ? <video className="shot__media" src={isStatic ? `${media.src}#t=0.1` : media.src} muted loop playsInline preload="metadata" autoPlay={!isStatic} aria-label={title || 'Project video'} />
          : <img className="shot__media" src={media.src} alt={media.caption || title || ''} loading="lazy" />}
        {media.type === 'video' && <span className="shot__play" aria-hidden>▶</span>}
      </div>
    );
  }
  const c = palette[i % palette.length];
  return (
    <div className={`shot ${className}`} style={{ background: c.bg, color: c.ink }}>
      <div className="shot__bar"><i /><i /><i /><span /></div>
      <p className="shot__t">{title || 'Untitled project'}</p>
      <span className="shot__l" style={{ background: c.hi }} />
      <span className="shot__l shot__l--s" />
    </div>
  );
}

const PATHS = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  mail: 'M3 6h18v12H3zM3 7l9 6 9-6',
  link: 'M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1',
  chev: 'M9 6l6 6-6 6',
  arrow: 'M7 17 17 7M8 7h9v9',
  right: 'M5 12h14M13 6l6 6-6 6',
  spark: 'M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8',
  max: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  min: 'M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5',
  close: 'M6 6l12 12M18 6 6 18',
  play: 'M8 5v14l11-7z',
  shield: 'M12 3 4 6v6c0 4.5 3.4 8.4 8 9 4.6-.6 8-4.5 8-9V6zM9 12l2 2 4-4',
  lock: 'M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3',
  award: 'M12 15a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM8.5 14 7 21l5-3 5 3-1.5-7',
  prev: 'M15 6l-6 6 6 6',
  next: 'M9 6l6 6-6 6',
};

export function Glyph({ name, size = 14, stroke = 1.8 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={PATHS[name]} />
    </svg>
  );
}

/**
 * Opening a project's own page. Provided by whatever shows a live site:
 * { count, open(i), href?(i) }. Thumbnails don't provide it.
 */
export const OpenProject = createContext(null);

/**
 * A project card. On a live site it opens that project's page; otherwise it
 * falls back to the project's own link, or plain text in a thumbnail.
 */
export function ProjectLink({ href, className, children, project }) {
  const isStatic = useContext(StaticSite);
  const nav = useContext(OpenProject);
  if (nav && !isStatic && project != null && project < nav.count) {
    const url = nav.href?.(project);
    const onClick = (e) => {
      if (url && (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1)) return; // let "open in new tab" work
      e.preventDefault();
      nav.open(project);
    };
    return (
      <a className={`${className || ''} is-openable`} href={url || '#'} onClick={onClick}>
        {children}
      </a>
    );
  }
  return href && !isStatic
    ? <a className={className} href={href} target="_blank" rel="noreferrer">{children}</a>
    : <span className={className}>{children}</span>;
}

export function MailLink({ email, className, children }) {
  const isStatic = useContext(StaticSite);
  return email && !isStatic
    ? <a className={className} href={`mailto:${email}`}>{children}</a>
    : <span className={className}>{children}</span>;
}
