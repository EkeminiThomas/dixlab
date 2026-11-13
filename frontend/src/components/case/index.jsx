import { useLayoutEffect, useRef, useState } from 'react';
import { Chronicle, Snapshot, Blueprint, Spotlight, Framework, Lab, Showcase, Impact, Deck, Brief } from './templates.jsx';
import { CASE_SAMPLES } from './data.js';
import { brandProps } from '../sites/brand.js';
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
};

export const caseNicheLabels = (ids = []) => ids.map((id) => CASE_NICHES.find((n) => n.id === id)?.label).filter(Boolean);

/** Render a case study template with the user's branding layered on top. */
export function CasePreview({ template, data }) {
  const T = (CASE_TEMPLATES[template] || CASE_TEMPLATES.chronicle).Component;
  const b = data?.brand || {};
  return (
    <div key={`${b.motion || 'none'}-${b.speed || 'normal'}-${b.replay || 0}`} {...brandProps(b)}>
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
