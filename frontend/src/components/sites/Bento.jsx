import { site, Shot, Glyph, ProjectLink, MailLink } from './shared.jsx';

/* Bento — everything on one screen, as a grid of rounded tiles. */
export default function Bento({ data }) {
  const s = site(data);
  const contactWide = s.experience.length === 0;
  return (
    <div className="site bento">
      <header className="bento__top">
        <span className="bento__logo">{s.mono}</span>
        <nav className="bento__nav"><span className="is-on">Home</span><span>Work</span><span>About</span></nav>
      </header>

      <div className="bento__grid">
        <section className="bento__t bento__t--hero">
          <span className="bento__avatar">{s.mono}</span>
          <h1 className="bento__h1">{s.name}</h1>
          <p className="bento__role">{s.role}</p>
          {s.tagline && <p className="bento__tag">{s.tagline}</p>}
        </section>

        <section className="bento__t bento__t--status">
          <p className="bento__live"><i />Available for work</p>
          <p className="bento__status-t">Currently building and learning in public.</p>
          <MailLink email={s.email} className="bento__pill">Get in touch <Glyph name="arrow" size={12} /></MailLink>
        </section>

        {s.paras.length > 0 && (
          <section className="bento__t bento__t--about">
            <p className="bento__k">About</p>
            {s.paras.slice(0, 2).map((p, i) => <p key={i} className="bento__p">{p}</p>)}
          </section>
        )}

        <section className="bento__t bento__t--stat">
          <p className="bento__big">{String(s.hasProjects ? s.projects.length : 0).padStart(2, '0')}</p>
          <p className="bento__stat-l">projects shipped</p>
          <div className="bento__stat-row">
            <span><b>{s.experience.length}</b> roles</span>
            <span><b>{s.skills.length}</b> tools</span>
          </div>
        </section>

        {s.projects.map((p, i) => (
          <ProjectLink key={i} href={p.link} className="bento__t bento__t--proj">
            <Shot media={p.media?.[0]} title={p.title} i={i} />
            <div className="bento__proj-row">
              <div>
                <h3>{p.title || 'Untitled project'}</h3>
                {p.desc && <p>{p.desc}</p>}
              </div>
              <span className="bento__go"><Glyph name="arrow" size={13} /></span>
            </div>
          </ProjectLink>
        ))}

        {s.skills.length > 0 && (
          <section className="bento__t bento__t--skills">
            <p className="bento__k">Toolkit</p>
            <ul className="bento__chips">{s.skills.map((k) => <li key={k}>{k}</li>)}</ul>
          </section>
        )}

        {s.experience.length > 0 && (
          <section className="bento__t bento__t--xp">
            <p className="bento__k">Experience</p>
            <ul className="bento__xp">
              {s.experience.map((e, i) => (
                <li key={i}><span>{e.role}<em>{e.company}</em></span><small>{[e.from, e.to].filter(Boolean).join(' – ')}</small></li>
              ))}
            </ul>
          </section>
        )}

        <MailLink email={s.email} className={`bento__t bento__t--contact ${contactWide ? 'is-wide' : ''}`}>
          <p className="bento__k">Contact</p>
          <p className="bento__contact-t">Let’s build something together.</p>
          <span className="bento__contact-go"><Glyph name="arrow" size={18} /></span>
        </MailLink>
      </div>

      <footer className="bento__foot">© {s.year} {s.name}</footer>
    </div>
  );
}
