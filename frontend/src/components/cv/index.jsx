import { useLayoutEffect, useRef, useState } from 'react';
import { Classic, Meridian, Executive, Margin, Timeline, Plain, Canvas, Stack, Graduate, Atelier } from './templates.jsx';
import { CV_SAMPLES } from './data.js';
import { FONT_PAIRS, onColor } from '../sites/brand.js';

/** A4 at 96 dpi. */
export const PAGE_W = 794;
export const PAGE_H = 1123;

/* Fields people pick from. Similar careers share a group. */
export const CV_NICHES = [
  { id: 'business', label: 'Business & finance',     careers: 'Accountants, analysts, consultants, operations, HR, sales' },
  { id: 'tech',     label: 'Tech & engineering',     careers: 'Software engineers, data analysts, IT support, cyber security, engineers' },
  { id: 'creative', label: 'Creative & marketing',   careers: 'Designers, marketers, writers, content creators, media' },
  { id: 'care',     label: 'Healthcare & education', careers: 'Nurses, doctors, carers, pharmacists, teachers, lecturers' },
  { id: 'lead',     label: 'Leadership',             careers: 'Directors, heads of department, managers, executives' },
  { id: 'grad',     label: 'Students & graduates',   careers: 'Students, graduates, interns, apprentices, career changers' },
];

/* The CV templates. Display names also live in TEMPLATES (ui.jsx). */
export const CV_TEMPLATES = {
  classic:  { name: 'Classic',   desc: 'Timeless & traditional',   blurb: 'A centred serif masthead and ruled sections. Never out of place, from law firms to hospitals.', tags: ['Serif', 'ATS-friendly'], niches: ['business', 'care', 'lead'], sample: CV_SAMPLES.finance, Component: Classic },
  meridian: { name: 'Meridian',  desc: 'Modern two-column',        blurb: 'A tinted sidebar for contact, skills and languages, leaving the main column for your story.', tags: ['Two-column'], niches: ['tech', 'business', 'creative'], sample: CV_SAMPLES.engineer, Component: Meridian },
  executive:{ name: 'Executive', desc: 'Senior & assured',         blurb: 'A confident dark masthead, a core-competencies grid and career history built for senior roles.', tags: ['Leadership'], niches: ['lead', 'business'], sample: CV_SAMPLES.exec, Component: Executive },
  margin:   { name: 'Margin',    desc: 'Minimal & airy',           blurb: 'Section labels sit in a quiet left margin. Lots of white space, nothing extra.', tags: ['Minimal'], niches: ['creative', 'tech', 'business'], sample: CV_SAMPLES.marketing, Component: Margin },
  timeline: { name: 'Timeline',  desc: 'Your career at a glance',  blurb: 'Experience and education laid out on a vertical line, so progression reads instantly.', tags: ['Visual'], niches: ['care', 'business', 'grad'], sample: CV_SAMPLES.nurse, Component: Timeline },
  plain:    { name: 'Plain',     desc: 'ATS-safe & simple',        blurb: 'One column, standard headings, no graphics. Parses cleanly through applicant tracking systems.', tags: ['ATS-friendly', 'New'], niches: ['business', 'tech', 'care', 'lead', 'grad'], sample: CV_SAMPLES.engineer, Component: Plain },
  canvas:   { name: 'Canvas',    desc: 'Bold & creative',          blurb: 'An oversized name on a colour block and skill pills. For roles where personality counts.', tags: ['Bold', 'New'], niches: ['creative'], sample: CV_SAMPLES.creative, Component: Canvas },
  stack:    { name: 'Stack',     desc: 'For technical roles',      blurb: 'Monospace accents, your stack up front and projects with links. Made for engineers.', tags: ['Technical', 'New'], niches: ['tech'], sample: CV_SAMPLES.engineer, Component: Stack },
  graduate: { name: 'Graduate',  desc: 'Education first',          blurb: 'Leads with your degree and projects, then internships. Ideal for a first role.', tags: ['Entry level', 'New'], niches: ['grad', 'tech'], sample: CV_SAMPLES.grad, Component: Graduate },
  atelier:  { name: 'Atelier',   desc: 'Refined & elegant',        blurb: 'Warm paper, a monogram and fine serif type. Quietly premium for client-facing roles.', tags: ['Serif', 'New'], niches: ['creative', 'lead'], sample: CV_SAMPLES.marketing, Component: Atelier },
};

export const cvNicheLabels = (ids = []) => ids.map((id) => CV_NICHES.find((n) => n.id === id)?.label).filter(Boolean);

export const CV_SIZES = { compact: ['Compact', 0.92], normal: ['Standard', 1], roomy: ['Roomy', 1.08] };

/** CSS custom properties for the CV's branding (fonts, accent, text size). */
export function cvBrandStyle(brand = {}) {
  const style = { '--cv-scale': (CV_SIZES[brand.size] || CV_SIZES.normal)[1] };
  const font = FONT_PAIRS[brand.font] && brand.font !== 'default' ? FONT_PAIRS[brand.font] : null;
  if (font) { style['--brand-head'] = font.head; style['--brand-body'] = font.body; }
  if (brand.accent) { style['--brand-accent'] = brand.accent; style['--brand-on'] = onColor(brand.accent); }
  return style;
}

/** Render a CV template at full A4 size. */
export function CvDoc({ template, data }) {
  const T = (CV_TEMPLATES[template] || CV_TEMPLATES.classic).Component;
  return <div className="cvwrap" style={cvBrandStyle(data?.brand)}><T data={data} /></div>;
}

/**
 * A CV scaled to fit its box. With `height`, it's a cropped thumbnail that
 * pans down on hover; without, the box grows to show the whole page.
 */
export function ScaledDoc({ template, data, height, className = '' }) {
  const box = useRef(null);
  const inner = useRef(null);
  const [m, setM] = useState({ scale: 0, h: 0 });

  useLayoutEffect(() => {
    const measure = () => {
      if (!box.current || !inner.current) return;
      const scale = box.current.clientWidth / PAGE_W;
      const h = inner.current.offsetHeight * scale;
      setM((p) => (p.scale === scale && p.h === h ? p : { scale, h }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(box.current);
    ro.observe(inner.current);
    return () => ro.disconnect();
  }, []);

  const boxH = height ?? m.h;
  const pan = height ? Math.max(0, m.h - height) : 0;
  return (
    <div
      ref={box}
      className={`scaled scaled--doc ${className}`}
      style={{ height: boxH || undefined, '--pan': `${-pan}px`, '--pan-dur': `${Math.min(9, Math.max(2, pan / 140)).toFixed(1)}s` }}
      aria-hidden={height ? true : undefined}
    >
      <div ref={inner} className="scaled__inner" style={{ width: PAGE_W, '--s': m.scale, visibility: m.scale ? 'visible' : 'hidden' }}>
        <CvDoc template={template} data={data} />
      </div>
    </div>
  );
}
