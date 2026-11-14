import { site, ProjectLink, MailLink, Glyph } from './shared.jsx';
import { Avatar } from './shared.jsx';
import { GetInTouch } from './contact.jsx';
import { ToolList } from './tools.jsx';

/* Grid — Swiss-style minimalism: a strict grid, big type, one red accent. */
export default function Grid({ data }) {
  const s = site(data);
  const words = s.name.split(/\s+/);
  return (
    <div className="site swiss">
      <header className="swiss__head">
        <b>{s.name}</b>
        <span>{s.role}</span>
        <span className="swiss__nav">Index, Info, Contact</span>
      </header>

      <section className="swiss__hero">
        <Avatar s={s} className="avp avp--swiss" fallback={false} />
        <h1>{words.map((w, i) => <span key={i}>{w}{i === words.length - 1 && <i className="swiss__dot" />}</span>)}</h1>
      </section>

      {(s.tagline || s.paras.length > 0) && (
        <section className="swiss__row">
          <p className="swiss__k">Info</p>
          <div className="swiss__info">
            {s.tagline && <p className="swiss__lead">{s.tagline}</p>}
            {s.paras.map((p, i) => <p key={i}>{p}</p>)}
          </div>
        </section>
      )}

      <section className="swiss__row">
        <p className="swiss__k">Index</p>
        <ol className="swiss__index">
          {s.projects.map((p, i) => (
            <li key={i}>
              <ProjectLink project={i} href={p.link} className="swiss__item">
                <span className="swiss__n">{String(i + 1).padStart(2, '0')}</span>
                <span className="swiss__t">{p.title || 'Untitled project'}</span>
                <span className="swiss__d">{p.desc}</span>
                <span className="swiss__go"><Glyph name="arrow" size={13} stroke={2} /></span>
              </ProjectLink>
            </li>
          ))}
        </ol>
      </section>

      {s.skills.length > 0 && (
        <section className="swiss__row">
          <p className="swiss__k">Capabilities</p>
          <ToolList items={s.skills} label="Capabilities" />
        </section>
      )}

      {s.experience.length > 0 && (
        <section className="swiss__row">
          <p className="swiss__k">Experience</p>
          <ul className="swiss__xp">
            {s.experience.map((e, i) => (
              <li key={i}><span>{[e.from, e.to].filter(Boolean).join('–')}</span><span>{e.role}</span><span>{e.company}</span></li>
            ))}
          </ul>
        </section>
      )}

      <GetInTouch s={s} />

      <footer className="swiss__foot">
        <p className="swiss__k">Contact</p>
        <MailLink email={s.email} className="swiss__mail">{s.email || 'your@email.com'}</MailLink>
        <div className="swiss__legal"><span>© {s.year}</span><span>{s.name}</span><span>Selected work, {s.year}</span></div>
      </footer>
    </div>
  );
}
