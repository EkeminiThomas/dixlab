import { useContext } from 'react';
import { Avatar } from './shared.jsx';
import { GetInTouch } from './contact.jsx';
import { Tool } from './tools.jsx';
import { site, Shot, Glyph, ProjectLink, MailLink, StaticSite } from './shared.jsx';

const FRAMES = [
  { bg: '#1a1033', ink: '#f5f3ff', hi: '#a78bfa' },
  { bg: '#0f2a2a', ink: '#ccfbf1', hi: '#2dd4bf' },
  { bg: '#2a1208', ink: '#ffedd5', hi: '#fb923c' },
  { bg: '#101828', ink: '#e0f2fe', hi: '#38bdf8' },
  { bg: '#2a0b19', ink: '#fce7f3', hi: '#f472b6' },
  { bg: '#1c1c10', ink: '#fef9c3', hi: '#facc15' },
];

/* Reel — showreel-first portfolio for motion designers, animators,
   video editors, filmmakers and performers. */
export default function Reel({ data }) {
  const s = site(data);
  const isStatic = useContext(StaticSite);
  const ticker = s.skills.length ? s.skills : [s.role];
  const clients = s.experience.map((e) => e.company).filter(Boolean);
  return (
    <div className="site reel">
      <header className="rl__nav">
        <span className="rl__logo">{s.name}</span>
        <nav><span className="is-on">Reel</span><span>Work</span><span>Info</span></nav>
        <MailLink email={s.email} className="rl__cta">Contact</MailLink>
      </header>

      <section className="rl__hero">
        <div className="rl__player">
          {s.reel
            ? <video className="rl__video" src={isStatic ? `${s.reel.src}#t=0.1` : s.reel.src} muted loop playsInline preload="metadata" autoPlay={!isStatic} aria-label="Showreel" />
            : <div className="rl__footage" aria-hidden><i /><i /><i /></div>}
          <span className="rl__rec"><i />REC</span>
          <span className="rl__res">4K · 24fps</span>
          <div className="rl__title">
            <p>Showreel {s.year}</p>
            <Avatar s={s} className="avp avp--reel" fallback={false} />
            <h1>{s.role}</h1>
          </div>
          {!s.reel && <span className="rl__play"><Glyph name="play" size={18} stroke={0} /></span>}
          {!s.reel && (
            <div className="rl__controls">
              <span>00:00</span>
              <span className="rl__track"><i /></span>
              <span>01:30</span>
            </div>
          )}
        </div>
        {s.tagline && <p className="rl__tag">{s.tagline}</p>}
      </section>

      <div className="rl__ticker" aria-hidden>
        <div className="rl__track-x">
          {[0, 1, 2, 3].map((r) => ticker.map((k) => <span key={`${r}-${k}`}>{s.skills.length ? <Tool name={k} as="b" className="tk__tick" /> : k}<i>●</i></span>))}
        </div>
      </div>

      <section className="rl__sec">
        <div className="rl__head"><h2>Selected work</h2><span>{String(s.projects.length).padStart(2, '0')} films</span></div>
        <div className="rl__grid">
          {s.projects.map((p, i) => (
            <ProjectLink key={i} project={i} href={p.link} className={`rl__clip ${i === 0 ? 'is-wide' : ''}`}>
              <div className="rl__thumb">
                <Shot media={p.media?.[0]} title={p.title} i={i} palette={FRAMES} />
                <span className="rl__thumb-play"><Glyph name="play" size={12} stroke={0} /></span>
                <span className="rl__no">{String(i + 1).padStart(2, '0')}</span>
              </div>
              <div className="rl__cap"><h3>{p.title || 'Untitled project'}</h3>{p.desc && <p>{p.desc}</p>}</div>
            </ProjectLink>
          ))}
        </div>
      </section>

      <section className="rl__sec rl__info">
        <div>
          <h2>Info</h2>
          {s.paras.map((p, i) => <p key={i} className="rl__p">{p}</p>)}
        </div>
        <div className="rl__side">
          {clients.length > 0 && (<><p className="rl__k">Studios &amp; clients</p><ul className="rl__list">{clients.map((c) => <li key={c}>{c}</li>)}</ul></>)}
          {s.certs.length > 0 && (<><p className="rl__k">Awards</p><ul className="rl__list">{s.certs.map((c) => <li key={c}>{c}</li>)}</ul></>)}
        </div>
      </section>

      <section className="rl__contact">
        <p className="rl__k">Now booking</p>
        <MailLink email={s.email} className="rl__mail">{s.email || 'your@email.com'}</MailLink>
      </section>
      <GetInTouch s={s} />
      <footer className="rl__foot"><span>© {s.year} {s.name}</span><span>Made frame by frame</span></footer>
    </div>
  );
}
