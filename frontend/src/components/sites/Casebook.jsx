import { site, Shot, Glyph, ProjectLink, MailLink } from './shared.jsx';
import { Avatar } from './shared.jsx';
import { GetInTouch } from './contact.jsx';
import { ToolList } from './tools.jsx';

const SCREENS = [
  { bg: '#eef0ff', ink: '#1e1b4b', hi: '#6366f1' },
  { bg: '#fff3e8', ink: '#431407', hi: '#f97316' },
  { bg: '#ecfdf5', ink: '#052e16', hi: '#10b981' },
  { bg: '#fdf2f8', ink: '#500724', hi: '#ec4899' },
];
const PROCESS = ['Discover', 'Define', 'Design', 'Deliver'];

/* Casebook — case-study-led portfolio for UI/UX and product people. */
export default function Casebook({ data }) {
  const s = site(data);
  const now = s.experience[0];
  const [headline, ...rest] = (s.tagline || s.role).split('\n');
  const more = rest.join('\n');
  return (
    <div className="site casebook">
      <header className="cb__nav">
        <span className="cb__brand"><i />{s.name}</span>
        <nav><span className="is-on">Case studies</span><span>Process</span><span>About</span></nav>
        <MailLink email={s.email} className="cb__cta">Let’s talk</MailLink>
      </header>

      <section className="cb__hero">
        <Avatar s={s} className="avp avp--cb" fallback={false} />
        <p className="cb__chip"><Glyph name="spark" size={11} stroke={2.2} />{s.role}</p>
        <h1 className="cb__h1">Hi, I’m {s.first}.<br /><em>{headline}</em></h1>
        {more && <p className="cb__tag">{more}</p>}
        {now && (
          <p className="cb__now"><span className="cb__pulse" />Currently {now.role}{now.company && <> at <b>{now.company}</b></>}</p>
        )}
      </section>

      <section className="cb__sec">
        <div className="cb__head"><h2>Selected case studies</h2><span>{String(s.projects.length).padStart(2, '0')} projects</span></div>
        <div className="cb__cases">
          {s.projects.map((p, i) => (
            <ProjectLink key={i} project={i} href={p.link} className={`cb__case ${i % 2 ? 'is-flip' : ''}`}>
              <div className="cb__device">
                <div className="cb__device-bar"><i /><i /><i /></div>
                <Shot media={p.media?.[0]} title={p.title} i={i} palette={SCREENS} />
              </div>
              <div className="cb__case-text">
                <p className="cb__case-k">Case {String(i + 1).padStart(2, '0')}</p>
                <h3>{p.title || 'Untitled project'}</h3>
                {p.desc && <p className="cb__case-d">{p.desc}</p>}
                <div className="cb__case-meta"><span>Role · {s.role}</span>{s.skills[0] && <span className="cb__case-tools">Tools <ToolList items={s.skills.slice(0, 4)} size="sm" /></span>}</div>
                <span className="cb__read">Read case study <Glyph name="right" size={12} /></span>
              </div>
            </ProjectLink>
          ))}
        </div>
      </section>

      <section className="cb__sec cb__process">
        <h2>How I work</h2>
        <ol className="cb__steps">
          {PROCESS.map((p, i) => <li key={p}><span>0{i + 1}</span>{p}</li>)}
        </ol>
        {s.paras.map((p, i) => <p key={i} className="cb__p">{p}</p>)}
      </section>

      {(s.skills.length > 0 || s.certs.length > 0) && (
        <section className="cb__sec cb__kit">
          {s.skills.length > 0 && (
            <div>
              <h2>Toolkit</h2>
              <ToolList items={s.skills} label="Toolkit" />
            </div>
          )}
          {s.certs.length > 0 && (
            <div>
              <h2>Recognition</h2>
              <ul className="cb__chips cb__chips--soft">{s.certs.map((k) => <li key={k}><Glyph name="award" size={11} />{k}</li>)}</ul>
            </div>
          )}
        </section>
      )}

      {s.experience.length > 0 && (
        <section className="cb__sec">
          <h2>Experience</h2>
          <ul className="cb__xp">
            {s.experience.map((e, i) => (
              <li key={i}><b>{e.role}</b><span>{e.company}</span><small>{[e.from, e.to].filter(Boolean).join(' – ')}</small></li>
            ))}
          </ul>
        </section>
      )}

      <section className="cb__contact">
        <h2>How can I help you?</h2>
        {s.skills.length > 0
          ? <><p className="cb__help">The skills and tools I bring to a project:</p><ToolList items={s.skills} size="lg" className="cb__help-tools" label="Skills and tools" /></>
          : <p className="cb__help">Add your skills and tools to show them here.</p>}
        <MailLink email={s.email} className="cb__btn">{s.email || 'Get in touch'} <Glyph name="arrow" size={13} /></MailLink>
      </section>
      <GetInTouch s={s} />
      <footer className="cb__foot">© {s.year} {s.name} · Designed with care</footer>
    </div>
  );
}
