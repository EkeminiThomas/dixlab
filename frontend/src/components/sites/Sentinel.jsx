import { site, hash, Glyph, ProjectLink, MailLink } from './shared.jsx';
import { Avatar } from './shared.jsx';
import { GetInTouch } from './contact.jsx';
import { ToolList } from './tools.jsx';

/* Sentinel — a portfolio for cyber security professionals: certifications up
   front, research and engagements as advisories, and a clean contact line. */
export default function Sentinel({ data }) {
  const s = site(data);
  const focus = s.skills.slice(0, 3);
  return (
    <div className="site sentinel">
      <header className="sn__bar">
        <span className="sn__status"><i />SECURE</span>
        <span className="sn__handle">{s.handle || 'analyst'}@sentinel</span>
        <nav><span>Research</span><span>Certs</span><span>Contact</span></nav>
      </header>

      <section className="sn__hero">
        <Avatar s={s} className="avp avp--sn" fallback={false} />
        <div className="sn__radar" aria-hidden><span /></div>
        <p className="sn__k">// security portfolio</p>
        <h1 className="sn__h1">{s.name}</h1>
        <p className="sn__role"><Glyph name="shield" size={14} />{s.role}</p>
        {s.tagline && <p className="sn__tag">{s.tagline}</p>}
        <dl className="sn__profile">
          <div><dt>Focus</dt><dd>{focus.length ? <ToolList items={focus} size="sm" label="Focus" /> : 'Add skills to show your focus'}</dd></div>
          <div><dt>Certifications</dt><dd>{s.certs.length ? `${s.certs.length} held` : '—'}</dd></div>
          <div><dt>Status</dt><dd className="sn__ok">Open to engagements</dd></div>
        </dl>
      </section>

      {s.certs.length > 0 && (
        <section className="sn__sec">
          <p className="sn__label">Certifications</p>
          <ul className="sn__certs">
            {s.certs.map((c) => <li key={c}><Glyph name="award" size={13} /><span>{c}</span></li>)}
          </ul>
        </section>
      )}

      <section className="sn__sec">
        <p className="sn__label">Research &amp; engagements</p>
        <div className="sn__grid">
          {s.projects.map((p, i) => (
            <ProjectLink key={i} project={i} href={p.link} className="sn__card">
              <div className="sn__card-top">
                <span className="sn__id">SEC-{String(i + 1).padStart(3, '0')}</span>
                <span className="sn__hash">{hash(p.title + i)}</span>
              </div>
              <h3>{p.title || 'Untitled project'}</h3>
              {p.desc && <p>{p.desc}</p>}
              <span className="sn__read">Read write-up <Glyph name="right" size={12} /></span>
            </ProjectLink>
          ))}
        </div>
      </section>

      {s.skills.length > 0 && (
        <section className="sn__sec">
          <p className="sn__label">Capabilities</p>
          <ToolList items={s.skills} label="Capabilities" />
        </section>
      )}

      {s.paras.length > 0 && (
        <section className="sn__sec">
          <p className="sn__label">About</p>
          {s.paras.map((p, i) => <p key={i} className="sn__p">{p}</p>)}
        </section>
      )}

      {s.experience.length > 0 && (
        <section className="sn__sec">
          <p className="sn__label">Experience log</p>
          <ul className="sn__log">
            {s.experience.map((e, i) => (
              <li key={i}>
                <span className="sn__time">[{[e.from, e.to].filter(Boolean).join(' → ')}]</span>
                <span className="sn__ev"><b>{e.role}</b>{e.company && <> · {e.company}</>}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="sn__contact">
        <Glyph name="lock" size={18} />
        <h2>Enquiries &amp; responsible disclosure</h2>
        <MailLink email={s.email} className="sn__btn">{s.email || 'Add your email'}</MailLink>
      </section>
      <GetInTouch s={s} />
      <footer className="sn__foot"><span>© {s.year} {s.name}</span><span>Authorised testing only</span></footer>
    </div>
  );
}
