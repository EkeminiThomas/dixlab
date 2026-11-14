import { site, hash, ProjectLink, MailLink } from './shared.jsx';
import { Avatar } from './shared.jsx';
import { GetInTouch } from './contact.jsx';
import { ToolList } from './tools.jsx';

const slug = (t = '') => t.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'untitled';

function Cmd({ children }) {
  return <p className="term__cmd"><span className="term__ps">~ $</span> {children}</p>;
}

/* Terminal — a developer portfolio that reads like a shell session. */
export default function Terminal({ data }) {
  const s = site(data);
  return (
    <div className="site term">
      <div className="term__chrome">
        <span className="term__dots"><i /><i /><i /></span>
        <span className="term__path">{s.handle || 'me'}@portfolio: ~</span>
        <span />
      </div>
      <nav className="term__tabs"><span className="is-on">about.md</span><span>projects/</span><span>contact.sh</span></nav>

      <div className="term__body">
        <Cmd>whoami</Cmd>
        <div className="term__who">
          <Avatar s={s} className="avp avp--term" fallback={false} />
          <h1 className="term__name">{s.name}</h1>
        </div>
        <p className="term__role"><span className="term__hl">#</span> {s.role}</p>
        {s.tagline && s.tagline.split('\n').map((l, i) => <p key={i} className="term__dim">// {l}</p>)}

        {s.paras.length > 0 && (
          <>
            <Cmd>cat about.md</Cmd>
            {s.paras.map((p, i) => <p key={i} className="term__p">{p}</p>)}
          </>
        )}

        <Cmd>ls -la projects/</Cmd>
        <ul className="term__ls">
          {s.projects.map((p, i) => (
            <li key={i}>
              <ProjectLink project={i} href={p.link} className="term__dir">
                <span className="term__perm">drwxr-xr-x</span> {slug(p.title)}/
              </ProjectLink>
              {p.desc && <p className="term__dim">{p.desc}</p>}
            </li>
          ))}
        </ul>

        {s.skills.length > 0 && (
          <>
            <Cmd>cat stack.json</Cmd>
            <ToolList items={s.skills} className="term__stack" label="Stack" />
          </>
        )}

        {s.experience.length > 0 && (
          <>
            <Cmd>git log --oneline career</Cmd>
            <ul className="term__log">
              {s.experience.map((e, i) => (
                <li key={i}>
                  <span className="term__hash">{hash(e.role + e.company + e.from)}</span>
                  <span className="term__dim">({[e.from, e.to].filter(Boolean).join('–')})</span>{' '}
                  {e.role}{e.company && <span className="term__at"> @ {e.company}</span>}
                </li>
              ))}
            </ul>
          </>
        )}

        <Cmd>./contact.sh</Cmd>
        <p className="term__p">
          <span className="term__hl">→</span>{' '}
          {s.email ? <MailLink email={s.email} className="term__link">{s.email}</MailLink> : <span className="term__dim">add your email to show it here</span>}
        </p>

        <Cmd>./message.sh</Cmd>
        <GetInTouch s={s} title="Send a message" />

        <p className="term__prompt"><span className="term__user">{s.handle || 'me'}@portfolio</span>:<span className="term__hl">~</span>$ <i className="term__cursor" /></p>
      </div>
    </div>
  );
}
