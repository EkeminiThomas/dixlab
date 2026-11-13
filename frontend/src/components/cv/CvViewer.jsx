import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CvDoc, CV_TEMPLATES, PAGE_W, PAGE_H } from './index.jsx';
import { Glyph } from '../sites/shared.jsx';

const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5];

/**
 * Full-size CV viewer: zoom (fit, or 50–150%), full screen, page guides and
 * optional previous/next stepping between templates.
 */
export default function CvViewer({ template, data, title, subtitle, actions, onClose, onStep }) {
  const rootRef = useRef(null);
  const stageRef = useRef(null);
  const pageRef = useRef(null);
  const [zoom, setZoom] = useState('fit');
  const [stageW, setStageW] = useState(0);
  const [docH, setDocH] = useState(PAGE_H);
  const [full, setFull] = useState(false);
  const [maxed, setMaxed] = useState(false);
  const isFull = full || maxed;
  const t = CV_TEMPLATES[template];

  useLayoutEffect(() => {
    const stage = stageRef.current;
    const measure = () => {
      const cs = getComputedStyle(stage);
      setStageW(stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight));
      if (pageRef.current) setDocH(pageRef.current.offsetHeight);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(stage);
    if (pageRef.current) ro.observe(pageRef.current);
    return () => ro.disconnect();
  }, [template]);

  const fit = stageW ? Math.min(1.25, stageW / PAGE_W) : 1;
  const z = zoom === 'fit' ? fit : zoom;
  const pages = Math.max(1, Math.ceil((docH - 4) / PAGE_H));

  const step = (dir) => {
    const cur = zoom === 'fit' ? fit : zoom;
    const next = dir > 0 ? ZOOMS.find((v) => v > cur + 0.01) : [...ZOOMS].reverse().find((v) => v < cur - 0.01);
    if (next) setZoom(next);
  };

  const toggleFull = useCallback(async () => {
    const el = rootRef.current;
    if (document.fullscreenElement) { await document.exitFullscreen?.(); return; }
    if (maxed) { setMaxed(false); return; }
    if (el?.requestFullscreen) { try { await el.requestFullscreen(); return; } catch { /* fallback below */ } }
    setMaxed(true);
  }, [maxed]);

  useEffect(() => {
    const onFs = () => setFull(document.fullscreenElement === rootRef.current);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  const latest = useRef({});
  latest.current = { maxed, onClose, onStep, toggleFull, step };
  useEffect(() => {
    const onKey = (e) => {
      const L = latest.current;
      if (e.target.closest?.('input, textarea')) return;
      if (e.key === 'Escape' && !document.fullscreenElement) { if (L.maxed) setMaxed(false); else L.onClose(); }
      if (e.key === 'f' || e.key === 'F') L.toggleFull();
      if (e.key === '+' || e.key === '=') L.step(1);
      if (e.key === '-') L.step(-1);
      if (e.key === '0') setZoom('fit');
      if (L.onStep && e.key === 'ArrowRight') L.onStep(1);
      if (L.onStep && e.key === 'ArrowLeft') L.onStep(-1);
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, []);
  useEffect(() => () => { if (document.fullscreenElement) document.exitFullscreen?.(); }, []);

  return (
    <div
      ref={rootRef}
      className={`tview cvview ${isFull ? 'is-full' : ''}`}
      role="dialog" aria-modal="true" aria-label={`${title || t?.name} preview`}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="tview__panel">
        <header className="tview__bar">
          <div className="tview__title">
            {onStep && <button className="tview__icon" onClick={() => onStep(-1)} aria-label="Previous template"><Glyph name="prev" /></button>}
            <div><strong>{title || t?.name}</strong><span>{subtitle ?? t?.desc}</span></div>
            {onStep && <button className="tview__icon" onClick={() => onStep(1)} aria-label="Next template"><Glyph name="next" /></button>}
          </div>

          <div className="tview__mid">
            <div className="tview__size" aria-live="polite">
              <button className="tview__nudge" onClick={() => step(-1)} aria-label="Zoom out">−</button>
              <span><b>{Math.round(z * 100)}%</b> · A4 · {pages} page{pages === 1 ? '' : 's'}</span>
              <button className="tview__nudge" onClick={() => step(1)} aria-label="Zoom in">+</button>
            </div>
            <div className="seg tview__seg" role="group" aria-label="Zoom">
              <button className={`seg__btn ${zoom === 'fit' ? 'is-active' : ''}`} aria-pressed={zoom === 'fit'} onClick={() => setZoom('fit')}>Fit</button>
              <button className={`seg__btn ${zoom === 1 ? 'is-active' : ''}`} aria-pressed={zoom === 1} onClick={() => setZoom(1)}>100%</button>
            </div>
          </div>

          <div className="tview__actions">
            {actions}
            <button className="tview__icon tview__icon--label" onClick={toggleFull} aria-pressed={isFull} title={isFull ? 'Exit full screen (F)' : 'Full screen (F)'}>
              <Glyph name={isFull ? 'min' : 'max'} />
              <span>{isFull ? 'Exit full screen' : 'Full screen'}</span>
            </button>
            <button className="tview__icon" onClick={onClose} aria-label="Close preview" title="Close (Esc)"><Glyph name="close" /></button>
          </div>
        </header>

        <div ref={stageRef} className="tview__stage cvview__stage">
          <div className="cvview__paper" style={{ width: PAGE_W * z, height: docH * z }}>
            <div ref={pageRef} className="cvview__page" style={{ transform: `scale(${z})` }}>
              <CvDoc template={template} data={data} />
              {Array.from({ length: pages - 1 }, (_, i) => (
                <span key={i} className="cvview__break" style={{ top: PAGE_H * (i + 1) }}><em>Page {i + 2}</em></span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
