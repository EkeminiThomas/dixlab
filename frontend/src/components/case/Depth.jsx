import { useContext, useRef, useState } from 'react';
import { cs } from './data.js';
import { Visual, Files } from './templates.jsx';
import { BeforeAfter, Embeds } from './extras.jsx';
import { StaticSite } from '../sites/shared.jsx';
import { usePointerTilt, scrollToPart } from '../sites/three.js';

const pad = (n) => String(n).padStart(2, '0');
const first = (t = '') => (t.match(/^[^.!?]+[.!?]?/) || [t])[0].trim();

/* Depth — a dark 3D case study: a layered hero you can see into, panels on a
   curved wall, the process as rising towers of cubes, a cover-flow gallery
   and result tiles that stand up when you point at them. Styles: three.css */
export function Depth({ data }) {
  const d = cs(data);
  const root = useRef(null);
  const tilt = usePointerTilt();
  const isStatic = useContext(StaticSite);
  const g = (k) => (d.ghost[k] ? 'is-ghost' : '');
  const go = (part) => () => scrollToPart(root.current, part);
  const Nav = ({ part, children, className }) => (isStatic
    ? <span className={className}>{children}</span>
    : <button type="button" className={className} onClick={go(part)}>{children}</button>);

  const kicker = [d.industry, 'Case study', d.timeline].filter(Boolean).join(' · ');
  const [m1, m2] = d.metrics;
  const panels = [
    d.context && ['Background', d.context, g('context')],
    d.audience && ['Who it’s for', d.audience, ''],
    d.constraints && ['Constraints', d.constraints, ''],
    d.research && ['Research', d.research, ''],
  ].filter(Boolean).slice(0, 3);
  const steps = d.process.slice(0, 6);
  const gallery = d.gallery.length ? d.gallery : [null, null, null];

  return (
    <div className="site cs dp" ref={root}>
      <header className="dp__nav">
        <span className="dp__brand"><i aria-hidden />{d.client || d.title}</span>
        <nav className="dp__links" aria-label="Sections">
          <Nav part="problem">Problem</Nav>
          {steps.length > 0 && <Nav part="process">Process</Nav>}
          <Nav part="solution">Solution</Nav>
          {d.metrics.length > 0 && <Nav part="results">Results</Nav>}
        </nav>
      </header>

      <div className="dp__hero" ref={tilt} data-part="top">
        <div className="dp__floor" aria-hidden><i /></div>
        <div className="dp__intro">
          <p className="dp__kicker"><i aria-hidden />{kicker}</p>
          <h1 className="dp__title">{d.title}</h1>
          {d.tagline && <p className={`dp__tagline ${g('tagline')}`}>{d.tagline}</p>}
          <div className="dp__actions">
            {d.metrics.length > 0 && <Nav part="results" className="dp__btn">See the results <span aria-hidden>↓</span></Nav>}
            <Nav part="problem" className="dp__btn dp__btn--ghost">Read the story</Nav>
          </div>
        </div>

        <div className="dp__stage" aria-hidden>
          <div className="dp__stack">
            <div className="dp__layer dp__layer--back"><Visual img={d.gallery[0]} seed={d.title} i={4} ratio="4 / 5" /></div>
            <div className="dp__layer dp__layer--main"><Visual img={d.cover} seed={d.title} ratio="4 / 5" /></div>
            {m1 && <div className={`dp__chip dp__chip--a ${g('metrics')}`}><span>{m1.label}</span><b>{m1.value}</b></div>}
            {m2 && <div className={`dp__chip dp__chip--b ${g('metrics')}`}><span>{m2.label}</span><b>{m2.value}</b></div>}
            {d.role && <div className="dp__toast">✓ {d.role}</div>}
          </div>
        </div>

        {d.facts.length > 0 && (
          <dl className="dp__facts">
            {d.facts.slice(0, 4).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
          </dl>
        )}
      </div>

      <section className="dp__sec" data-part="problem">
        <p className="dp__k">01 — The problem</p>
        <h2 className={`dp__h2 ${g('problem')}`}>{d.problem || 'What problem did this solve?'}</h2>
        {panels.length > 0 && (
          <div className="dp__wall" style={{ '--n': panels.length }}>
            {panels.map(([k, body, ghost], i) => (
              <div key={k} className={`dp__panel ${ghost}`} style={{ '--i': i }}>
                <span className="dp__n">{pad(i + 1)}</span>
                <h3>{k}</h3>
                <p>{body}</p>
              </div>
            ))}
          </div>
        )}
        {d.goals.length > 0 && (
          <div className={`dp__goals ${g('goals')}`}>
            <p className="dp__k dp__k--dim">What we set out to do</p>
            <ul>{d.goals.map((x, i) => <li key={i}><span>Goal {pad(i + 1)}</span>{x}</li>)}</ul>
          </div>
        )}
      </section>

      {steps.length > 0 && (
        <section className={`dp__sec dp__process ${g('process')}`} data-part="process">
          <p className="dp__k">02 — How it came together</p>
          <h2 className="dp__h2">{steps.length === 1 ? 'One step at a time.' : `${steps.length} steps, each built on the last.`}</h2>
          <ol className="dp__towers" style={{ '--n': steps.length }}>
            {steps.map((st, i) => (
              <li key={i} className={`dp__tower ${i === steps.length - 1 ? 'is-last' : ''}`}>
                <div className="dp__cubes" aria-hidden>
                  {Array.from({ length: i + 1 }, (_, k) => (
                    <span key={k} className={`dp__cube ${k === i ? 'is-top' : ''}`} style={{ '--k': k }}>
                      <i className="dp__cf dp__cf--front" /><i className="dp__cf dp__cf--side" /><i className="dp__cf dp__cf--top" />
                    </span>
                  ))}
                </div>
                <p className="dp__step-k">{pad(i + 1)} · {st.title || 'Step'}</p>
                {st.desc && <p className="dp__step-d">{st.desc}</p>}
              </li>
            ))}
          </ol>
        </section>
      )}

      {(d.tradeoffs || d.contribution) && (
        <section className="dp__sec dp__cut">
          {d.tradeoffs && (
            <div className="dp__cut-scene" aria-hidden>
              <div className="dp__cut-card dp__cut-card--kept"><b>What shipped</b><span>{first(d.solution) || 'The core of the work'}</span></div>
              <div className="dp__cut-card dp__cut-card--cut"><b>What I cut</b><span>{first(d.tradeoffs)}</span></div>
            </div>
          )}
          <div className="dp__cut-text">
            {d.tradeoffs && <><p className="dp__k dp__k--warm">03 — What I cut, and why</p><p className="dp__big">{d.tradeoffs}</p></>}
            {d.contribution && <><p className="dp__k dp__k--dim">My part</p><p className="dp__p">{d.contribution}</p></>}
          </div>
        </section>
      )}

      <section className="dp__sec dp__solution" data-part="solution">
        <div className="dp__sol-head">
          <div><p className="dp__k">04 — The solution</p><h2 className="dp__h2">What we made.</h2></div>
          <p className={`dp__p ${g('solution')}`}>{d.solution}</p>
        </div>
        <Coverflow items={gallery} seed={d.title} />
        {d.compare && <BeforeAfter compare={d.compare} />}
        {d.embeds?.length > 0 && <Embeds items={d.embeds} />}
      </section>

      {d.metrics.length > 0 && (
        <section className={`dp__sec dp__results ${g('metrics')}`} data-part="results">
          <p className="dp__k dp__k--mint">05 — Results</p>
          <h2 className="dp__h2">What changed.</h2>
          <ul className="dp__tiles">
            {d.metrics.map((m, i) => (
              <li key={i} className="dp__tile" tabIndex={isStatic ? undefined : 0}>
                <span className="dp__tile-k">Result {pad(i + 1)}</span>
                <b>{m.value}</b>
                <span className="dp__tile-l">{m.label}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {d.quote && (
        <section className="dp__sec dp__quote">
          <div className="dp__quote-stack">
            <span className="dp__ghostcard" aria-hidden /><span className="dp__ghostcard dp__ghostcard--2" aria-hidden />
            <blockquote className="dp__quote-card">
              <p>“{d.quote.replace(/^["“]|["”]$/g, '')}”</p>
              {d.quoteBy && <cite>— {d.quoteBy}</cite>}
            </blockquote>
          </div>
        </section>
      )}

      {(d.learned || d.next || d.skills.length > 0) && (
        <section className="dp__sec dp__more">
          {d.learned && <div className="dp__box"><p className="dp__k">What I learned</p><p>{d.learned}</p></div>}
          {d.next && <div className="dp__box"><p className="dp__k dp__k--mint">What’s next</p><p>{d.next}</p></div>}
          {d.skills.length > 0 && <div className="dp__box"><p className="dp__k dp__k--dim">Skills & tools</p><ul className="dp__tags">{d.skills.map((x) => <li key={x}>{x}</li>)}</ul></div>}
        </section>
      )}

      <div className="dp__files"><Files d={d} /></div>

      <footer className="dp__foot">
        {d.link && <><p className="dp__k">See it live</p><p className="dp__link">{d.link.replace(/^https?:\/\//, '')} <span aria-hidden>↗</span></p></>}
        {!isStatic && <button type="button" className="dp__btn dp__btn--ghost" onClick={go('top')}>Back to top <span aria-hidden>↑</span></button>}
      </footer>
    </div>
  );
}

/** Cover-flow gallery: the active image faces you, its neighbours angle away. */
function Coverflow({ items, seed }) {
  const isStatic = useContext(StaticSite);
  const [at, setAt] = useState(0);
  const n = items.length;
  const turn = (by) => setAt((a) => (a + by + n) % n);
  const caption = items[at]?.caption || `Image ${at + 1} of ${n}`;
  return (
    <div
      className="dp__flow"
      role="group"
      aria-roledescription="carousel"
      aria-label="Gallery"
      onKeyDown={(e) => { if (e.key === 'ArrowRight') turn(1); if (e.key === 'ArrowLeft') turn(-1); }}
    >
      <div className="dp__flow-stage">
        {items.map((img, i) => {
          const off = i - at;
          return (
            <div
              key={i}
              className={`dp__slide ${off === 0 ? 'is-active' : ''}`}
              style={{ '--off': off, '--abs': Math.abs(off) }}
              aria-hidden={off !== 0}
              onClick={() => !isStatic && off !== 0 && setAt(i)}
            >
              <Visual img={img} seed={seed} i={i + 1} ratio="3 / 4" />
            </div>
          );
        })}
      </div>
      {n > 1 && (
        <div className="dp__flow-bar">
          <p className="dp__flow-cap" aria-live="polite"><span>{pad(at + 1)} / {pad(n)}</span>{caption}</p>
          {!isStatic && (
            <div className="dp__pager">
              <button type="button" className="dp__arrow" onClick={() => turn(-1)} aria-label="Previous image">←</button>
              <span className="dp__dots" aria-hidden>{items.map((_, i) => <i key={i} className={i === at ? 'is-on' : ''} />)}</span>
              <button type="button" className="dp__arrow dp__arrow--next" onClick={() => turn(1)} aria-label="Next image">→</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
