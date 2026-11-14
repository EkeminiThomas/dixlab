import { useLayoutEffect, useRef, useState } from 'react';
import ProjectView from './ProjectView.jsx';
import Folio from './Folio.jsx';
import Bento from './Bento.jsx';
import Terminal from './Terminal.jsx';
import Journal from './Journal.jsx';
import Grid from './Grid.jsx';
import Exhibit from './Exhibit.jsx';
import Punch from './Punch.jsx';
import Casebook from './Casebook.jsx';
import Sentinel from './Sentinel.jsx';
import Reel from './Reel.jsx';
import { StaticSite, OpenProject, site } from './shared.jsx';
import { brandProps } from './brand.js';

/* ==========================================================================
   Niches. Similar careers are merged into one group; every group maps to
   the templates that suit it best (see `niches` on each template below).
   ========================================================================== */
export const NICHES = [
  { id: 'ux',       label: 'UI/UX & product',        careers: 'UX & UI designers, web designers, product designers, product managers' },
  { id: 'cyber',    label: 'Cyber security',         careers: 'Penetration testers, SOC analysts, security engineers, bug bounty hunters, GRC' },
  { id: 'motion',   label: 'Motion, video & film',   careers: 'Motion designers, animators, videographers, filmmakers, video editors' },
  { id: 'graphic',  label: 'Graphic design & art',   careers: 'Graphic designers, illustrators, artists, concept artists' },
  { id: 'direction',label: 'Creative direction',     careers: 'Creative directors, art directors, brand designers' },
  { id: 'photo',    label: 'Photo, fashion & beauty',careers: 'Photographers, fashion designers, models, stylists, hair & makeup artists' },
  { id: 'spaces',   label: 'Architecture & spaces',  careers: 'Architects, interior designers, industrial designers' },
  { id: 'dev',      label: 'Developers & engineers', careers: 'Web developers, software & hardware engineers' },
  { id: 'writing',  label: 'Writing & marketing',    careers: 'Copywriters, writers, journalists, marketers, social media managers' },
  { id: 'perform',  label: 'Performers & voice',     careers: 'Actors, voice actors, presenters' },
  { id: 'learn',    label: 'Students & teachers',    careers: 'Students, graduates, teachers, educators' },
];

/* Sample personas so each niche template previews with believable content. */
const SAMPLES = {
  casebook: {
    name: 'Priya Shah', role: 'Product designer', tagline: 'Making complex tools feel simple.\nUX research, interaction and design systems.',
    about: 'I turn messy problems into clear, usable products, from early research to shipped UI.\n\nI care about accessibility, honest metrics and working closely with engineers.',
    skills: ['Figma', 'User research', 'Prototyping', 'Design systems', 'Usability testing'],
    projects: [
      { title: 'Banking onboarding', desc: 'Rethinking sign-up for a mobile bank so new customers finish in half the steps.', link: '' },
      { title: 'Clinic booking app', desc: 'A calmer booking flow for patients, tested with 20 participants across two rounds.', link: '' },
      { title: 'Design system', desc: 'A shared component library that brought three product teams onto one visual language.', link: '' },
    ],
    experience: [
      { from: '2024', to: 'Present', role: 'Product designer', company: 'Northwind Health' },
      { from: '2022', to: '2024', role: 'UX designer', company: 'Fieldnote Studio' },
    ],
    certs: ['Google UX Design Certificate'], email: 'priya@email.com',
  },
  sentinel: {
    name: 'Sam Rivera', role: 'Penetration tester', tagline: 'Breaking things, responsibly.\nWeb apps, networks and cloud.',
    about: 'I help teams find weaknesses before attackers do, through scoped testing, clear reporting and practical fixes.\n\nOutside work I play CTFs and write up what I learn for newcomers to security.',
    skills: ['Web app testing', 'Network security', 'Cloud (AWS)', 'Burp Suite', 'Python', 'Threat modelling'],
    projects: [
      { title: 'Home lab SOC', desc: 'A self-hosted detection lab with SIEM dashboards and custom alert rules.', link: '' },
      { title: 'API pentest write-up', desc: 'Methodology and findings from an authorised test of a fintech API.', link: '' },
      { title: 'CTF write-ups', desc: 'Step-by-step solutions to web and forensics challenges from recent CTFs.', link: '' },
      { title: 'Phishing awareness kit', desc: 'Training material and simulations for non-technical staff.', link: '' },
    ],
    experience: [
      { from: '2024', to: 'Present', role: 'Security consultant', company: 'Blackline Security' },
      { from: '2022', to: '2024', role: 'SOC analyst', company: 'Metro Council IT' },
    ],
    certs: ['OSCP', 'CompTIA Security+', 'eJPT'], email: 'sam@email.com',
  },
  reel: {
    name: 'Leo Martins', role: 'Motion designer', tagline: 'Animation, titles and brand motion\nfor screens of every size.',
    about: 'I design and animate motion for brands, launches and broadcast, from storyboard to final render.\n\nI love tight typography, satisfying easing and a good sound edit.',
    skills: ['After Effects', 'Cinema 4D', 'Blender', 'Premiere Pro', 'Storyboarding'],
    projects: [
      { title: 'Launch film', desc: 'A 45-second product launch film with 3D product shots and kinetic type.', link: '' },
      { title: 'Festival titles', desc: 'Opening title sequence for a short-film festival.', link: '' },
      { title: 'Brand motion kit', desc: 'Logo animation and motion guidelines for a fintech rebrand.', link: '' },
      { title: 'Music video', desc: 'Mixed-media animation for an indie single.', link: '' },
      { title: 'Explainer series', desc: 'Six short explainers for a health charity.', link: '' },
    ],
    experience: [
      { from: '2023', to: 'Present', role: 'Freelance', company: 'Studio Ampersand' },
      { from: '2021', to: '2023', role: 'Junior motion designer', company: 'Frame & Co' },
    ],
    certs: ['Vimeo Staff Pick'], email: 'leo@email.com',
  },
};

/* The portfolio site templates. Every one renders the same data, so users can
   switch between them without re-entering anything. Display names also live
   in TEMPLATES (ui.jsx) for the editor and dashboard. */
export const SITE_TEMPLATES = {
  folio:    { name: 'Folio',    desc: 'Personal & minimal',       blurb: 'A calm single page with an open-to-work hero, moving project strip and timeline.', tags: ['Minimal'], niches: ['dev', 'learn', 'ux'], Component: Folio },
  bento:    { name: 'Bento',    desc: 'Everything at a glance',   blurb: 'Your whole story on one screen, arranged as a grid of rounded tiles.', tags: ['Modern'], niches: ['dev', 'ux', 'writing', 'learn'], Component: Bento },
  terminal: { name: 'Terminal', desc: 'For people who ship code', blurb: 'Reads like a shell session: whoami, ls projects, git log of your career.', tags: ['Technical'], niches: ['dev', 'cyber'], Component: Terminal },
  journal:  { name: 'Journal',  desc: 'Editorial & considered',   blurb: 'A magazine masthead, a featured project and an indexed list of your work.', tags: ['Editorial'], niches: ['writing', 'direction', 'photo'], Component: Journal },
  grid:     { name: 'Grid',     desc: 'Swiss & precise',          blurb: 'Strict columns, oversized type and a single red accent. Quietly confident.', tags: ['Minimal'], niches: ['spaces', 'graphic', 'direction'], Component: Grid },
  exhibit:  { name: 'Exhibit',  desc: 'Let the work lead',        blurb: 'A gallery wall of large pieces with quiet captions, for visual portfolios.', tags: ['Visual'], niches: ['graphic', 'photo', 'spaces', 'perform'], Component: Exhibit },
  punch:    { name: 'Punch',    desc: 'Bold & playful',           blurb: 'Chunky borders, a skills ticker and loud colour for personalities that pop.', tags: ['Bold'], niches: ['graphic', 'writing', 'learn', 'motion'], Component: Punch },
  casebook: { name: 'Casebook', desc: 'Case studies first',       blurb: 'Device-framed case studies, your design process and toolkit. Built for UI/UX and product.', tags: ['New', 'Process'], niches: ['ux'], sample: SAMPLES.casebook, Component: Casebook },
  sentinel: { name: 'Sentinel', desc: 'For security professionals', blurb: 'Certifications up front, research as advisories, an experience log and a clear disclosure line.', tags: ['New', 'Dark'], niches: ['cyber'], sample: SAMPLES.sentinel, Component: Sentinel },
  reel:     { name: 'Reel',     desc: 'Showreel first',           blurb: 'A cinematic player hero, a film-strip grid of work and studios you’ve worked with.', tags: ['New', 'Cinematic'], niches: ['motion', 'perform'], sample: SAMPLES.reel, Component: Reel },
};

export const nicheLabels = (ids = []) => ids.map((id) => NICHES.find((n) => n.id === id)?.label).filter(Boolean);

/** Render a site template, with the user's branding layered on top. */
export function SitePreview({ template, data }) {
  const T = (SITE_TEMPLATES[template] || SITE_TEMPLATES.folio).Component;
  const b = data?.brand || {};
  // Re-mount when motion settings change so the entrance animation replays.
  return (
    <div key={`${b.motion || 'none'}-${b.speed || 'normal'}-${b.replay || 0}`} {...brandProps(b)}>
      <T data={data} />
    </div>
  );
}

/**
 * A site people can click through: each project card opens that project's
 * page, with a way back. Used by the editor and the full-screen preview.
 */
export function LiveSite({ template, data }) {
  const [open, setOpen] = useState(null);
  const count = site(data).hasProjects ? site(data).projects.length : 0;
  const shown = open != null && open < count ? open : null;
  if (shown != null) {
    return <ProjectView template={template} data={data} index={shown} onBack={() => setOpen(null)} onGo={setOpen} />;
  }
  return (
    <OpenProject.Provider value={{ count, open: setOpen }}>
      <SitePreview template={template} data={data} />
    </OpenProject.Provider>
  );
}

/**
 * A live site rendered at `base` px wide and scaled down to fit its box.
 * On hover it pans down through the page, like a template marketplace.
 */
export function ScaledSite({ template, data, base = 760, height = 420, className = '' }) {
  const box = useRef(null);
  const inner = useRef(null);
  const [m, setM] = useState({ scale: 0, pan: 0 });

  useLayoutEffect(() => {
    const measure = () => {
      if (!box.current || !inner.current) return;
      const scale = box.current.clientWidth / base;
      const pan = Math.max(0, inner.current.offsetHeight * scale - box.current.clientHeight);
      setM((prev) => (prev.scale === scale && prev.pan === pan ? prev : { scale, pan }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(box.current);
    ro.observe(inner.current);
    return () => ro.disconnect();
  }, [base]);

  return (
    <div
      ref={box}
      className={`scaled ${className}`}
      style={{ height, '--pan': `${-m.pan}px`, '--pan-dur': `${Math.min(9, Math.max(2, m.pan / 140)).toFixed(1)}s` }}
      aria-hidden
    >
      <div ref={inner} className="scaled__inner" style={{ width: base, '--s': m.scale, visibility: m.scale ? 'visible' : 'hidden' }}>
        <StaticSite.Provider value>
          <SitePreview template={template} data={data} />
        </StaticSite.Provider>
      </div>
    </div>
  );
}
