import { AbsoluteFill, Easing, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { loadFont as loadSerif } from '@remotion/google-fonts/InstrumentSerif';
import { loadFont as loadSans } from '@remotion/google-fonts/InstrumentSans';
import { loadFont as loadMono } from '@remotion/google-fonts/RobotoMono';

/* Dixlab's own type and colours (from the app's theme). */
export const serif = loadSerif('normal', { weights: ['400'], subsets: ['latin'] }).fontFamily;
loadSerif('italic', { weights: ['400'], subsets: ['latin'] });
export const sans = loadSans('normal', { weights: ['400', '500', '600'], subsets: ['latin'] }).fontFamily;
export const mono = loadMono('normal', { weights: ['400', '500'], subsets: ['latin'] }).fontFamily;

export const C = {
  bg: '#08080a', ink: '#f4f4f5', muted: '#a1a1aa', faint: '#71717a',
  accent: '#9d95ff', accentDeep: '#7b5cff', line: 'rgba(255,255,255,0.1)', panel: '#111113',
};

export const ease = Easing.bezier(0.22, 1, 0.36, 1);
export const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' };

/** 0→1 over [start, end] frames with the house easing. */
export function useProgress(start, end) {
  const f = useCurrentFrame();
  return interpolate(f, [start, end], [0, 1], { ...clamp, easing: ease });
}

/** Fade a whole scene in and out at its edges. */
export function SceneFade({ duration, inFor = 14, outFor = 14, children }) {
  const f = useCurrentFrame();
  const o = interpolate(f, [0, inFor, duration - outFor, duration], [0, 1, 1, 0], clamp);
  return <AbsoluteFill style={{ opacity: o }}>{children}</AbsoluteFill>;
}

/** The dark stage with a slow-moving lavender glow and a faint grid, like the app's landing page. */
export function Backdrop() {
  const f = useCurrentFrame();
  const x = 50 + Math.sin(f / 90) * 12;
  const y = 30 + Math.cos(f / 120) * 8;
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      <AbsoluteFill style={{ background: `radial-gradient(900px 600px at ${x}% ${y}%, rgba(123,92,255,0.22), transparent 70%)` }} />
      <AbsoluteFill style={{
        backgroundImage: 'linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)',
        backgroundSize: '64px 64px', maskImage: 'radial-gradient(ellipse at center, black 30%, transparent 75%)',
        WebkitMaskImage: 'radial-gradient(ellipse at center, black 30%, transparent 75%)',
      }} />
    </AbsoluteFill>
  );
}

/** A browser window around a real screenshot (captured at 2880×1800). */
export function Browser({ src, width, url = 'dixlab.app', style, imgStyle, children }) {
  const bar = Math.round(width * 0.028);
  return (
    <div style={{ width, borderRadius: width * 0.012, overflow: 'hidden', background: C.panel, border: `1px solid ${C.line}`,
      boxShadow: '0 60px 120px -40px rgba(0,0,0,0.9), 0 0 0 1px rgba(255,255,255,0.04)', ...style }}>
      <div style={{ height: bar, display: 'flex', alignItems: 'center', gap: bar * 0.22, padding: `0 ${bar * 0.5}px`, background: '#0c0c0e', borderBottom: `1px solid ${C.line}` }}>
        {['#ff5f57', '#febc2e', '#28c840'].map((c) => <span key={c} style={{ width: bar * 0.3, height: bar * 0.3, borderRadius: '50%', background: c, opacity: 0.8 }} />)}
        <span style={{ marginLeft: bar * 0.6, padding: `${bar * 0.08}px ${bar * 0.5}px`, borderRadius: 999, background: 'rgba(255,255,255,0.06)', color: C.faint, fontFamily: mono, fontSize: bar * 0.36 }}>{url}</span>
      </div>
      <div style={{ position: 'relative' }}>
        <Img src={staticFile(src)} style={{ display: 'block', width: '100%', ...imgStyle }} />
        {children}
      </div>
    </div>
  );
}

/** A phone around a mobile screenshot (390×844 at 3×). */
export function Phone({ src, width, style }) {
  return (
    <div style={{ width, padding: width * 0.035, borderRadius: width * 0.16, background: '#18181b', border: '1px solid rgba(255,255,255,0.12)',
      boxShadow: '0 60px 120px -30px rgba(0,0,0,0.95)', ...style }}>
      <div style={{ borderRadius: width * 0.13, overflow: 'hidden', aspectRatio: '390 / 844', background: '#fff' }}>
        <Img src={staticFile(src)} style={{ display: 'block', width: '100%' }} />
      </div>
    </div>
  );
}

/** Kicker, headline and line of support text, animated word by word. */
export function Caption({ step, title, sub, at = 6, align = 'left', size = 84, maxWidth = 720, style }) {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const words = title.split(' ');
  const k = spring({ frame: f - at, fps, config: { damping: 200 } });
  return (
    <div style={{ maxWidth, textAlign: align, ...style }}>
      {step && (
        <p style={{ margin: 0, fontFamily: mono, fontSize: 22, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.accent, opacity: k, transform: `translateY(${(1 - k) * 12}px)` }}>
          {step}
        </p>
      )}
      <h1 style={{ margin: '18px 0 0', fontFamily: serif, fontWeight: 400, fontSize: size, lineHeight: 1.02, letterSpacing: '-0.02em', color: C.ink }}>
        {words.map((w, i) => {
          const s = spring({ frame: f - at - 4 - i * 3, fps, config: { damping: 200, mass: 0.8 } });
          return (
            <span key={i} style={{ display: 'inline-block', marginRight: '0.24em', opacity: s, transform: `translateY(${(1 - s) * 34}px)` }}>{w}</span>
          );
        })}
      </h1>
      {sub && (
        <p style={{ margin: '22px 0 0', fontFamily: sans, fontSize: 28, lineHeight: 1.45, color: C.muted, opacity: spring({ frame: f - at - 14, fps, config: { damping: 200 } }) }}>
          {sub}
        </p>
      )}
    </div>
  );
}
