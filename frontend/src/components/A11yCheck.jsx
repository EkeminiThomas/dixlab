import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/* ---------- colour maths (WCAG 2.2) ---------- */

function parseColor(s) {
  const m = /rgba?\(([^)]+)\)/.exec(s || '');
  if (!m) return null;
  const [r, g, b, a = 1] = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
  return [r, g, b, Number.isNaN(a) ? 1 : a];
}
const over = (top, under) => {
  const a = top[3] + under[3] * (1 - top[3]);
  if (!a) return [255, 255, 255, 0];
  return [0, 1, 2].map((i) => (top[i] * top[3] + under[i] * under[3] * (1 - top[3])) / a).concat(a);
};
const lum = ([r, g, b]) => {
  const c = [r, g, b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const hex = ([r, g, b]) => `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

/** The colour behind an element, or null when there's an image or gradient we can't measure. */
function backdrop(el, stop) {
  const layers = [];
  for (let n = el; n && n !== stop.parentElement; n = n.parentElement) {
    const cs = getComputedStyle(n);
    if (cs.backgroundImage && cs.backgroundImage !== 'none') return null;
    const c = parseColor(cs.backgroundColor);
    if (c && c[3] > 0) { layers.push(c); if (c[3] >= 1) break; }
  }
  return layers.reverse().reduce((acc, c) => over(c, acc), [255, 255, 255, 1]);
}

const VAGUE = /^(click here|here|read more|more|link|this|learn more|see more|view|open)$/i;
const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; };
// Editor chrome around the preview (its header, this panel) isn't part of the page.
const hidden = (el) => Boolean(el.closest('[aria-hidden="true"], [hidden], .ed__preview-head, .a11y'));

/**
 * Checks a rendered page for the most common accessibility problems.
 * Returns issues: { id, level: 'fix' | 'improve', title, help, items: [{ el, text }] }.
 */
export function auditDom(root, project = {}) {
  const issues = [];
  const add = (id, level, title, help, items) => { if (items.length) issues.push({ id, level, title, help, items }); };

  // 1. Text contrast
  const low = new Map();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let t = walker.nextNode(); t; t = walker.nextNode()) {
    const text = t.textContent.trim();
    const el = t.parentElement;
    if (!text || !el || hidden(el) || !visible(el)) continue;
    const cs = getComputedStyle(el);
    if (Number(cs.opacity) === 0) continue;
    const fg = parseColor(cs.color);
    const bg = backdrop(el, root);
    if (!fg || !bg) continue;
    const size = parseFloat(cs.fontSize);
    const large = size >= 24 || (size >= 18.66 && Number(cs.fontWeight) >= 700);
    const r = ratio(over(fg, bg), bg);
    if (r < (large ? 3 : 4.5)) {
      const key = `${hex(fg)}|${hex(bg)}`;
      if (!low.has(key)) low.set(key, { el, text: `“${text.slice(0, 50)}” · ${r.toFixed(1)}:1 (needs ${large ? 3 : 4.5}:1), ${hex(over(fg, bg))} on ${hex(bg)}` });
    }
  }
  add('contrast', 'fix', 'Text that’s hard to read', 'Some text doesn’t stand out enough from its background. Pick a darker or lighter colour in Customize, or a different template colour.', [...low.values()]);

  // 2. Images without a description
  const imgs = [...root.querySelectorAll('img')].filter((i) => !hidden(i) && i.getAttribute('role') !== 'presentation');
  add('alt', 'fix', 'Images without a description', 'Screen readers can’t describe these images. Add a caption to each image or video in your projects.',
    imgs.filter((i) => !i.hasAttribute('alt') || /\.(png|jpe?g|webp|gif|svg)$/i.test(i.alt) || /^(image|img|photo|picture)$/i.test(i.alt.trim()))
      .map((i) => ({ el: i, text: i.alt ? `Described as “${i.alt}”` : 'No description' })));

  // 3. Links and buttons with no name, or a vague one
  const named = (el) => (el.getAttribute('aria-label') || el.textContent || [...el.querySelectorAll('img[alt]')].map((i) => i.alt).join(' ') || el.title || '').trim();
  const controls = [...root.querySelectorAll('a[href], button')].filter((el) => !hidden(el) && visible(el));
  add('names', 'fix', 'Links or buttons without a name', 'People using screen readers hear only “link” or “button”. Give icon links a label (for example, your social links).',
    controls.filter((el) => !named(el)).map((el) => ({ el, text: el.tagName === 'A' ? (el.getAttribute('href') || '').slice(0, 60) : 'Button' })));
  add('vague', 'improve', 'Links that don’t say where they go', '“Click here” or “Read more” on its own isn’t clear out of context. Name the destination, like “Read the Ledger case study”.',
    controls.filter((el) => VAGUE.test(named(el))).map((el) => ({ el, text: `“${named(el)}”` })));

  // 4. Headings
  const hs = [...root.querySelectorAll('h1, h2, h3, h4, h5, h6')].filter((h) => !hidden(h) && visible(h) && h.textContent.trim());
  const skips = [];
  hs.forEach((h, i) => {
    const lvl = +h.tagName[1]; const prev = i ? +hs[i - 1].tagName[1] : 0;
    if (prev && lvl > prev + 1) skips.push({ el: h, text: `h${prev} → h${lvl}: “${h.textContent.trim().slice(0, 50)}”` });
  });
  if (hs.length && !hs.some((h) => h.tagName === 'H1')) skips.unshift({ el: hs[0], text: 'There’s no main heading (h1)' });
  add('headings', 'improve', 'Heading order', 'Headings help people skim and navigate. This usually comes from the template; mention it to us if it bothers you.', skips);

  // 5. Very small text
  const tiny = new Map();
  root.querySelectorAll('p, span, li, a, small, em, b, strong, td, figcaption, label').forEach((el) => {
    if (hidden(el) || !visible(el) || !el.textContent.trim()) return;
    const size = parseFloat(getComputedStyle(el).fontSize);
    if (size < 11 && !tiny.has(size)) tiny.set(size, { el, text: `${size.toFixed(1)}px: “${el.textContent.trim().slice(0, 40)}”` });
  });
  add('small', 'improve', 'Very small text', 'Text under 11px is hard to read, especially on phones. Try a larger text size in Customize.', [...tiny.values()]);

  // 6. Content: media without captions (captions become the description)
  const media = [...(project.projects || []).flatMap((p) => (p.media || []).map((m) => ({ m, where: p.title || 'a project' }))),
    ...(project.gallery || []).map((m) => ({ m, where: 'supporting visuals' }))];
  add('captions', 'improve', 'Images without captions', 'Captions describe your images to screen readers and to recruiters skimming fast.',
    media.filter(({ m }) => m && m.src && !String(m.caption || m.alt || '').trim()).map(({ where }) => ({ el: null, text: `An image in ${where}` })));

  return issues;
}

/** "Accessibility" in the editor: checks the live preview and points at each problem. */
export default function A11yCheck({ targetSelector, project }) {
  const [issues, setIssues] = useState(null);
  const lastHighlight = useRef(null);

  const run = () => {
    const root = document.querySelector(targetSelector);
    if (root) setIssues(auditDom(root, project));
  };
  const close = () => { clear(); setIssues(null); };
  const clear = () => { lastHighlight.current?.classList.remove('a11y-flash'); lastHighlight.current = null; };
  const show = (el) => {
    clear();
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.classList.add('a11y-flash');
    lastHighlight.current = el;
  };
  useEffect(() => () => clear(), []);
  useEffect(() => {
    if (!issues) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [issues]); // eslint-disable-line react-hooks/exhaustive-deps

  const fixes = issues?.filter((i) => i.level === 'fix').length || 0;
  return (
    <>
      <button className="ed__expand" onClick={run} title="Check colour contrast, image descriptions, link names and more">Accessibility</button>
      {issues && createPortal(
        <div className="a11y" role="dialog" aria-modal="false" aria-labelledby="a11y-t">
          <div className="a11y__head">
            <h2 id="a11y-t">{issues.length === 0 ? 'No problems found' : fixes ? `${fixes} thing${fixes > 1 ? 's' : ''} to fix` : 'Looks good, a few ideas'}</h2>
            <button className="pub-dlg__x" onClick={close} aria-label="Close">×</button>
          </div>
          <p className="a11y__lead">{issues.length === 0
            ? 'Contrast, image descriptions, link names, headings and text size all pass. Nice.'
            : 'Accessible pages work for more people, and recruiters read them faster too. Click an item to see it in the preview.'}</p>
          <ul className="a11y__list">
            {issues.map((i) => (
              <li key={i.id} className={`a11y__item is-${i.level}`}>
                <p className="a11y__t"><em>{i.level === 'fix' ? 'Fix' : 'Improve'}</em>{i.title} <span>({i.items.length})</span></p>
                <p className="a11y__help">{i.help}</p>
                <ul className="a11y__els">
                  {i.items.slice(0, 5).map((x, k) => (
                    <li key={k}>{x.el ? <button type="button" onClick={() => show(x.el)}>{x.text}</button> : <span>{x.text}</span>}</li>
                  ))}
                  {i.items.length > 5 && <li><span>and {i.items.length - 5} more</span></li>}
                </ul>
              </li>
            ))}
          </ul>
          <button type="button" className="app-btn app-btn--ghost" onClick={run}>Check again</button>
        </div>,
        document.body,
      )}
    </>
  );
}
