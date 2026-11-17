/* ==========================================================================
   Branding: the user's customisations layered over any site template.
   Stored on the project as `brand` = { font, accent, motion, speed }, plus
   { depth, tilt, float } for the 3D templates.
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

/* 3D effects, used by the 3D templates (Blocks, Depth). Every angle and depth
   in their CSS is multiplied by --d3, so Flat turns the 3D off entirely. */
export const DEPTHS = { flat: ['Flat', 0], subtle: ['Subtle', 0.55], normal: ['Normal', 1], deep: ['Deep', 1.6] };
export const TILTS = { pointer: 'Follow the pointer', off: 'Off' };
export const FLOATS = { on: 'Gentle float', off: 'Still' };

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
    '--d3': (DEPTHS[brand.depth] || DEPTHS.normal)[1],
    '--tilt-k': brand.tilt === 'off' ? 0 : 1,
  };
  if (brand.accent) { style['--brand-accent'] = brand.accent; style['--brand-on'] = onColor(brand.accent); }
  if (font) { style['--brand-head'] = font.head; style['--brand-body'] = font.body; }
  const bg = safeBg(brand.bgImage);
  if (bg) {
    // Only Dixlab's own uploads or inline images, and nothing that could break out of url("…").
    style['--brand-bg'] = `url("${bg}")`;
    style['--brand-bg-k'] = (BG_STRENGTHS[brand.bgStrength] || BG_STRENGTHS.medium)[1];
  }
  return {
    className: `brand ${font ? 'brand--font' : ''} ${bg ? 'brand--bg' : ''}`,
    'data-motion': motion,
    'data-float': brand.float === 'off' ? 'off' : 'on',
    ...(bg ? { 'data-bg': BG_PLACES[brand.bgPlace] ? brand.bgPlace : 'hero' } : {}),
    style,
  };
}

/* Background image (portfolios): blended into the template's own background
   colour at a chosen strength, so text keeps its contrast. */
export const BG_STRENGTHS = { soft: ['Soft', 0.2], medium: ['Medium', 0.38], strong: ['Strong', 0.65] };
export const BG_PLACES = { hero: 'Top of the page', page: 'Behind everything' };
const BG_SRC = /^(?:\/uploads\/[a-f0-9]{32}\.(?:jpe?g|png|webp|gif)|data:image\/(?:png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+|blob:[A-Za-z0-9:/._-]+)$/;
export const safeBg = (src) => (typeof src === 'string' && BG_SRC.test(src) ? src : '');

export const isBranded = (b = {}) => Boolean((b.font && b.font !== 'default') || b.accent || (b.motion && b.motion !== 'none')
  || (b.depth && b.depth !== 'normal') || b.tilt === 'off' || b.float === 'off' || b.bgImage);
