import { useContext, useRef, useState } from 'react';
import { site, Shot, Glyph, ProjectLink, Avatar, StaticSite } from './shared.jsx';
import { GetInTouch } from './contact.jsx';
import { usePointerTilt, scrollToPart } from './three.js';

/* Block colours, cycled for skills and project cards. The first follows the
   owner's accent colour. Each is [face, side, top, text]. */
const BLOCKS = [
  ['var(--bl-accent)', 'var(--bl-accent-side)', 'var(--bl-accent-top)', 'var(--bl-on)'],
  ['#3445ff', '#2331c9', '#7c88ff', '#ffffff'],
  ['#3ddc97', '#1fa870', '#9af0c9', '#16151b'],
  ['#ffd25a', '#e0a92a', '#ffe79e', '#16151b'],
  ['#16151b', '#000000', '#4a4855', '#f2efe8'],
  ['#ff5b3a', '#d63e20', '#ff9c86', '#ffffff'],
];
const block = (i) => BLOCKS[i % BLOCKS.length];
const pad = (n) => String(n).padStart(2, '0');

/* Blocks — a playful 3D portfolio: extruded name, floating skill blocks,
   project cards that flip over, and a timeline that recedes into the page. */
export default function Blocks({ data }) {
  const s = site(data);
  const root = useRef(null);
  const tilt = usePointerTilt();
  const isStatic = useContext(StaticSite);
  const go = (part) => () => scrollToPart(root.current, part);
  const Nav = ({ part, children, className }) => (isStatic
    ? <span className={className}>{children}</span>
    : <button type="button" className={className} onClick={go(part)}>{children}</button>);
  const now = s.experience[0];
  const open = now && /present|now|current/i.test(now.to || '');
  const skills = s.skills.slice(0, 6);
  const nameLines = s.rest ? [s.first, s.rest] : [s.first];

  return (
    <div className="site bl" ref={root}>
      <header className="bl__nav">
        <span className="bl__brand"><i aria-hidden />{s.name}</span>
        <nav className="bl__links" aria-label="Sections">
          <Nav part="work">Work</Nav>
          {s.paras.length > 0 && <Nav part="about">About</Nav>}
          {s.experience.length > 0 && <Nav part="experience">Experience</Nav>}
          <Nav part="contact">Contact</Nav>
        </nav>
        <Nav part="contact" className="bl__btn bl__btn--sm">Say hello <Glyph name="right" size={12} /></Nav>
      </header>

      <section className="bl__hero" ref={tilt} data-part="top">
        <div className="bl__intro">
          <p className="bl__chip"><i aria-hidden className={open ? 'is-open' : ''} />{s.role}{open ? ' · Open to work' : ''}</p>
          <div className="bl__scene bl__scene--name">
            <h1 className="bl__name" aria-label={s.name}>
              {nameLines.map((l, i) => <span key={i} className="bl__name-line" aria-hidden>{l}</span>)}
            </h1>
          </div>
          {s.tagline && <p className="bl__tag">{s.tagline}</p>}
          <div className="bl__actions">
            <Nav part="work" className="bl__btn">See my work <span aria-hidden>↓</span></Nav>
            <Nav part="contact" className="bl__btn bl__btn--ghost">Get in touch</Nav>
          </div>
        </div>

        {skills.length > 0 && (
          <ul className="bl__cubes" aria-label="Skills">
            {skills.map((k, i) => {
              const [face, side, top, ink] = block(i);
              return (
                <li key={k} className="bl__cube-slot" style={{ '--i': i }}>
                  <span className="bl__cube" style={{ '--c-face': face, '--c-side': side, '--c-top': top, '--c-ink': ink }}>
                    <span className="bl__face bl__face--front">{k}</span>
                    <span className="bl__face bl__face--side" aria-hidden>{pad(i + 1)}</span>
                    <span className="bl__face bl__face--top" aria-hidden />
                  </span>
                  <span className="bl__cube-shadow" aria-hidden />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="bl__sec" data-part="work">
        <div className="bl__head">
          <div>
            <p className="bl__k">Selected work</p>
            <h2 className="bl__h2">Things I’ve built.</h2>
          </div>
          {!isStatic && <p className="bl__hint">Flip a card for the details</p>}
        </div>
        <div className="bl__cards">
          {s.projects.map((p, i) => <FlipCard key={i} p={p} i={i} />)}
        </div>
      </section>

      {s.paras.length > 0 && (
        <section className="bl__sec bl__about" data-part="about">
          <div className="bl__scene bl__prints">
            <span className="bl__print bl__print--back" aria-hidden><i /></span>
            <span className="bl__print bl__print--mid" aria-hidden><i /></span>
            <span className="bl__print bl__print--front">
              <Avatar s={s} className="bl__photo" />
            </span>
          </div>
          <div className="bl__about-text">
            <p className="bl__k">About</p>
            <p className="bl__lede">{s.paras[0]}</p>
            {s.paras.slice(1).map((p, i) => <p key={i} className="bl__p">{p}</p>)}
            {s.certs.length > 0 && (
              <ul className="bl__certs" aria-label="Certifications">{s.certs.map((c) => <li key={c}><span aria-hidden>✦</span>{c}</li>)}</ul>
            )}
          </div>
        </section>
      )}

      {s.experience.length > 0 && (
        <section className="bl__sec" data-part="experience">
          <p className="bl__k">Experience</p>
          <h2 className="bl__h2">Where I’ve been. Newest first.</h2>
          <div className="bl__scene bl__rail">
            <ol className="bl__roles">
              {s.experience.map((e, i) => (
                <li key={i} className={`bl__role ${i === 0 ? 'is-now' : ''}`} style={{ '--i': i }}>
                  <p className="bl__when">{[e.from, e.to].filter(Boolean).join(' — ')}{i === 0 && open && <b>Now</b>}</p>
                  <h3>{e.role}</h3>
                  {e.company && <p className="bl__co">{e.company}</p>}
                </li>
              ))}
            </ol>
          </div>
        </section>
      )}

      <section className="bl__contact" data-part="contact">
        <div className="bl__contact-intro">
          <p className="bl__k">Contact</p>
          <div className="bl__scene bl__scene--name">
            <p className="bl__name bl__name--hello" aria-hidden><span className="bl__name-line">Say</span><span className="bl__name-line">hello.</span></p>
          </div>
          <p className="bl__p">Hiring, collaborating, or just want to say hi? Messages go straight to {s.first === 'Your' ? 'my' : `${s.first}’s`} inbox.</p>
        </div>
        <div className="bl__formcard">
          <GetInTouch s={s} title="Send a message" lead="Replies come by email. Your address is never shown on this page." />
        </div>
      </section>

      <footer className="bl__foot">
        <span>© {s.year} {s.name}</span>
        {!isStatic && <button type="button" className="bl__btn bl__btn--ghost bl__btn--sm" onClick={go('top')}>Back to top <span aria-hidden>↑</span></button>}
      </footer>
    </div>
  );
}

/** A project card that flips over to show the description and the way in. */
function FlipCard({ p, i }) {
  const isStatic = useContext(StaticSite);
  const [flipped, setFlipped] = useState(false);
  const [face] = block(i + 1);
  const media = p.media?.[0];
  const title = p.title || 'Untitled project';
  return (
    <article className={`bl__card ${flipped ? 'is-flipped' : ''}`} style={{ '--card': face }}>
      <div className="bl__card-inner">
        <div className="bl__card-face bl__card-front" inert={flipped ? '' : undefined}>
          <div className="bl__visual">
            {media?.src ? <Shot media={media} title={title} i={i} /> : (
              <span className="bl__slabs" aria-hidden><i /><i /><i /></span>
            )}
            <span className="bl__num">{pad(i + 1)}</span>
          </div>
          <div className="bl__card-body">
            <h3>{title}</h3>
            {!isStatic && (p.desc || p.link) && (
              <button type="button" className="bl__flip" onClick={() => setFlipped(true)} aria-label={`Show details for ${title}`}>Flip <span aria-hidden>↻</span></button>
            )}
          </div>
        </div>
        {!isStatic && (
          <div className="bl__card-face bl__card-back" inert={flipped ? undefined : ''}>
            <p className="bl__k bl__k--on-dark">About this project</p>
            <h3>{title}</h3>
            {p.desc && <p className="bl__card-desc">{p.desc}</p>}
            <div className="bl__card-actions">
              <ProjectLink project={i} href={p.link} className="bl__btn bl__btn--light bl__btn--sm">View project <Glyph name="arrow" size={12} /></ProjectLink>
              <button type="button" className="bl__flip bl__flip--dark" onClick={() => setFlipped(false)}><span aria-hidden>↺</span> Flip back</button>
            </div>
          </div>
        )}
      </div>
    </article>
  );
}
