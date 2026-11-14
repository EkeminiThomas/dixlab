import { site, Shot, ProjectLink, MailLink } from './shared.jsx';
import { Avatar } from './shared.jsx';
import { GetInTouch } from './contact.jsx';
import { ToolList } from './tools.jsx';

const WALL = [
  { bg: '#d9d4ca', ink: '#1b1a17', hi: '#8a5a3c' },
  { bg: '#1b1b1d', ink: '#f2f0ea', hi: '#e8c07a' },
  { bg: '#c9d3d6', ink: '#13242a', hi: '#2f6f7e' },
  { bg: '#efe3d3', ink: '#3b2414', hi: '#d0622b' },
  { bg: '#2b2f27', ink: '#e6ebd9', hi: '#a5c46b' },
  { bg: '#e6dcef', ink: '#2a1a3a', hi: '#7b4fc9' },
];

/* Exhibit — image-led gallery for visual work: big pieces, quiet captions. */
export default function Exhibit({ data }) {
  const s = site(data);
  const headline = s.tagline ? s.tagline.split('\n')[0] : s.role;
  return (
    <div className="site exhibit">
      <header className="exhibit__head">
        <span className="exhibit__name">{s.name}</span>
        <nav className="exhibit__nav"><span className="is-on">Work</span><span>Info</span><span>Contact</span></nav>
      </header>

      <section className="exhibit__intro">
        <Avatar s={s} className="avp avp--exhibit" fallback={false} />
        <p className="exhibit__k">{s.role}</p>
        <h1>{headline}</h1>
      </section>

      <div className="exhibit__wall">
        {s.projects.map((p, i) => (
          <ProjectLink key={i} project={i} href={p.link} className={`exhibit__piece exhibit__piece--${i % 4}`}>
            <Shot media={p.media?.[0]} title={p.title} i={i} palette={WALL} />
            <span className="exhibit__cap">
              <span className="exhibit__n">{String(i + 1).padStart(2, '0')}</span>
              <span><b>{p.title || 'Untitled project'}</b>{p.desc && <em>{p.desc}</em>}</span>
            </span>
          </ProjectLink>
        ))}
      </div>

      <section className="exhibit__info">
        <div>
          <p className="exhibit__k">Info</p>
          {s.paras.map((p, i) => <p key={i} className="exhibit__p">{p}</p>)}
        </div>
        <div className="exhibit__side">
          {s.skills.length > 0 && (
            <>
              <p className="exhibit__k">Disciplines</p>
              <ToolList items={s.skills} label="Disciplines" />
            </>
          )}
          {s.experience.length > 0 && (
            <>
              <p className="exhibit__k">Experience</p>
              <ul className="exhibit__xp">
                {s.experience.map((e, i) => <li key={i}><span>{e.role}, {e.company}</span><span>{e.from}</span></li>)}
              </ul>
            </>
          )}
        </div>
      </section>

      <GetInTouch s={s} />

      <footer className="exhibit__foot">
        <p className="exhibit__k">Say hello</p>
        <MailLink email={s.email} className="exhibit__mail">{s.email || 'your@email.com'}</MailLink>
        <small>© {s.year} {s.name}</small>
      </footer>
    </div>
  );
}
