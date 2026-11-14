import { useEffect, useRef } from 'react';
import { ToolList } from './tools.jsx';
import { site, Shot, Glyph, MailLink, Avatar } from './shared.jsx';
import { brandProps } from './brand.js';

const pad = (n) => String(n).padStart(2, '0');
const list = (v) => (Array.isArray(v) ? v : String(v || '').split(',')).map((x) => x.trim()).filter(Boolean);
const paras = (t) => String(t || '').split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean);

/**
 * Everything about one portfolio project, on its own page: the write-up,
 * the facts, every image and video, and the way back to the rest of the work.
 * Styled to sit with the portfolio's template, and the user's branding.
 */
export default function ProjectView({ template = 'folio', data, index, onBack, onGo, hrefFor }) {
  const s = site(data);
  const p = s.projects[index];
  const top = useRef(null);

  // Start at the top of each project, like a new page. scroll-margin-top in
  // the CSS keeps it clear of sticky bars, such as the editor's.
  useEffect(() => {
    const el = top.current;
    if (el && el.getBoundingClientRect().top < 80) el.scrollIntoView({ block: 'start' });
  }, [index]);

  if (!p) return null;
  const media = (p.media || []).filter((m) => m.src);
  const [hero, ...rest] = media;
  const tools = list(p.tools);
  const facts = [['Role', p.role], ['Year', p.year], ['Tools', tools.length > 0 && <ToolList items={tools} size="sm" label="Tools used" />]].filter(([, v]) => v);
  const body = paras(p.details);
  const total = s.projects.length;
  const prev = index > 0 ? index - 1 : null;
  const next = index < total - 1 ? index + 1 : null;
  const link = p.link && !/^https?:\/\//i.test(p.link) ? `https://${p.link}` : p.link;

  const NavLink = ({ to, className, children }) => (
    <a className={className} href={hrefFor?.(to) || '#'} onClick={(e) => {
      if (hrefFor && (e.metaKey || e.ctrlKey || e.shiftKey)) return;
      e.preventDefault();
      if (to === 'home') onBack(); else onGo(to);
    }}>{children}</a>
  );

  return (
    <div {...brandProps(data?.brand)}>
      <article ref={top} className={`site pv pv--${template}`}>
        <header className="pv__bar">
          <NavLink to="home" className="pv__back"><Glyph name="prev" size={14} stroke={2} /> All work</NavLink>
          <span className="pv__who"><Avatar s={s} className="avp avp--pv" fallback={false} /><span className="pv__who-t"><b>{s.name}</b><span>{s.role}</span></span></span>
          <span className="pv__count">{pad(index + 1)} / {pad(total)}</span>
        </header>

        <section className="pv__intro">
          <p className="pv__k">Project {pad(index + 1)}</p>
          <h1 className="pv__title">{p.title || 'Untitled project'}</h1>
          {p.desc && <p className="pv__lead">{p.desc}</p>}
          {(facts.length > 0 || link) && (
            <div className="pv__meta">
              {facts.length > 0 && (
                <dl className="pv__facts">
                  {facts.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
                </dl>
              )}
              {link && <a className="pv__visit" href={link} target="_blank" rel="noreferrer">Visit project <Glyph name="arrow" size={13} stroke={2} /></a>}
            </div>
          )}
        </section>

        <figure className="pv__hero">
          {hero
            ? <Media m={hero} title={p.title} />
            : <Shot title={p.title} i={index} />}
          {hero?.caption && <figcaption>{hero.caption}</figcaption>}
        </figure>

        {body.length > 0 && (
          <section className="pv__story">
            <p className="pv__k">About the project</p>
            <div className="pv__text">
              {body.map((t, i) => <p key={i}>{t}</p>)}
            </div>
          </section>
        )}

        {rest.length > 0 && (
          <section className="pv__gallery" aria-label="More images and videos">
            {rest.map((m, i) => (
              <figure key={`${m.src}-${i}`} className={`pv__shot ${rest.length % 2 && i === rest.length - 1 ? 'is-wide' : ''}`}>
                <Media m={m} title={p.title} />
                {m.caption && <figcaption>{m.caption}</figcaption>}
              </figure>
            ))}
          </section>
        )}

        <nav className="pv__pager" aria-label="More projects">
          {prev != null
            ? <NavLink to={prev} className="pv__step"><small>← Previous</small><span>{s.projects[prev].title || 'Untitled project'}</span></NavLink>
            : <NavLink to="home" className="pv__step"><small>← Back</small><span>All work</span></NavLink>}
          {next != null
            ? <NavLink to={next} className="pv__step pv__step--next"><small>Next →</small><span>{s.projects[next].title || 'Untitled project'}</span></NavLink>
            : <NavLink to="home" className="pv__step pv__step--next"><small>Back to →</small><span>All work</span></NavLink>}
        </nav>

        {s.email && (
          <footer className="pv__foot">
            <span>Like this work?</span>
            <MailLink email={s.email} className="pv__mail">{s.email}</MailLink>
          </footer>
        )}
      </article>
    </div>
  );
}

function Media({ m, title }) {
  return m.type === 'video'
    ? <video className="pv__media" src={m.src} controls playsInline preload="metadata" aria-label={m.caption || title || 'Project video'} />
    : <img className="pv__media" src={m.src} alt={m.caption || title || ''} />;
}
