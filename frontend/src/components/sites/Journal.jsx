import { site, Shot, ProjectLink, MailLink } from './shared.jsx';
import { Avatar } from './shared.jsx';
import { GetInTouch } from './contact.jsx';
import { ToolList } from './tools.jsx';

const PAPER = [
  { bg: '#1d1a16', ink: '#f4efe6', hi: '#c2410c' },
  { bg: '#e7dfd0', ink: '#1d1a16', hi: '#7c2d12' },
];

/* Journal — an editorial, magazine-style portfolio. */
export default function Journal({ data }) {
  const s = site(data);
  const [feature, ...rest] = s.projects;
  return (
    <div className="site journal">
      <header className="journal__mast">
        <div className="journal__meta"><span>Vol. {s.roman}</span><span>The portfolio of</span><span>{s.role}</span></div>
        <h1 className="journal__name">{s.name}</h1>
        <Avatar s={s} className="avp avp--journal" fallback={false} />
        <nav className="journal__nav"><span>Work</span><span>Profile</span><span>Correspondence</span></nav>
      </header>

      {s.tagline && <p className="journal__dek">{s.tagline}</p>}

      {s.paras.length > 0 && (
        <section className="journal__sec">
          <p className="journal__k">Profile</p>
          <div className="journal__cols">
            {s.paras.map((p, i) => <p key={i} className={i === 0 ? 'journal__drop' : ''}>{p}</p>)}
          </div>
        </section>
      )}

      <section className="journal__sec">
        <p className="journal__k">Selected work</p>
        <ProjectLink project={0} href={feature.link} className="journal__feature">
          <Shot media={feature.media?.[0]} title={feature.title} i={0} palette={PAPER} />
          <div>
            <p className="journal__no">No. 01 — Feature</p>
            <h2 className="journal__ft">{feature.title || 'Untitled project'}</h2>
            {feature.desc && <p className="journal__fd">{feature.desc}</p>}
          </div>
        </ProjectLink>
        {rest.length > 0 && (
          <ol className="journal__index">
            {rest.map((p, i) => (
              <li key={i}>
                <ProjectLink project={i + 1} href={p.link} className="journal__row">
                  <span className="journal__n">{String(i + 2).padStart(2, '0')}</span>
                  <span className="journal__t">{p.title || 'Untitled project'}</span>
                  <span className="journal__d">{p.desc}</span>
                  <span className="journal__go">→</span>
                </ProjectLink>
              </li>
            ))}
          </ol>
        )}
      </section>

      {s.skills.length > 0 && (
        <div className="journal__spec"><span>Specialisms —</span> <ToolList items={s.skills} size="sm" label="Specialisms" /></div>
      )}

      {s.experience.length > 0 && (
        <section className="journal__sec">
          <p className="journal__k">Experience</p>
          <ul className="journal__xp">
            {s.experience.map((e, i) => (
              <li key={i}>
                <span className="journal__xp-d">{[e.from, e.to].filter(Boolean).join(' – ')}</span>
                <span className="journal__xp-r">{e.role}</span>
                <span className="journal__xp-c">{e.company}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <GetInTouch s={s} />

      <footer className="journal__foot">
        <p className="journal__k">Correspondence</p>
        <MailLink email={s.email} className="journal__mail">{s.email || 'your@email.com'}</MailLink>
        <p className="journal__colophon">Set in Instrument Serif · © {s.roman} {s.name}</p>
      </footer>
    </div>
  );
}
