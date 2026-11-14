import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { LiveSite, SITE_TEMPLATES } from './index.jsx';
import { Glyph } from './shared.jsx';

/* Device widths for the responsive preview. `null` = fill the stage. */
const DEVICES = [
  ['fit', 'Fit', null],
  ['desktop', 'Desktop', 1280],
  ['tablet', 'Tablet', 768],
  ['mobile', 'Mobile', 390],
];
const MIN_W = 320;

/**
 * Full-size template viewer.
 * - Full screen / exit full screen (browser Fullscreen API, with a fallback).
 * - Device presets plus drag handles to resize the page freely, so you can
 *   watch the layout respond as it shrinks or grows.
 * - Optional previous/next stepping between templates.
 */
export default function TemplateViewer({ template, data, title, subtitle, actions, onClose, onStep, render, info }) {
  const rootRef = useRef(null);
  const stageRef = useRef(null);
  const frameRef = useRef(null);
  const [device, setDevice] = useState('fit');
  const [width, setWidth] = useState(null);       // px, or null to fill
  const [stageW, setStageW] = useState(0);        // usable stage width
  const [full, setFull] = useState(false);        // browser full screen
  const [maxed, setMaxed] = useState(false);      // fallback "full screen"
  const [dragging, setDragging] = useState(false);
  const isFull = full || maxed;
  const t = info || SITE_TEMPLATES[template];

  /* Track the stage's usable width; the page width is derived from it, so the
     readout is exact immediately (even while the frame animates). */
  useLayoutEffect(() => {
    const el = stageRef.current;
    const measure = () => {
      const cs = getComputedStyle(el);
      setStageW(Math.floor(el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const shown = Math.round(width ? Math.min(width, stageW) : stageW);

  /* Full screen */
  const toggleFull = useCallback(async () => {
    const el = rootRef.current;
    if (document.fullscreenElement) { await document.exitFullscreen?.(); return; }
    if (maxed) { setMaxed(false); return; }
    if (el?.requestFullscreen) {
      try { await el.requestFullscreen(); return; } catch { /* fall through to the CSS fallback */ }
    }
    setMaxed(true);
  }, [maxed]);

  useEffect(() => {
    const onFs = () => setFull(document.fullscreenElement === rootRef.current);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  /* Keyboard: Esc closes (the browser exits full screen first), F toggles
     full screen, arrows step between templates. */
  const latest = useRef({});
  latest.current = { maxed, onClose, onStep, toggleFull };
  useEffect(() => {
    const onKey = (e) => {
      const { maxed: isMaxed, onClose: close, onStep: step, toggleFull: toggle } = latest.current;
      if (e.target.closest?.('input, textarea')) return;
      if (e.key === 'Escape' && !document.fullscreenElement) { if (isMaxed) setMaxed(false); else close(); }
      if (e.key === 'f' || e.key === 'F') toggle();
      if (step && e.key === 'ArrowRight') step(1);
      if (step && e.key === 'ArrowLeft') step(-1);
    };
    document.addEventListener('keydown', onKey);
    // Lock page scroll while the viewer is open (once, so it always restores)
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, []);

  /* Leaving the viewer always leaves full screen too. */
  useEffect(() => () => { if (document.fullscreenElement) document.exitFullscreen?.(); }, []);

  const pick = (key, w) => { setDevice(key); setWidth(w); };

  /* Drag either edge; the frame is centred, so each pixel moved changes the
     width by two. */
  const startDrag = (side) => (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = shown;
    const maxW = stageW;
    setDragging(true);
    setDevice('custom');
    const move = (ev) => {
      const dx = (ev.clientX - startX) * (side === 'right' ? 1 : -1);
      setWidth(Math.round(Math.min(maxW, Math.max(MIN_W, startW + dx * 2))));
    };
    const up = () => {
      setDragging(false);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const nudge = (dir) => {
    const cur = shown;
    setDevice('custom');
    setWidth(Math.min(stageW, Math.max(MIN_W, cur + dir * 40)));
  };

  const breakpoint = shown <= 480 ? 'Mobile' : shown <= 900 ? 'Tablet' : 'Desktop';

  return (
    <div
      ref={rootRef}
      className={`tview ${isFull ? 'is-full' : ''} ${dragging ? 'is-dragging' : ''}`}
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
            <div className="seg tview__seg" role="tablist" aria-label="Preview size">
              {DEVICES.map(([key, label, w]) => (
                <button key={key} role="tab" aria-selected={device === key} className={`seg__btn ${device === key ? 'is-active' : ''}`} onClick={() => pick(key, w)}>{label}</button>
              ))}
            </div>
            <div className="tview__size" aria-live="polite">
              <button className="tview__nudge" onClick={() => nudge(-1)} aria-label="Make narrower">−</button>
              <span><b>{shown}</b>px · {breakpoint}</span>
              <button className="tview__nudge" onClick={() => nudge(1)} aria-label="Make wider">+</button>
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

        <div ref={stageRef} className="tview__stage">
          <div ref={frameRef} className={`tview__frame ${shown && shown <= 480 ? 'is-phone' : ''}`} style={{ width: width ? `${width}px` : '100%' }}>
            <button className="tview__handle tview__handle--l" onPointerDown={startDrag('left')} onDoubleClick={() => pick('fit', null)} aria-label="Drag to resize" />
            {render ? render() : <LiveSite template={template} data={data} />}
            <button className="tview__handle tview__handle--r" onPointerDown={startDrag('right')} onDoubleClick={() => pick('fit', null)} aria-label="Drag to resize" />
          </div>
        </div>
      </div>
    </div>
  );
}
