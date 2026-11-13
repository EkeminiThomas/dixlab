/* ==========================================================================
   Prompt-to-customisation, browser side.
   Sends the request to /api/customize (Claude, server-side). If AI isn't
   available, falls back to a local keyword parser so the feature still works.
   ========================================================================== */
import { request, isSignedIn } from '../../api.js';
import { TEMPLATE_CATALOG, TEMPLATE_KEYS, CV_CATALOG, CV_KEYS, CASE_CATALOG, CASE_KEYS } from './catalog.js';

const COLORS = {
  'dark purple': '#5b21b6', purple: '#7b5cff', violet: '#7b5cff', lavender: '#a78bfa', indigo: '#5144e8',
  navy: '#1e3a8a', 'dark blue': '#1e40af', blue: '#2563eb', sky: '#0ea5e9', cyan: '#22d3ee', teal: '#0d9488',
  'forest green': '#166534', 'dark green': '#166534', emerald: '#10b981', green: '#16a34a', lime: '#84cc16', mint: '#34d399',
  yellow: '#eab308', gold: '#ca8a04', amber: '#f59e0b', orange: '#ff6b3d', coral: '#fb7185', peach: '#f6b38f',
  red: '#e3261b', crimson: '#be123c', maroon: '#7f1d1d', burgundy: '#7f1d1d', pink: '#ec4899', magenta: '#d946ef', rose: '#f43f5e',
  brown: '#92400e', black: '#111111', ink: '#111111', charcoal: '#27272a', grey: '#52525b', gray: '#52525b',
};

const FONT_WORDS = [
  [/\b(mono|monospace|code|coder|technical|hacker)\b/, 'technical'],
  [/\b(playfair|editorial|magazine|newspaper)\b/, 'editorial'],
  [/\b(serif|elegant|classic|luxury|premium|sophisticated)\b/, 'elegant'],
  [/\b(grotesk|geometric|space grotesk)\b/, 'grotesk'],
  [/\b(expressive|artsy|syne|quirky|fashion)\b/, 'expressive'],
  [/\b(friendly|rounded|warm|approachable|playful)\b/, 'friendly'],
  [/\b(clean|modern|neutral|sans)\b/, 'modern'],
];
const RESET = /\b(original|default|reset|go back)\b/;

const MOTION_WORDS = [
  [/\b(no|without|remove|stop|disable)\s+(the\s+)?(animation|animations|motion)\b|\bstatic\b/, 'none'],
  [/\b(from|slide|slides|sliding)\s+(the\s+)?left\b/, 'left'],
  [/\b(from|slide|slides|sliding)\s+(the\s+)?right\b/, 'right'],
  [/\b(drop|from the top|from above|slide down|falls?)\b/, 'down'],
  [/\b(zoom|scale|pop in|grow)\b/, 'zoom'],
  [/\b(rise|fade up|slide up|from (the )?bottom|float up)\b/, 'up'],
  [/\b(animate|animation|animations|animated)\b/, 'up'],
];

const SPEED_WORDS = [
  [/\b(slow|slowly|slower|calm|calmly|gentle|gently|subtle|relaxed)\b/, 'calm'],
  [/\b(fast|faster|quick|quickly|quicker|snappy|punchy)\b/, 'snappy'],
  [/\b(normal|medium) speed\b/, 'normal'],
];

const FIELD_WORDS = [
  [/\b(cyber|security|pentest|hacker|soc analyst|infosec)\b/, 'sentinel'],
  [/\b(ux|ui\/ux|product designer|case stud)/, 'casebook'],
  [/\b(film|cinematic|showreel|reel|video|motion designer|animator)\b/, 'reel'],
  [/\b(gallery|photograph|photos|art portfolio)\b/, 'exhibit'],
  [/\b(swiss|brutal grid|strict grid)\b/, 'grid'],
  [/\b(bold|loud|neo.?brutal|fun|playful layout)\b/, 'punch'],
  [/\b(bento|tiles?)\b/, 'bento'],
  [/\b(magazine layout|journal)\b/, 'journal'],
];

const CV_FIELD_WORDS = [
  [/\b(ats|applicant tracking|plain|simple|no graphics)\b/, 'plain'],
  [/\b(executive|senior|director|leadership|c-suite|ceo|coo|cfo)\b/, 'executive'],
  [/\b(graduate|student|intern|first job|entry level|education first)\b/, 'graduate'],
  [/\b(engineer|developer|technical|software)\b/, 'stack'],
  [/\b(creative|designer|bold|colourful|colorful)\b/, 'canvas'],
  [/\b(timeline|nurse|healthcare|progression)\b/, 'timeline'],
  [/\b(two.?column|sidebar|modern)\b/, 'meridian'],
  [/\b(elegant|luxury|premium|refined)\b/, 'atelier'],
  [/\b(minimal|airy|whitespace|white space)\b/, 'margin'],
  [/\b(traditional|classic|formal|law|finance)\b/, 'classic'],
];

const CASE_FIELD_WORDS = [
  [/\b(research|findings|lab|study|report)\b/, 'lab'],
  [/\b(slides?|deck|presentation|pitch|present)\b/, 'deck'],
  [/\b(numbers?|metrics|results first|impact|kpis?)\b/, 'impact'],
  [/\b(dark|cinematic|dramatic)\b/, 'spotlight'],
  [/\b(visual|images?|gallery|photos?|architecture)\b/, 'showcase'],
  [/\b(technical|engineering|blueprint|developer)\b/, 'blueprint'],
  [/\b(consulting|business|structured|star)\b/, 'framework'],
  [/\b(editorial|magazine|long.?read|story)\b/, 'chronicle'],
  [/\b(swiss|compact|minimal|grid)\b/, 'brief'],
  [/\b(recruiter|scannable|one.?pager|quick read)\b/, 'snapshot'],
];

const SIZE_WORDS = [
  [/\b(compact|smaller (text|font)|tighter|one page|single page|fit on (one|1) page|shorter)\b/, 'compact'],
  [/\b(roomy|bigger (text|font)|larger (text|font)|more space|spacious|easier to read)\b/, 'roomy'],
  [/\b(standard|normal|default) (text )?size\b/, 'normal'],
];

/** Best-effort offline interpretation of a request. `kind` is 'site' or 'cv'. */
export function parseLocally(prompt, current = {}, kind = 'site') {
  const isCv = kind === 'cv';
  const isCase = kind === 'case';
  const catalog = isCv ? CV_CATALOG : isCase ? CASE_CATALOG : TEMPLATE_CATALOG;
  const p = ` ${prompt.toLowerCase()} `;
  const changes = {};
  const brand = {};
  const said = [];

  // Template: explicit name first ("use the reel template"), then field words.
  // CV template names are everyday words ("classic", "plain"), so only count them when used as a name.
  const named = isCv
    ? CV_KEYS.find((k) => new RegExp(`\\b${k}\\s+(template|layout|cv|style)\\b`).test(p) || new RegExp(`\\b(use|switch to|change to|try)\\s+(the\\s+)?${k}\\b`).test(p))
    : (isCase ? CASE_KEYS : TEMPLATE_KEYS).find((k) => new RegExp(`\\b${k}\\b`).test(p));
  const wantsLayout = /\b(template|layout|look like|switch|change (it )?to|i'?m an?|make it (look )?like)\b/.test(p)
    || (isCv && /\b(ats|applicant tracking|two.?column|sidebar|education first)\b/.test(p))
    || (isCase && /\b(slides?|deck|present|presentation|cinematic|lead with the numbers|numbers first|research report|visuals first)\b/.test(p));
  let tpl = named;
  if (!tpl && wantsLayout) tpl = (isCv ? CV_FIELD_WORDS : isCase ? CASE_FIELD_WORDS : FIELD_WORDS).find(([re]) => re.test(p))?.[1];
  if (tpl && tpl !== current.template) { changes.template = tpl; said.push(`switched to ${catalog[tpl].name}`); }

  // Colour: hex, then named colours (longest names first), then "dark mode"-ish.
  const hex = p.match(/#([0-9a-f]{6}|[0-9a-f]{3})\b/);
  if (hex) {
    const h = hex[1].length === 3 ? hex[1].split('').map((c) => c + c).join('') : hex[1];
    brand.accent = `#${h}`;
  } else if (RESET.test(p) && /\bcolou?rs?\b/.test(p)) {
    brand.accent = null;
  } else {
    const name = Object.keys(COLORS).sort((a, b) => b.length - a.length).find((c) => p.includes(` ${c}`));
    if (name) brand.accent = COLORS[name];
  }
  if ('accent' in brand) said.push(brand.accent ? `set the accent to ${brand.accent}` : 'restored the template colour');

  const pf = p.replace(/\b[a-z]+-friendly\b/g, ' '); // "ATS-friendly" isn't a font request
  const font = RESET.test(p) && /\b(fonts?|type|typography)\b/.test(p) ? 'default' : FONT_WORDS.find(([re]) => re.test(pf))?.[1];
  if (font) { brand.font = font; said.push(`changed fonts to ${font === 'default' ? 'the template default' : font}`); }

  if (isCv) {
    const size = SIZE_WORDS.find(([re]) => re.test(p))?.[1];
    if (size) { brand.size = size; said.push(size === 'compact' ? 'made the text more compact' : size === 'roomy' ? 'gave the text more room' : 'set the text to standard size'); }
  }
  const motion = !isCv && MOTION_WORDS.find(([re]) => re.test(p))?.[1];
  if (motion) { brand.motion = motion; said.push(motion === 'none' ? 'turned animation off' : `animated sections ${motion === 'zoom' ? 'with a zoom' : `from the ${motion === 'up' ? 'bottom' : motion === 'down' ? 'top' : motion}`}`); }
  const speed = !isCv && SPEED_WORDS.find(([re]) => re.test(p))?.[1];
  if (speed) { brand.speed = speed; if (!brand.motion && (!current.brand?.motion || current.brand.motion === 'none')) brand.motion = 'up'; said.push(`made the motion ${speed}`); }

  if (Object.keys(brand).length) changes.brand = brand;

  // Text: quoted strings after "tagline" / "role" / "title".
  const quoted = (word) => p.match(new RegExp(`${word}[^"“”']*["“']([^"”']+)["”']`))?.[1];
  const original = (t) => prompt.slice(p.indexOf(t) - 1, p.indexOf(t) - 1 + t.length); // keep the user's casing
  if (isCv) {
    const role = quoted('headline') || quoted('role') || quoted('job title') || quoted('title');
    if (role) { changes.role = original(role); said.push('updated your headline'); }
    const notes = quoted('summary') || quoted('profile');
    if (notes) { changes.notes = original(notes); said.push('updated your summary'); }
  } else {
    const tagline = quoted('tagline') || quoted('headline') || quoted('summary') || quoted('subtitle');
    if (tagline) { changes.tagline = original(tagline); said.push(isCase ? 'updated your summary line' : 'updated your tagline'); }
    const role = quoted('role') || quoted('job title');
    if (role) { changes.role = original(role); said.push('updated your role'); }
  }

  const summary = said.length
    ? `I ${said.join(', ').replace(/, ([^,]*)$/, ' and $1')}.`
    : `I couldn’t find a change to make. Try mentioning a colour, font style, ${isCv ? 'text size' : 'animation'} or template.`;
  return { changes, summary };
}

/**
 * Interpret a request. Uses Claude when the server has it configured,
 * otherwise the local parser. Resolves to { changes, summary, source }.
 */
export async function interpretPrompt(prompt, current, kind = 'site') {
  const local = () => ({ ...parseLocally(prompt, current, kind), source: 'local' });
  if (!isSignedIn()) return local(); // the AI endpoint needs an account
  try {
    const body = await request('/api/customize', { method: 'POST', body: { prompt, current, kind } });
    return { ...body, source: 'ai' };
  } catch (err) {
    // Backend down, AI not configured, signed out, or no API route (static hosting): work offline.
    if (err.offline || err.body?.unavailable || [401, 404, 405].includes(err.status)) return local();
    throw err;
  }
}

export const PROMPT_IDEAS = [
  'Make it feel premium: dark purple accent and elegant serif headings',
  'Use a forest green accent and slide sections in from the left, slowly',
  'Make it bold and playful with a pink accent and snappy motion',
  'Switch to the Reel template, I’m a motion designer',
  'Change my tagline to “Design that ships.”',
  'Go back to the original fonts and colour, no animation',
];

export const CV_PROMPT_IDEAS = [
  'Make it look more senior with a navy accent and serif headings',
  'Make it ATS-friendly and compact so it fits on one page',
  'Switch to a two-column layout with a teal accent',
  'I’m a graduate, put my education first',
  'Change my headline to “Senior product designer”',
  'Go back to the original fonts and colour',
];

export const CASE_PROMPT_IDEAS = [
  'Make it feel like a launch: dark, cinematic, amber accent',
  'Turn it into slides I can present in an interview',
  'Lead with the numbers, emerald accent',
  'Make it editorial with serif headings and a slow fade up',
  'Change my summary line to “Halving the time to book a hospital appointment.”',
  'Go back to the original fonts and colour, no animation',
];
