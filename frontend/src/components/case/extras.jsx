/* ==========================================================================
   Case study extras, shared by every template:
   - Embeds: Figma files and prototypes, YouTube, Loom and Vimeo, played in
     place. Only these providers, and the player address is built here from
     the link (never taken from the link itself), so nothing else can be
     framed. Other links become a plain link card.
   - Before / after: drag (or use the arrow keys) to compare two images.
   - Count-up results: numbers count up once when they scroll into view.
   - Reading time and contents: a slim bar above the case study.
   ========================================================================== */
import { useContext, useEffect, useRef, useState } from 'react';
import { safeHref, safeSrc } from '../../safeUrl.js';
import { StaticSite } from '../sites/shared.jsx';

/* ---------- Embeds ---------- */

/** {kind, src} for links we can play in place, else null. */
export function embedFor(url) {
  const u = String(url || '').trim();
  let m;
  if ((m = /^https?:\/\/(?:www\.)?figma\.com\/(file|design|proto|board|slides|deck)\/[A-Za-z0-9]+/i.exec(u))) {
    return { kind: 'Figma', src: `https://www.figma.com/embed?embed_host=dixlab&url=${encodeURIComponent(u)}`, ratio: '16 / 10' };
  }
  if ((m = /^https?:\/\/(?:www\.)?(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,15})/i.exec(u))) {
    return { kind: 'YouTube', src: `https://www.youtube-nocookie.com/embed/${m[1]}`, ratio: '16 / 9' };
  }
  if ((m = /^https?:\/\/(?:www\.)?loom\.com\/share\/([a-f0-9]{16,40})/i.exec(u))) {
    return { kind: 'Loom', src: `https://www.loom.com/embed/${m[1]}`, ratio: '16 / 9' };
  }
  if ((m = /^https?:\/\/(?:www\.)?vimeo\.com\/(\d{4,12})/i.exec(u))) {
    return { kind: 'Vimeo', src: `https://player.vimeo.com/video/${m[1]}`, ratio: '16 / 9' };
  }
  return null;
}

export function Embeds({ items = [] }) {
  const staticSite = useContext(StaticSite); // thumbnails and print: no live players
  const list = items.filter((e) => e?.url && (embedFor(e.url) || safeHref(e.url)));
  if (!list.length) return null;
  return (
    <div className="cs-embeds">
      {list.map((e, i) => {
        const em = embedFor(e.url);
        const title = e.title || (em ? `${em.kind} ${em.kind === 'Figma' ? 'file' : 'video'}` : 'Project link');
        if (em && !staticSite) {
          return (
            <figure key={i} className="cs-embed">
              <div className="cs-embed__frame" style={{ aspectRatio: em.ratio }}>
                <iframe src={em.src} title={title} loading="lazy" allowFullScreen referrerPolicy="strict-origin-when-cross-origin"
                  sandbox="allow-scripts allow-same-origin allow-popups allow-presentation"
                  allow="fullscreen; picture-in-picture; encrypted-media" />
              </div>
              {e.title && <figcaption>{e.title}</figcaption>}
            </figure>
          );
        }
        const href = safeHref(e.url);
        return href && (
          <a key={i} className="cs-linkcard" href={href} target="_blank" rel="noopener noreferrer">
            <span className="cs-linkcard__k">{em ? em.kind : hostOf(href)}</span>
            <b>{e.title || href.replace(/^https?:\/\/(www\.)?/, '').slice(0, 80)}</b>
            <span aria-hidden>↗</span>
          </a>
        );
      })}
    </div>
  );
}

const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return 'Link'; } };

/* ---------- Before / after ---------- */

export function BeforeAfter({ compare }) {
  const [pos, setPos] = useState(50);
  const box = useRef(null);
  const dragging = useRef(false);
  const before = safeSrc(compare?.before?.src);
  const after = safeSrc(compare?.after?.src);
  if (!before || !after) return null;
  const move = (clientX) => {
    const r = box.current?.getBoundingClientRect();
    if (r) setPos(Math.min(100, Math.max(0, ((clientX - r.left) / r.width) * 100)));
  };
  return (
    <figure className="cs-ba">
      <div className="cs-ba__box" ref={box}
        onPointerDown={(e) => { dragging.current = true; e.currentTarget.setPointerCapture(e.pointerId); move(e.clientX); }}
        onPointerMove={(e) => dragging.current && move(e.clientX)}
        onPointerUp={() => { dragging.current = false; }}>
        <img src={after} alt={compare.afterLabel || 'After'} draggable={false} />
        <div className="cs-ba__before" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
          <img src={before} alt={compare.beforeLabel || 'Before'} draggable={false} />
        </div>
        <span className="cs-ba__tag cs-ba__tag--l">{compare.beforeLabel || 'Before'}</span>
        <span className="cs-ba__tag cs-ba__tag--r">{compare.afterLabel || 'After'}</span>
        <div className="cs-ba__handle" style={{ left: `${pos}%` }} aria-hidden><i /></div>
        <input className="cs-ba__range" type="range" min="0" max="100" value={Math.round(pos)} onChange={(e) => setPos(Number(e.target.value))}
          aria-label={`Compare ${compare.beforeLabel || 'before'} and ${compare.afterLabel || 'after'}`} />
      </div>
      {compare.caption && <figcaption>{compare.caption}</figcaption>}
    </figure>
  );
}

/* ---------- Count-up results ---------- */

const NUM = /^([^\d−-]*)([−-]?)(\d+(?:[.,]\d+)?)(.*)$/;

/** "−38%", "54s", "1.2m", "+40%": the number counts up once it's on screen. */
export function CountUp({ value }) {
  const staticSite = useContext(StaticSite);
  const ref = useRef(null);
  const m = NUM.exec(String(value || '').trim());
  const target = m ? parseFloat(m[3].replace(',', '.')) : null;
  const decimals = m && m[3].includes('.') ? m[3].split('.')[1].length : 0;
  const [shown, setShown] = useState(target);
  useEffect(() => {
    if (target == null || staticSite || !ref.current) return undefined;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined;
    setShown(0);
    let raf = 0;
    const io = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      io.disconnect();
      const t0 = performance.now();
      const tick = (t) => {
        const k = Math.min(1, (t - t0) / 1100);
        setShown(target * (1 - (1 - k) ** 3));
        if (k < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, { threshold: 0.4 });
    io.observe(ref.current);
    return () => { io.disconnect(); cancelAnimationFrame(raf); };
  }, [target, staticSite]);
  if (!m) return <>{value}</>;
  return <span ref={ref}>{m[1]}{m[2]}{(shown ?? target).toFixed(decimals)}{m[4]}</span>;
}

/* ---------- Reading time and contents ---------- */

const words = (v) => String(v || '').split(/\s+/).filter(Boolean).length;

export function readMinutes(d) {
  const n = words(d.context) + words(d.problem) + words(d.research) + words(d.contribution) + words(d.tradeoffs)
    + words(d.solution) + words(d.learned) + words(d.next) + (d.process || []).reduce((a, s) => a + words(s.title) + words(s.desc), 0);
  return Math.max(1, Math.round(n / 220));
}

/** "6 min read · Contents: Problem · Process · Results". Links to the case study's section headings. */
export function CaseMeta({ data }) {
  const bar = useRef(null);
  const [sections, setSections] = useState([]);
  useEffect(() => {
    const root = bar.current?.nextElementSibling;
    if (!root) return undefined;
    const scan = () => {
      const seen = new Set();
      const found = [...root.querySelectorAll('.cs-h')].map((h) => {
        const label = (h.textContent || '').replace(/^[\d§.\s]+/, '').trim();
        let id = `cs-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
        while (seen.has(id)) id += '-2';
        seen.add(id);
        (h.closest('section') || h).id = id;
        return { id, label };
      }).filter((s) => s.label);
      setSections(found.slice(0, 8));
    };
    scan();
    const mo = new MutationObserver(scan);
    mo.observe(root, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, []);
  return (
    <nav className="cs-meta" ref={bar} aria-label="About this case study">
      <span className="cs-meta__time">{readMinutes(data)} min read</span>
      {sections.length > 1 && (
        <span className="cs-meta__toc">
          {sections.map((s) => <a key={s.id} href={`#${s.id}`} onClick={(e) => { e.preventDefault(); document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>{s.label}</a>)}
        </span>
      )}
    </nav>
  );
}
