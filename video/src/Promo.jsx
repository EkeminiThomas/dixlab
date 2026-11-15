import { AbsoluteFill, Img, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { Backdrop, Browser, Caption, C, Phone, SceneFade, clamp, ease, mono, sans, serif } from './kit.jsx';

/* Dixlab promo, 1920×1080 at 30fps. Every screen is a real capture of the app
   (sample person "Maya Chen"); see ../README.md for how to re-capture them. */

export const SCENES = [
  ['intro', 120], ['talk', 180], ['write', 180], ['templates', 200],
  ['customize', 180], ['publish', 180], ['noticed', 220], ['outro', 140],
];
export const DURATION = SCENES.reduce((a, [, d]) => a + d, 0);

export function Promo() {
  let at = 0;
  const parts = { intro: Intro, talk: Talk, write: Write, templates: Templates, customize: Customize, publish: Publish, noticed: Noticed, outro: Outro };
  return (
    <AbsoluteFill style={{ background: C.bg, fontFamily: sans }}>
      <Backdrop />
      {SCENES.map(([name, d]) => {
        const Part = parts[name];
        const from = at;
        at += d;
        return (
          <Sequence key={name} from={from} durationInFrames={d} name={name}>
            <SceneFade duration={d}><Part d={d} /></SceneFade>
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
}

/* ---------------------------------------------------------------- scenes */

function Intro() {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const logo = spring({ frame: f, fps, config: { damping: 200 } });
  const words = [['Turn', false], ['your', false], ['work', false], ['into', false], ['opportunities.', true]];
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
      <Img src={staticFile('logo.svg')} style={{ width: 230, opacity: logo, transform: `translateY(${(1 - logo) * -20}px)`, marginBottom: 54 }} />
      <h1 style={{ margin: 0, fontFamily: serif, fontWeight: 400, fontSize: 132, lineHeight: 1, letterSpacing: '-0.025em', color: C.ink, textAlign: 'center' }}>
        {words.map(([w, accent], i) => {
          const s = spring({ frame: f - 18 - i * 5, fps, config: { damping: 200, mass: 0.9 } });
          return (
            <span key={i} style={{
              display: 'inline-block', marginRight: '0.22em', opacity: s, transform: `translateY(${(1 - s) * 50}px)`,
              ...(accent ? { fontStyle: 'italic', background: 'linear-gradient(180deg, #d9d5ff, #9d95ff)', WebkitBackgroundClip: 'text', color: 'transparent' } : {}),
            }}>{w}{i === 2 ? <br /> : null}</span>
          );
        })}
      </h1>
      <p style={{ margin: '40px 0 0', fontFamily: sans, fontSize: 32, color: C.muted, opacity: spring({ frame: f - 52, fps, config: { damping: 200 } }) }}>
        Portfolios, CVs and case studies, written with you.
      </p>
    </AbsoluteFill>
  );
}

function Talk({ d }) {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame: f - 4, fps, config: { damping: 200 } });
  const zoom = interpolate(f, [30, d], [1, 1.16], { ...clamp, easing: ease });
  return (
    <AbsoluteFill>
      <Caption step="01 — Talk it through" title="Tell us about your work." sub="A ten-minute conversation. Type or speak; Dixlab asks the questions that matter." style={{ position: 'absolute', left: 120, top: 300 }} maxWidth={640} />
      <div style={{ position: 'absolute', left: 800, top: 180, perspective: 2200 }}>
        <div style={{ transform: `translateX(${(1 - enter) * 200}px) rotateY(${(1 - enter) * -12 - 3}deg)`, opacity: enter, transformOrigin: 'left center' }}>
          <div style={{ width: 1040, height: 690, overflow: 'hidden', borderRadius: 16 }}>
            <div style={{ transform: `scale(${zoom})`, transformOrigin: '62% 80%' }}>
              <Browser src="shots/03-interview.png" width={1040} url="dixlab.app/interview" />
            </div>
          </div>
        </div>
      </div>
      <Listening at={60} x={120} y={720} />
    </AbsoluteFill>
  );
}

/** A "speak" pill with a live waveform, for the voice answer. */
function Listening({ at, x, y }) {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: f - at, fps, config: { damping: 16, mass: 0.7 } });
  return (
    <div style={{ position: 'absolute', left: x, top: y, transform: `scale(${s})`, transformOrigin: 'left center', opacity: Math.min(1, s * 1.4),
      display: 'flex', alignItems: 'center', gap: 18, padding: '16px 26px 16px 18px', borderRadius: 999, background: 'rgba(24,24,27,0.9)', border: '1px solid rgba(255,255,255,0.12)' }}>
      <span style={{ width: 40, height: 40, borderRadius: '50%', display: 'grid', placeItems: 'center', background: 'linear-gradient(135deg, #7b5cff, #9d95ff)', color: '#fff', fontSize: 20 }}>●</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 5, height: 34 }}>
        {Array.from({ length: 18 }, (_, i) => (
          <i key={i} style={{ width: 4, borderRadius: 2, background: C.accent, height: 8 + Math.abs(Math.sin((f - at) / 4 + i * 0.7)) * 26 }} />
        ))}
      </span>
      <span style={{ fontFamily: sans, fontSize: 24, color: C.muted }}>Speak or type</span>
    </div>
  );
}

function Bubble({ at, x, y, text }) {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: f - at, fps, config: { damping: 14, mass: 0.6 } });
  return (
    <div style={{ position: 'absolute', left: x, top: y, transform: `scale(${s})`, transformOrigin: 'left bottom', opacity: Math.min(1, s * 1.4),
      padding: '20px 26px', borderRadius: '22px 22px 22px 6px', background: 'linear-gradient(135deg, #7b5cff, #9d95ff)', color: '#fff', fontFamily: sans, fontSize: 26, fontWeight: 500,
      boxShadow: '0 30px 60px -20px rgba(123,92,255,0.6)' }}>
      {text}
    </div>
  );
}

function Write({ d }) {
  const f = useCurrentFrame();
  const t = interpolate(f, [20, d - 10], [0, 1], { ...clamp, easing: ease });
  const scale = 1 + t * 0.28;
  const x = -t * 260;
  const y = -t * 40;
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 1600, height: 900, overflow: 'hidden', borderRadius: 18, marginTop: 40 }}>
        <div style={{ transform: `translate(${x}px, ${y}px) scale(${scale})`, transformOrigin: 'center' }}>
          <Browser src="shots/04-editor-case.png" width={1600} url="dixlab.app/editor" />
        </div>
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 420, background: 'linear-gradient(transparent, rgba(8,8,10,0.96) 65%)' }} />
      <Caption step="02 — We write it up" title="Your story, in your own words." size={76} maxWidth={1100} style={{ position: 'absolute', left: 120, bottom: 90 }} />
    </AbsoluteFill>
  );
}

function Templates() {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const cards = [
    ['shots/07-portfolio.png', 'Portfolios', -12, -520, 40],
    ['shots/11-case.png', 'Case studies', 0, 0, 0],
    ['shots/12-cv.png', 'CVs', 12, 520, 40],
  ];
  return (
    <AbsoluteFill>
      <Caption step="03 — Pick a look" title="Thirty templates. One set of details." align="center" size={80} maxWidth={1400}
        style={{ position: 'absolute', left: 260, right: 260, top: 80, margin: '0 auto' }} />
      {cards.map(([src, label, rot, x, y], i) => {
        const s = spring({ frame: f - 20 - i * 8, fps, config: { damping: 18, mass: 0.9 } });
        const drift = Math.sin((f + i * 40) / 45) * 6;
        return (
          <div key={src} style={{ position: 'absolute', left: 960 - 330 + x, top: 380 + y + (1 - s) * 400 + drift, width: 660,
            opacity: Math.min(1, s * 1.3), zIndex: i === 1 ? 2 : 1 }}>
            <div style={{ transform: `rotate(${rot * s}deg)` }}>
              <Browser src={src} width={660} url={`dixlab.app/p/maya-chen${i === 1 ? '-case' : i === 2 ? '-cv' : ''}`} imgStyle={{ height: 420, objectFit: 'cover', objectPosition: 'top' }} />
            </div>
            <p style={{ margin: `${rot ? 56 : 28}px 0 0`, textAlign: 'center', fontFamily: mono, fontSize: 22, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.muted }}>{label}</p>
          </div>
        );
      })}
    </AbsoluteFill>
  );
}

function Customize({ d }) {
  const f = useCurrentFrame();
  const prompt = 'Make it feel premium with a deep purple accent and serif headings';
  const typed = prompt.slice(0, Math.round(interpolate(f, [30, 100], [0, prompt.length], clamp)));
  const t = interpolate(f, [110, d - 10], [0, 1], { ...clamp, easing: ease });
  const scale = 1.25 + t * 0.15;
  const x = 260 - t * 760;
  const flash = interpolate(f, [104, 112, 130], [0, 1, 0], clamp);
  // Frame is 1600px wide; the screenshot is 2880px, so screen px × 0.5556.
  const k = 1600 / 2880;
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 1600, height: 900, overflow: 'hidden', borderRadius: 18, marginTop: 40 }}>
        <div style={{ transform: `translate(${x}px, 120px) scale(${scale})`, transformOrigin: 'center' }}>
          <Browser src="shots/05-customize.png" width={1600} url="dixlab.app/editor">
            <div style={{ position: 'absolute', left: 615 * k, top: 690 * k, width: 900 * k, height: 120 * k, padding: 22 * k, borderRadius: 14 * k,
              background: '#141416', fontFamily: sans, fontSize: 31 * k, lineHeight: 1.35, color: C.ink }}>
              {typed}<span style={{ opacity: Math.floor(f / 8) % 2 ? 1 : 0, color: C.accent }}>|</span>
            </div>
            <div style={{ position: 'absolute', left: 615 * k, top: 822 * k, transform: `scale(${interpolate(f, [100, 110], [0, 1], clamp)})`, transformOrigin: 'left center',
              padding: `${10 * k}px ${20 * k}px`, borderRadius: 999, background: '#0ca30c', color: '#fff', fontFamily: sans, fontSize: 26 * k, fontWeight: 600 }}>✓ Applied</div>
            <div style={{ position: 'absolute', left: 1728 * k, top: 280 * k, width: 1080 * k, height: 1520 * k, borderRadius: 20 * k,
              boxShadow: `0 0 0 ${6 * k}px rgba(157,149,255,${flash}), 0 0 ${120 * k}px rgba(157,149,255,${flash * 0.6})` }} />
          </Browser>
        </div>
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 420, background: 'linear-gradient(transparent, rgba(8,8,10,0.96) 65%)' }} />
      <Caption step="04 — Make it yours" title="Describe the look. It's done." size={76} maxWidth={1100} style={{ position: 'absolute', left: 120, bottom: 90 }} />
    </AbsoluteFill>
  );
}

function Publish() {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame: f - 18, fps, config: { damping: 15, mass: 0.8 } });
  const copied = spring({ frame: f - 92, fps, config: { damping: 12 } });
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ opacity: 0.35, filter: 'blur(6px)', transform: 'scale(1.08)' }}>
        <Img src={staticFile('shots/05-customize.png')} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </AbsoluteFill>
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse at center, rgba(8,8,10,0.2), rgba(8,8,10,0.92) 70%)' }} />
      <div style={{ position: 'absolute', left: 1060, top: 170, transform: `scale(${0.82 + pop * 0.18})`, opacity: Math.min(1, pop * 1.4), transformOrigin: 'center' }}>
        {/* The capture has 24px of page around the dialog; crop it away. */}
        <div style={{ width: 720 * (497 / 545), height: 'auto', overflow: 'hidden', borderRadius: 24, boxShadow: '0 60px 140px -30px rgba(0,0,0,0.95), 0 0 0 1px rgba(255,255,255,0.08)' }}>
          <Img src={staticFile('shots/06b-publish-dialog.png')} style={{ display: 'block', width: 720, margin: `${-720 * 24 / 545}px 0 ${-720 * 24 / 545}px ${-720 * 24 / 545}px` }} />
        </div>
        <div style={{ position: 'absolute', right: 10, top: 136, transform: `scale(${copied})`, padding: '12px 20px', borderRadius: 999, background: '#0ca30c', color: '#fff', fontFamily: sans, fontSize: 24, fontWeight: 600, boxShadow: '0 20px 40px -10px rgba(12,163,12,0.6)' }}>
          ✓ Link copied
        </div>
      </div>
      <Caption step="05 — Publish" title="Share a link, not a PDF." sub="One click and it’s live. It works on every screen." style={{ position: 'absolute', left: 120, top: 330 }} maxWidth={820} />
    </AbsoluteFill>
  );
}

function Noticed() {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const desk = spring({ frame: f - 6, fps, config: { damping: 200 } });
  const phone = spring({ frame: f - 26, fps, config: { damping: 16, mass: 0.9 } });
  const toast = spring({ frame: f - 96, fps, config: { damping: 14 } });
  const scroll = interpolate(f, [20, 200], [-40, -150], { ...clamp, easing: ease });
  return (
    <AbsoluteFill>
      <Caption step="06 — Get noticed" title="Recruiters reach you from your page." size={72} maxWidth={760} style={{ position: 'absolute', left: 120, top: 120 }} />
      <div style={{ position: 'absolute', left: 300, top: 430, opacity: desk, transform: `translateY(${(1 - desk) * 80}px)` }}>
        <div style={{ width: 1180, height: 600, overflow: 'hidden', borderRadius: 16, boxShadow: '0 60px 120px -40px rgba(0,0,0,0.9)' }}>
          <Browser src="shots/07b-portfolio-skills.png" width={1180} url="dixlab.app/p/maya-chen" imgStyle={{ transform: `translateY(${scroll}px)` }} />
        </div>
      </div>
      <div style={{ position: 'absolute', left: 1400, top: 300 + (1 - phone) * 500 }}>
        <Phone src="shots/08-phone.png" width={330} />
      </div>
      <div style={{ position: 'absolute', right: 80, top: 110, width: 560, transform: `translateX(${(1 - toast) * 640}px)`, padding: '22px 26px', borderRadius: 20,
        background: 'rgba(24,24,27,0.94)', border: '1px solid rgba(255,255,255,0.12)', boxShadow: '0 40px 80px -20px rgba(0,0,0,0.9)', display: 'flex', gap: 18, alignItems: 'flex-start' }}>
        <span style={{ flex: 'none', width: 52, height: 52, borderRadius: 14, display: 'grid', placeItems: 'center', background: 'linear-gradient(135deg, #7b5cff, #9d95ff)', color: '#fff', fontFamily: sans, fontSize: 26, fontWeight: 600 }}>✉</span>
        <span style={{ fontFamily: sans }}>
          <b style={{ display: 'block', fontSize: 24, color: C.ink, fontWeight: 600 }}>New message from Sam at Brightside</b>
          <span style={{ display: 'block', marginTop: 6, fontSize: 22, lineHeight: 1.4, color: C.muted }}>“Loved the booking case study. Are you open to a design lead role?”</span>
        </span>
      </div>
    </AbsoluteFill>
  );
}

function Outro() {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const a = spring({ frame: f - 4, fps, config: { damping: 200 } });
  const b = spring({ frame: f - 22, fps, config: { damping: 200 } });
  const c = spring({ frame: f - 40, fps, config: { damping: 200 } });
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
      <Img src={staticFile('logo.svg')} style={{ width: 360, opacity: a, transform: `scale(${0.92 + a * 0.08})` }} />
      <p style={{ margin: '48px 0 0', fontFamily: serif, fontSize: 72, color: C.ink, opacity: b, transform: `translateY(${(1 - b) * 20}px)` }}>
        Your experience, <span style={{ fontStyle: 'italic', color: C.accent }}>clearly expressed.</span>
      </p>
      <p style={{ margin: '34px 0 0', padding: '14px 30px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.16)', fontFamily: mono, fontSize: 28, letterSpacing: '0.06em', color: C.ink, opacity: c }}>
        Start free at dixlab.app
      </p>
    </AbsoluteFill>
  );
}
