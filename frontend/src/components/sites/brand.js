/* ==========================================================================
   Branding: the user's customisations layered over any site template.
   Stored on the project as `brand` = { font, accent, motion, speed }.
   Anything left unset falls back to the template's own default.
   ========================================================================== */

export const FONT_PAIRS = {
  default:   { label: 'Template default', head: null, body: null },
  modern:    { label: 'Modern',     head: "'Instrument Sans', system-ui, sans-serif", body: "'Instrument Sans', system-ui, sans-serif" },
  grotesk:   { label: 'Grotesk',    head: "'Space Grotesk', system-ui, sans-serif",   body: "'Space Grotesk', system-ui, sans-serif" },
  editorial: { label: 'Editorial',  head: "'Playfair Display', Georgia, serif",       body: "'Instrument Sans', system-ui, sans-serif" },
  elegant:   { label: 'Elegant',    head: "'Instrument Serif', Georgia, serif",       body: "'DM Sans', system-ui, sans-serif" },
  expressive:{ label: 'Expressive', head: "'Syne', system-ui, sans-serif",            body: "'DM Sans', system-ui, sans-serif" },
  friendly:  { label: 'Friendly',   head: "'Bricolage Grotesque', system-ui, sans-serif", body: "'DM Sans', system-ui, sans-serif" },
  technical: { label: 'Technical',  head: "'Roboto Mono', ui-monospace, monospace",   body: "'Roboto Mono', ui-monospace, monospace" },
};

export const ACCENTS = [
  ['#5144e8', 'Indigo'], ['#7b5cff', 'Violet'], ['#ec4899', 'Pink'], ['#e3261b', 'Red'],
  ['#ff6b3d', 'Orange'], ['#eab308', 'Gold'], ['#10b981', 'Emerald'], ['#0ea5e9', 'Sky'],
  ['#22d3ee', 'Cyan'], ['#111111', 'Ink'],
];

export const MOTIONS = {
  none:  { label: 'None',        x: '0px',   y: '0px',   s: 1 },
  up:    { label: 'Rise up',     x: '0px',   y: '28px',  s: 1 },
  down:  { label: 'Drop down',   x: '0px',   y: '-28px', s: 1 },
  left:  { label: 'From left',   x: '-36px', y: '0px',   s: 1 },
  right: { label: 'From right',  x: '36px',  y: '0px',   s: 1 },
  zoom:  { label: 'Zoom in',     x: '0px',   y: '0px',   s: 0.94 },
};

export const SPEEDS = { calm: ['Calm', 1.1], normal: ['Normal', 0.7], snappy: ['Snappy', 0.4] };

/** Black or white, whichever reads better on the given hex colour. */
export function onColor(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return L > 0.4 ? '#111111' : '#ffffff';
}

/** CSS custom properties + attributes for a brand. */
export function brandProps(brand = {}) {
  const font = FONT_PAIRS[brand.font] && brand.font !== 'default' ? FONT_PAIRS[brand.font] : null;
  const motion = MOTIONS[brand.motion] ? brand.motion : 'none';
  const m = MOTIONS[motion];
  const speed = (SPEEDS[brand.speed] || SPEEDS.normal)[1];
  const style = {
    '--bx': m.x, '--by': m.y, '--bs': m.s, '--brand-dur': `${speed}s`,
  };
  if (brand.accent) { style['--brand-accent'] = brand.accent; style['--brand-on'] = onColor(brand.accent); }
  if (font) { style['--brand-head'] = font.head; style['--brand-body'] = font.body; }
  return {
    className: `brand ${font ? 'brand--font' : ''}`,
    'data-motion': motion,
    style,
  };
}

export const isBranded = (b = {}) => Boolean((b.font && b.font !== 'default') || b.accent || (b.motion && b.motion !== 'none'));
