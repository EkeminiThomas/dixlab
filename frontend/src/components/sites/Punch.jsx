import { site, Shot, Glyph, ProjectLink, MailLink } from './shared.jsx';
import { Avatar } from './shared.jsx';
import { GetInTouch } from './contact.jsx';
import { Tool } from './tools.jsx';

const POP = [
  { bg: '#7b5cff', ink: '#ffffff', hi: '#d9ff3f' },
  { bg: '#ff7ab8', ink: '#1a0b12', hi: '#ffffff' },
  { bg: '#121212', ink: '#d9ff3f', hi: '#7b5cff' },
  { bg: '#ffb23f', ink: '#1a1206', hi: '#121212' },
];

/* Punch — bold and playful: chunky borders, offset shadows, a skills ticker. */
export default function Punch({ data }) {
  const s = site(data);
  const ticker = s.skills.length ? s.skills : [s.role];
  return (
    <div className="site punch">
      <header className="punch__head">
        <Avatar s={s} className="punch__logo" />
        <nav className="punch__nav">
          <span>Work</span><span>About</span>
          <MailLink email={s.email} className="punch__cta">Hire me</MailLink>
        </nav>
      </header>

      <section className="punch__hero">
        <Avatar s={s} className="avp avp--punch" fallback={false} />
        <span className="punch__sticker"><Glyph name="spark" size={12} stroke={2.4} /> Open to work</span>
        <h1 className="punch__h1">Hey! I’m<br /><span>{s.first}.</span></h1>
        <p className="punch__role"><mark>{s.role}</mark></p>
        {s.tagline && <p className="punch__tag">{s.tagline}</p>}
      </section>

      <div className="punch__ticker" aria-hidden>
        <div className="punch__track">
          {[0, 1, 2, 3].map((r) => ticker.map((k) => <span key={`${r}-${k}`}>{s.skills.length ? <Tool name={k} as="b" className="tk__tick" /> : k}<i>✺</i></span>))}
        </div>
      </div>

      {s.paras.length > 0 && (
        <section className="punch__sec">
          <h2 className="punch__h2">About me</h2>
          <div className="punch__box">{s.paras.map((p, i) => <p key={i}>{p}</p>)}</div>
        </section>
      )}

      <section className="punch__sec">
        <h2 className="punch__h2">Things I’ve made</h2>
        <div className="punch__cards">
          {s.projects.map((p, i) => (
            <ProjectLink key={i} project={i} href={p.link} className="punch__card">
              <span className="punch__badge">#{String(i + 1).padStart(2, '0')}</span>
              <Shot media={p.media?.[0]} title={p.title} i={i} palette={POP} />
              <h3>{p.title || 'Untitled project'}</h3>
              {p.desc && <p>{p.desc}</p>}
            </ProjectLink>
          ))}
        </div>
      </section>

      {s.experience.length > 0 && (
        <section className="punch__sec">
          <h2 className="punch__h2">Where I’ve been</h2>
          <ul className="punch__xp">
            {s.experience.map((e, i) => (
              <li key={i}><span className="punch__yr">{e.from || '—'}</span><b>{e.role}</b><span>{e.company}</span></li>
            ))}
          </ul>
        </section>
      )}

      <section className="punch__contact">
        <h2>Let’s make something great.</h2>
        <MailLink email={s.email} className="punch__btn">{s.email || 'Say hello'} <Glyph name="right" size={14} stroke={2.4} /></MailLink>
      </section>

      <GetInTouch s={s} />

      <footer className="punch__foot">© {s.year} {s.name} — thanks for scrolling!</footer>
    </div>
  );
}
