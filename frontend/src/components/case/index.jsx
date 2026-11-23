import { useLayoutEffect, useRef, useState } from 'react';
import { Chronicle, Snapshot, Blueprint, Spotlight, Framework, Lab, Showcase, Impact, Deck, Brief } from './templates.jsx';
import { Depth } from './Depth.jsx';
import { Mockup, Styleguide, Chapters, Pocket, Collage, Split, Tiles, Terminal, Poster, Aurora } from './templates2.jsx';
import { CASE_SAMPLES } from './data.js';
import { brandProps } from '../sites/brand.js';
import { CaseMeta } from './extras.jsx';
import { StaticSite } from '../sites/shared.jsx';

export const CASE_NICHES = [
  { id: 'design',   label: 'Design & UX',          careers: 'Product, UX, UI and service designers' },
  { id: 'eng',      label: 'Engineering & data',   careers: 'Software engineers, data scientists, analysts, IT' },
  { id: 'brand',    label: 'Marketing & brand',    careers: 'Marketers, brand designers, copywriters, social media' },
  { id: 'business', label: 'Business & consulting',careers: 'Consultants, product managers, operations, strategy' },
  { id: 'research', label: 'Research',             careers: 'UX researchers, academics, policy and insight teams' },
  { id: 'visual',   label: 'Visual & spaces',      careers: 'Architects, interior designers, illustrators, photographers' },
  { id: 'student',  label: 'Students & graduates', careers: 'University projects, bootcamps, dissertations' },
];

/* Case study templates. Display names also live in TEMPLATES (ui.jsx). */
export const CASE_TEMPLATES = {
  chronicle: { name: 'Chronicle', desc: 'Editorial long-read',     blurb: 'A magazine-style story with a wide cover, a calm reading column and pull quotes.', tags: ['Editorial'], niches: ['design', 'brand', 'research'], sample: CASE_SAMPLES.brand, Component: Chronicle },
  snapshot:  { name: 'Snapshot',  desc: 'Scannable one-pager',     blurb: 'Facts, results and problem → approach → outcome above the fold. Built for busy recruiters.', tags: ['Recruiter-friendly'], niches: ['design', 'eng', 'business', 'student'], sample: CASE_SAMPLES.eng, Component: Snapshot },
  blueprint: { name: 'Blueprint', desc: 'Process-led & technical', blurb: 'Numbered sections on a blueprint grid, with a step-by-step process flow.', tags: ['Technical'], niches: ['eng', 'business'], sample: CASE_SAMPLES.eng, Component: Blueprint },
  spotlight: { name: 'Spotlight', desc: 'Dark & cinematic',        blurb: 'A full-bleed cover, huge numbers and big statements. For work that should feel like a launch.', tags: ['Dark', 'Bold'], niches: ['brand', 'visual'], sample: CASE_SAMPLES.brand, Component: Spotlight },
  framework: { name: 'Framework', desc: 'Situation → result',      blurb: 'Situation, challenge and objectives as cards, then approach, recommendation and impact.', tags: ['Structured'], niches: ['business', 'student'], sample: CASE_SAMPLES.ops, Component: Framework },
  lab:       { name: 'Lab',       desc: 'Research report',         blurb: 'Question, method, findings and recommendations, laid out like a well-kept lab notebook.', tags: ['Research', 'New'], niches: ['research', 'design', 'student'], sample: CASE_SAMPLES.research, Component: Lab },
  showcase:  { name: 'Showcase',  desc: 'Visuals first',           blurb: 'A large cover and a wall of images, with just enough words. For visual and spatial work.', tags: ['Visual', 'New'], niches: ['visual', 'brand', 'design'], sample: CASE_SAMPLES.brand, Component: Showcase },
  impact:    { name: 'Impact',    desc: 'Numbers first',           blurb: 'Leads with your headline result, then before-and-after and a timeline of how you got there.', tags: ['Metrics', 'New'], niches: ['business', 'eng', 'design'], sample: CASE_SAMPLES.ux, Component: Impact },
  deck:      { name: 'Deck',      desc: 'Slides you scroll',       blurb: 'Each section is a numbered slide, ready to present in an interview or pitch.', tags: ['Presentation', 'New'], niches: ['business', 'brand', 'student'], sample: CASE_SAMPLES.ops, Component: Deck },
  brief:     { name: 'Brief',     desc: 'Swiss & compact',         blurb: 'Six numbered sections on a strict grid. Everything important, nothing extra.', tags: ['Minimal', 'New'], niches: ['design', 'research', 'visual'], sample: CASE_SAMPLES.ux, Component: Brief },
  depth:     { name: 'Depth',     desc: 'Dark & 3D',               blurb: 'A layered 3D hero, panels on a curved wall, your process as rising cubes, a cover-flow gallery and results that stand up.', tags: ['3D', 'New'], niches: ['design', 'eng', 'brand'], three: true, sample: CASE_SAMPLES.ux, Component: Depth },
  mockup: { name: 'Mockup', desc: 'Launch-style showcase', blurb: 'A centred launch hero with your work in a browser frame, then each step beside a screen.', tags: ['Product', 'New'], niches: ['design', 'eng', 'student'], sample: CASE_SAMPLES.ux, Component: Mockup },
  styleguide: { name: 'Styleguide', desc: 'Brand identity sheet', blurb: 'Huge type, a colour and type system, and a moodboard of the work. Built for identity projects.', tags: ['Brand', 'New'], niches: ['brand', 'visual', 'design'], sample: CASE_SAMPLES.brand, Component: Styleguide },
  chapters: { name: 'Chapters', desc: 'Story in numbered chapters', blurb: 'Each part of the story is its own chapter with a big number. Calm, serif and easy to follow.', tags: ['Story', 'New'], niches: ['design', 'research', 'student'], sample: CASE_SAMPLES.research, Component: Chapters },
  pocket: { name: 'Pocket', desc: 'Mobile app on phones', blurb: 'Your screens in phone frames, on a band of colour. For app and mobile product work.', tags: ['Mobile', 'New'], niches: ['design', 'eng'], sample: CASE_SAMPLES.app, Component: Pocket },
  collage: { name: 'Collage', desc: 'Images first', blurb: 'A masonry wall of your images with the story as short captions. For visual, spatial and craft work.', tags: ['Visual', 'New'], niches: ['visual', 'brand'], sample: CASE_SAMPLES.brand, Component: Collage },
  split: { name: 'Split', desc: 'Sticky index', blurb: 'A sticky column with the facts and an index beside the story. Easy for recruiters to skim.', tags: ['Recruiter-friendly', 'New'], niches: ['business', 'eng', 'design', 'research'], sample: CASE_SAMPLES.ops, Component: Split },
  tiles: { name: 'Tiles', desc: 'Bento summary', blurb: 'The whole story as a bento grid up top (problem, role, results), then the detail.', tags: ['Bento', 'New'], niches: ['design', 'business', 'eng'], sample: CASE_SAMPLES.ux, Component: Tiles },
  devlog: { name: 'Devlog', desc: 'Engineering log', blurb: 'Dark and monospaced: the process as a commit log and results as a benchmark. For engineers.', tags: ['Dark', 'Technical', 'New'], niches: ['eng'], sample: CASE_SAMPLES.eng, Component: Terminal },
  poster: { name: 'Poster', desc: 'Swiss poster', blurb: 'Huge type, a full-width colour block for your headline number and a strict grid.', tags: ['Bold', 'New'], niches: ['brand', 'design', 'visual'], sample: CASE_SAMPLES.brand, Component: Poster },
  aurora: { name: 'Aurora', desc: 'Soft gradients', blurb: 'Soft colour glows and glass cards. Friendly and modern, for product and SaaS work.', tags: ['Soft', 'New'], niches: ['design', 'business', 'student'], sample: CASE_SAMPLES.ux, Component: Aurora },
};

export const caseNicheLabels = (ids = []) => ids.map((id) => CASE_NICHES.find((n) => n.id === id)?.label).filter(Boolean);

/** Render a case study template with the user's branding layered on top. */
export function CasePreview({ template, data, meta = false }) {
  const T = (CASE_TEMPLATES[template] || CASE_TEMPLATES.chronicle).Component;
  const b = data?.brand || {};
  return (
    <div key={`${b.motion || 'none'}-${b.speed || 'normal'}-${b.replay || 0}`} {...brandProps(b)}>
      {meta && <CaseMeta data={data} />}
      <T data={data} />
    </div>
  );
}

/** A case study rendered at `base` px and scaled to its box; pans on hover. */
export function ScaledCase({ template, data, base = 1100, height = 420, className = '' }) {
  const box = useRef(null);
  const inner = useRef(null);
  const [m, setM] = useState({ scale: 0, pan: 0 });
  useLayoutEffect(() => {
    const measure = () => {
      if (!box.current || !inner.current) return;
      const scale = box.current.clientWidth / base;
      const pan = Math.max(0, inner.current.offsetHeight * scale - box.current.clientHeight);
      setM((p) => (p.scale === scale && p.pan === pan ? p : { scale, pan }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(box.current);
    ro.observe(inner.current);
    return () => ro.disconnect();
  }, [base]);
  return (
    <div ref={box} className={`scaled ${className}`} style={{ height, '--pan': `${-m.pan}px`, '--pan-dur': `${Math.min(9, Math.max(2, m.pan / 160)).toFixed(1)}s` }} aria-hidden>
      <div ref={inner} className="scaled__inner" style={{ width: base, '--s': m.scale, visibility: m.scale ? 'visible' : 'hidden' }}>
        <StaticSite.Provider value>
          <CasePreview template={template} data={{ ...data, brand: { ...(data?.brand || {}), motion: 'none' } }} />
        </StaticSite.Provider>
      </div>
    </div>
  );
}
