/* ==========================================================================
   Helpers for the 3D templates (Blocks, Depth). The 3D itself is plain CSS
   (perspective + preserve-3d, styled in three.css); this only feeds the
   pointer position to CSS so scenes can tilt toward it.
   ========================================================================== */
import { useContext, useEffect, useRef } from 'react';
import { StaticSite } from './shared.jsx';

/**
 * Pointer tilt: sets --px and --py (-1..1) on the element while the pointer
 * moves over it, and eases back to 0 when it leaves. CSS multiplies them by
 * --tilt-k (0 when the owner turned tilt off, or the visitor prefers reduced
 * motion), so this never needs to know about those settings.
 * Skipped in thumbnails and on devices without a hovering pointer.
 */
export function usePointerTilt() {
  const ref = useRef(null);
  const isStatic = useContext(StaticSite);
  useEffect(() => {
    const el = ref.current;
    if (!el || isStatic || typeof window === 'undefined') return undefined;
    if (!window.matchMedia?.('(hover: hover)').matches) return undefined;
    let frame = 0;
    let next = null;
    const flush = () => {
      frame = 0;
      if (!next) return;
      el.style.setProperty('--px', next[0].toFixed(3));
      el.style.setProperty('--py', next[1].toFixed(3));
    };
    const queue = (v) => { next = v; if (!frame) frame = requestAnimationFrame(flush); };
    const move = (e) => {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const x = ((e.clientX - r.left) / r.width) * 2 - 1;
      const y = ((e.clientY - r.top) / r.height) * 2 - 1;
      queue([Math.max(-1, Math.min(1, x)), Math.max(-1, Math.min(1, y))]);
    };
    const leave = () => queue([0, 0]);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerleave', leave);
    return () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerleave', leave);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [isStatic]);
  return ref;
}

/** Scroll to a section inside the template (works inside the editor's scroll box too). */
export function scrollToPart(root, name) {
  const el = root?.querySelector(`[data-part="${name}"]`);
  if (!el) return;
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
}
