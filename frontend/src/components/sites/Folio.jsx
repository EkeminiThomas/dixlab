import { site, Shot, Glyph, ProjectLink, MailLink } from './shared.jsx';
import { Avatar } from './shared.jsx';
import { GetInTouch } from './contact.jsx';
import { ToolList } from './tools.jsx';

/* Folio — minimal and personal. Monogram bar, open-to-work hero, a gently
   tilted strip of project shots, stats, selected work, a timeline and an
   outlined sign-off. */
export default function Folio({ data }) {
  const s = site(data);
  const strip = [...s.projects, ...s.projects, ...s.projects, ...s.projects];
  const stats = [
    s.hasProjects && [String(s.projects.length).padStart(2, '0'), 'Projects'],
    s.experience.length > 0 && [String(s.experience.length).padStart(2, '0'), 'Roles'],
    s.skills.length > 0 && [String(s.skills.length).padStart(2, '0'), 'Tools'],
  ].filter(Boolean);

  return (
    <div className="site folio">
      <header className="folio__bar">
        <span className="folio__brand"><Avatar s={s} className="folio__mono" /><span>{s.name}</span></span>
        <nav className="folio__links"><span>Work</span><span>About</span><span>Contact</span></nav>
        <MailLink email={s.email} className="folio__hello">Say hello <Glyph name="arrow" size={12} /></MailLink>
      </header>

      <div className="folio__col">
        <section className="folio__hero">
          <div className="folio__id">
            <Avatar s={s} className="folio__avatar" />
            <span className="folio__status"><i />Open to new work</span>
          </div>
          <h1 className="folio__h1">Hi, I’m {s.first} —<br /><span>{s.role}</span></h1>
          {s.tagline && <p className="folio__tag">{s.tagline}</p>}
        </section>
      </div>

      <div className="folio__strip" aria-hidden>
        <div className="folio__track">
          {strip.map((p, i) => (
            <figure key={i} className="folio__frame">
              <Shot media={p.media?.[0]} title={p.title} i={i % s.projects.length} />
              <figcaption>{p.title || 'Untitled project'}</figcaption>
            </figure>
          ))}
        </div>
      </div>

      <div className="folio__col">
        {(s.paras.length > 0 || stats.length > 0) && (
          <section className="folio__sec">
            <p className="folio__k">About</p>
            {s.paras.map((p, i) => <p key={i} className={i === 0 ? 'folio__lead' : 'folio__p'}>{p}</p>)}
            {stats.length > 0 && (
              <div className="folio__stats">
                {stats.map(([n, l]) => <div key={l}><strong>{n}</strong><span>{l}</span></div>)}
              </div>
            )}
            {s.skills.length > 0 && <ToolList items={s.skills} className="folio__tools" label="Tools" />}
          </section>
        )}

        <section className="folio__sec">
          <div className="folio__head"><p className="folio__k">Selected work</p><span>({String(s.projects.length).padStart(2, '0')})</span></div>
          <div className="folio__grid">
            {s.projects.map((p, i) => (
              <ProjectLink key={i} project={i} href={p.link} className="folio__card">
                <Shot media={p.media?.[0]} title={p.title} i={i} />
                <div className="folio__card-row">
                  <h3>{p.title || 'Untitled project'}</h3>
                  <span className="folio__card-go"><Glyph name="arrow" size={12} /></span>
                </div>
                {p.desc && <p>{p.desc}</p>}
              </ProjectLink>
            ))}
          </div>
        </section>

        {s.experience.length > 0 && (
          <section className="folio__sec">
            <p className="folio__k">Experience</p>
            <ol className="folio__xp">
              {s.experience.map((e, i) => (
                <li key={i}>
                  <span className="folio__xp-r">{e.role}{e.company && <em> · {e.company}</em>}</span>
                  <span className="folio__xp-d">{[e.from, e.to].filter(Boolean).join(' – ')}</span>
                </li>
              ))}
            </ol>
          </section>
        )}

        <section className="folio__sec folio__contact">
          <h2>Let’s work together.</h2>
          <p className="folio__p">Have a project in mind, or just want to say hello? My inbox is always open.</p>
          <MailLink email={s.email} className="folio__btn">Start a conversation <Glyph name="right" size={12} /></MailLink>
          {s.email && <p className="folio__mail">{s.email}</p>}
        </section>
      </div>

      <GetInTouch s={s} />

      <footer className="folio__foot">
        <p className="folio__sign" aria-hidden style={{ fontSize: `${Math.min(17, 88 / (s.name.length * 0.62)).toFixed(2)}cqw` }}>{s.name}</p>
        <div className="folio__legal"><p>© {s.roman} {s.name}</p><span><Glyph name="link" /><Glyph name="mail" /></span></div>
      </footer>
    </div>
  );
}
