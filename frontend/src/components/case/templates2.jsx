/* ==========================================================================
   Case study templates, set 2: ten layouts modelled on the case study styles
   that read best on Behance (launch mockups, brand style sheets, numbered
   chapters, phone screens, image collages, a sticky index, bento tiles, an
   engineering log, a Swiss poster, soft gradients). Original designs: no
   Behance projects, images or text are used.

   They share the blocks in templates.jsx, so cover images, Figma screens, the
   design system, embeds, files and branding all work the same. Styles: case2.css.
   ========================================================================== */
import { cs } from './data.js';
import { Visual, Sec, Facts, Metrics, Steps, Goals, Tags, Quote, P, Cut, More, Gallery, LinkOut } from './templates.jsx';
import { DesignSpecs } from './extras.jsx';
import '../../case2.css';

const at = (list, i) => list[i] || null;
const kicker = (d, fallback = 'Case study') => [d.industry, d.timeline].filter(Boolean).join(' · ') || fallback;
const Tagline = ({ d, className = '' }) => d.tagline && <p className={`cs-tagline ${d.ghost.tagline ? 'is-ghost' : ''} ${className}`}>{d.tagline}</p>;

/* ---------- 1. Mockup: a product launch with the work in a browser frame ---------- */
function Mockup({ data }) {
  const d = cs(data);
  return (
    <div className="site cs cs2 cs-mockup">
      <header className="mk-hero">
        <p className="cs-kicker">{kicker(d)}</p>
        <h1 className="cs-title">{d.title}</h1>
        <Tagline d={d} />
        <div className="mk-stage">
          <div className="mk-browser"><span className="mk-dots" aria-hidden><i /><i /><i /></span><Visual img={d.cover} seed={d.title} ratio="16 / 10" /></div>
        </div>
        <Facts d={d} className="mk-facts" />
      </header>
      <div className="mk-intro">
        <Sec title="The problem" ghost={d.ghost.problem}><P>{d.problem}</P></Sec>
        <Sec title="Background" ghost={d.ghost.context}><P>{d.context}</P></Sec>
      </div>
      <More d={d} />
      {d.contribution && <Sec title="My part"><P>{d.contribution}</P></Sec>}
      <div className={`mk-rows ${d.ghost.process ? 'is-ghost' : ''}`}>
        {d.process.map((s, i) => (
          <section key={i} className="mk-row">
            <Visual img={at(d.gallery, i)} seed={d.title} i={i + 1} ratio="4 / 3" />
            <div><span className="mk-n">{String(i + 1).padStart(2, '0')}</span><h3>{s.title}</h3>{s.desc && <p className="cs-p">{s.desc}</p>}</div>
          </section>
        ))}
      </div>
      <Cut d={d} />
      <Sec title="The result" ghost={d.ghost.solution}><p className="cs-big">{d.solution}</p></Sec>
      <Metrics d={d} className="mk-metrics" />
      <Quote d={d} />
      <Gallery d={{ ...d, gallery: d.gallery.slice(d.process.length) }} ratio="16 / 10" />
      {d.learned && <Sec title="What I learned"><P>{d.learned}</P></Sec>}
      <Tags items={d.skills} />
      <LinkOut d={d} />
    </div>
  );
}

/* ---------- 2. Styleguide: a brand identity presentation ---------- */
function Styleguide({ data }) {
  const d = cs(data);
  return (
    <div className="site cs cs2 cs-styleguide">
      <header className="sg-hero">
        <div className="sg-mark"><p className="cs-kicker">{kicker(d, 'Identity')}</p><h1 className="cs-title">{d.title}</h1></div>
        <Tagline d={d} />
      </header>
      <Visual img={d.cover} seed={d.title} ratio="16 / 8" className="sg-cover" />
      <Facts d={d} />
      <div className="sg-cols">
        <Sec k="01" title="Brief" ghost={d.ghost.problem}><P>{d.problem}</P></Sec>
        <Sec k="02" title="Idea" ghost={d.ghost.solution}><P>{d.solution}</P></Sec>
      </div>
      <Sec k="03" title="The system" className="sg-system">
        {d.design ? <DesignSpecs design={d.design} /> : (
          <div className="sg-tiles" aria-hidden>
            <div className="sg-tile sg-tile--accent"><b>Accent</b></div>
            <div className="sg-tile sg-tile--ink"><b>Ink</b></div>
            <div className="sg-tile sg-tile--soft"><b>Paper</b></div>
            <div className="sg-tile sg-tile--type"><span>Aa</span><b>Type</b></div>
          </div>
        )}
      </Sec>
      <div className="sg-board">
        {(d.gallery.length ? d.gallery : [null, null, null, null, null]).slice(0, 6).map((g, i) => (
          <Visual key={i} img={g} seed={d.title} i={i + 2} ratio={i % 3 === 0 ? '4 / 5' : '4 / 3'} />
        ))}
      </div>
      <Sec k="04" title="How it came together" ghost={d.ghost.process}><Steps d={d} /></Sec>
      <Cut d={d} k="05" />
      <Metrics d={d} />
      <Quote d={d} />
      <Gallery d={{ ...d, gallery: d.gallery.slice(6), design: null }} />
      {d.learned && <Sec title="What I learned"><P>{d.learned}</P></Sec>}
      <Tags items={d.skills} />
      <LinkOut d={d} />
    </div>
  );
}

/* ---------- 3. Chapters: the story in big numbered chapters ---------- */
function Chapters({ data }) {
  const d = cs(data);
  const chapters = [
    ['Context', d.context, d.ghost.context], ['Problem', d.problem, d.ghost.problem],
    ...d.process.map((s) => [s.title, s.desc, d.ghost.process]),
    ['Outcome', d.solution, d.ghost.solution],
  ].filter(([, text]) => text);
  return (
    <div className="site cs cs2 cs-chapters">
      <header className="ch-hero">
        <p className="cs-kicker">{kicker(d)}</p>
        <h1 className="cs-title">{d.title}</h1>
        <Tagline d={d} />
        <Facts d={d} />
      </header>
      <Visual img={d.cover} seed={d.title} ratio="21 / 9" className="cs-cover" />
      {chapters.map(([title, text, ghost], i) => (
        <section key={i} className={`ch-ch ${ghost ? 'is-ghost' : ''}`}>
          <span className="ch-n" aria-hidden>{String(i + 1).padStart(2, '0')}</span>
          <div>
            <h2 className="cs-h">{title}</h2>
            <p className="cs-p">{text}</p>
            {i > 1 && at(d.gallery, i - 2) && <Visual img={at(d.gallery, i - 2)} seed={d.title} i={i} ratio="16 / 9" />}
          </div>
        </section>
      ))}
      <More d={d} />
      {d.contribution && <Sec title="My part"><P>{d.contribution}</P></Sec>}
      <Cut d={d} />
      <Metrics d={d} />
      <Quote d={d} />
      {d.learned && <Sec title="What I learned"><P>{d.learned}</P></Sec>}
      <Gallery d={{ ...d, gallery: d.gallery.slice(Math.max(0, chapters.length - 2)) }} />
      <Tags items={d.skills} />
      <LinkOut d={d} />
    </div>
  );
}

/* ---------- 4. Pocket: a mobile app, shown on phones ---------- */
const Phone = ({ img, seed, i }) => <div className="pk-phone"><span className="pk-notch" aria-hidden /><Visual img={img} seed={seed} i={i} ratio="9 / 19" /></div>;

function Pocket({ data }) {
  const d = cs(data);
  const screens = d.gallery.length ? d.gallery.slice(0, 5) : [null, null, null];
  return (
    <div className="site cs cs2 cs-pocket">
      <header className="pk-hero">
        <div>
          <p className="cs-kicker">{kicker(d, 'App case study')}</p>
          <h1 className="cs-title">{d.title}</h1>
          <Tagline d={d} />
          <Facts d={d} />
        </div>
        <Phone img={d.cover} seed={d.title} i={0} />
      </header>
      <Sec title="The problem" ghost={d.ghost.problem}><P>{d.problem}</P></Sec>
      <Sec title="Goals" ghost={d.ghost.goals}><Goals d={d} /></Sec>
      <More d={d} />
      <div className="pk-band" aria-label="Screens">{screens.map((g, i) => <Phone key={i} img={g} seed={d.title} i={i + 1} />)}</div>
      <Sec title="How I got there" ghost={d.ghost.process}><Steps d={d} className="pk-steps" /></Sec>
      {d.contribution && <Sec title="My part"><P>{d.contribution}</P></Sec>}
      <Cut d={d} />
      <Sec title="What shipped" ghost={d.ghost.solution}><P>{d.solution}</P></Sec>
      <Metrics d={d} />
      <Quote d={d} />
      {d.learned && <Sec title="What I learned"><P>{d.learned}</P></Sec>}
      <Gallery d={{ ...d, gallery: d.gallery.slice(5) }} />
      <Tags items={d.skills} />
      <LinkOut d={d} />
    </div>
  );
}

/* ---------- 5. Collage: images first, words as captions ---------- */
function Collage({ data }) {
  const d = cs(data);
  const imgs = [d.cover, ...d.gallery];
  const wall = imgs.filter(Boolean).length ? imgs.filter(Boolean) : [null, null, null, null, null, null];
  return (
    <div className="site cs cs2 cs-collage">
      <header className="cl-hero">
        <h1 className="cs-title">{d.title}</h1>
        <div><Tagline d={d} /><Facts d={d} /></div>
      </header>
      <div className="cl-wall">
        {wall.slice(0, 9).map((g, i) => <Visual key={i} img={g} seed={d.title} i={i} ratio={['4 / 5', '1 / 1', '4 / 3', '3 / 4', '16 / 10', '1 / 1'][i % 6]} />)}
      </div>
      <div className="cl-notes">
        <Sec title="The brief" ghost={d.ghost.problem}><P>{d.problem}</P></Sec>
        <Sec title="The approach" ghost={d.ghost.process}><ul className="cl-list">{d.process.map((s, i) => <li key={i}><b>{s.title}</b>{s.desc && ` ${s.desc}`}</li>)}</ul></Sec>
        <Sec title="The outcome" ghost={d.ghost.solution}><P>{d.solution}</P></Sec>
      </div>
      <More d={d} />
      <Cut d={d} />
      <Metrics d={d} />
      <Quote d={d} />
      <Gallery d={{ ...d, gallery: [] }} />
      {d.learned && <Sec title="Notes"><P>{d.learned}</P></Sec>}
      <Tags items={d.skills} />
      <LinkOut d={d} />
    </div>
  );
}

/* ---------- 6. Split: a sticky index beside the story ---------- */
function Split({ data }) {
  const d = cs(data);
  const parts = [['context', 'Background', d.context, d.ghost.context], ['problem', 'Problem', d.problem, d.ghost.problem],
    ['approach', 'Approach', d.process.length ? 'x' : '', d.ghost.process], ['outcome', 'Outcome', d.solution, d.ghost.solution],
    ['learned', 'Lessons', d.learned, false]].filter(([, , v]) => v);
  return (
    <div className="site cs cs2 cs-split">
      <aside className="sp-side">
        <p className="cs-kicker">{kicker(d)}</p>
        <h1 className="cs-title">{d.title}</h1>
        <Tagline d={d} />
        <Facts d={d} />
        <nav className="sp-toc" aria-label="Sections">{parts.map(([id, label], i) => <a key={id} href={`#sp-${id}`}><span>{String(i + 1).padStart(2, '0')}</span>{label}</a>)}</nav>
      </aside>
      <main className="sp-main">
        <Visual img={d.cover} seed={d.title} ratio="16 / 10" />
        <Metrics d={d} />
        <div id="sp-context"><Sec title="Background" ghost={d.ghost.context}><P>{d.context}</P></Sec></div>
        <div id="sp-problem"><Sec title="Problem" ghost={d.ghost.problem}><P>{d.problem}</P></Sec><Sec title="Goals" ghost={d.ghost.goals}><Goals d={d} /></Sec></div>
        <More d={d} />
        <div id="sp-approach"><Sec title="Approach" ghost={d.ghost.process}><Steps d={d} /></Sec>{d.contribution && <Sec title="My part"><P>{d.contribution}</P></Sec>}<Cut d={d} /></div>
        <div id="sp-outcome"><Sec title="Outcome" ghost={d.ghost.solution}><P>{d.solution}</P></Sec><Quote d={d} /></div>
        <Gallery d={d} ratio="16 / 10" />
        <div id="sp-learned">{d.learned && <Sec title="Lessons"><P>{d.learned}</P></Sec>}</div>
        <Tags items={d.skills} />
        <LinkOut d={d} />
      </main>
    </div>
  );
}

/* ---------- 7. Tiles: the whole story as a bento grid first ---------- */
function Tiles({ data }) {
  const d = cs(data);
  const m = d.metrics;
  return (
    <div className="site cs cs2 cs-tiles">
      <header className="tl-hero"><p className="cs-kicker">{kicker(d)}</p><h1 className="cs-title">{d.title}</h1><Tagline d={d} /></header>
      <div className="tl-grid">
        <div className="tl-t tl-t--cover"><Visual img={d.cover} seed={d.title} ratio="16 / 10" /></div>
        <div className={`tl-t tl-t--problem ${d.ghost.problem ? 'is-ghost' : ''}`}><span className="tl-k">Problem</span><p>{d.problem}</p></div>
        {m[0] && <div className={`tl-t tl-t--metric ${d.ghost.metrics ? 'is-ghost' : ''}`}><b>{m[0].value}</b><span>{m[0].label}</span></div>}
        {d.role && <div className="tl-t tl-t--role"><span className="tl-k">Role</span><p>{d.role}</p>{d.timeline && <small>{d.timeline}</small>}</div>}
        {m[1] && <div className={`tl-t tl-t--metric2 ${d.ghost.metrics ? 'is-ghost' : ''}`}><b>{m[1].value}</b><span>{m[1].label}</span></div>}
        <div className={`tl-t tl-t--solution ${d.ghost.solution ? 'is-ghost' : ''}`}><span className="tl-k">Solution</span><p>{d.solution}</p></div>
        {d.skills.length > 0 && <div className="tl-t tl-t--skills"><span className="tl-k">Tools</span><Tags items={d.skills} /></div>}
      </div>
      <Sec title="Background" ghost={d.ghost.context}><P>{d.context}</P></Sec>
      <Sec title="Goals" ghost={d.ghost.goals}><Goals d={d} /></Sec>
      <More d={d} />
      <Sec title="Process" ghost={d.ghost.process}><Steps d={d} className="tl-steps" /></Sec>
      {d.contribution && <Sec title="My part"><P>{d.contribution}</P></Sec>}
      <Cut d={d} />
      {m.length > 2 && <Metrics d={{ ...d, metrics: m.slice(2) }} />}
      <Quote d={d} />
      <Gallery d={d} />
      {d.learned && <Sec title="What I learned"><P>{d.learned}</P></Sec>}
      <LinkOut d={d} />
    </div>
  );
}

/* ---------- 8. Terminal: an engineering log ---------- */
const hash = (s, i) => { let h = 2166136261; for (const c of `${s}${i}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return (h >>> 0).toString(16).padStart(8, '0').slice(0, 7); };

function Terminal({ data }) {
  const d = cs(data);
  const Cmd = ({ c, children, ghost }) => <section className={`tm-block ${ghost ? 'is-ghost' : ''}`}><h2 className="tm-cmd"><span aria-hidden>$ </span>{c}</h2>{children}</section>;
  return (
    <div className="site cs cs2 cs-terminal">
      <header className="tm-hero">
        <p className="tm-path">~/{(d.client || 'projects').toLowerCase().replace(/[^a-z0-9]+/g, '-')}/<b>{d.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}</b></p>
        <h1 className="cs-title">{d.title}</h1>
        <Tagline d={d} />
        <Facts d={d} />
      </header>
      <div className="tm-window"><span className="mk-dots" aria-hidden><i /><i /><i /></span><Visual img={d.cover} seed={d.title} ratio="16 / 9" /></div>
      <Cmd c="cat CONTEXT.md" ghost={d.ghost.context}><P>{d.context}</P></Cmd>
      <Cmd c="cat PROBLEM.md" ghost={d.ghost.problem}><P>{d.problem}</P></Cmd>
      {d.goals.length > 0 && <Cmd c="cat GOALS" ghost={d.ghost.goals}><ul className="tm-goals">{d.goals.map((g, i) => <li key={i}>[ ] {g}</li>)}</ul></Cmd>}
      <More d={d} />
      <Cmd c="git log --oneline" ghost={d.ghost.process}>
        <ol className="tm-log">{d.process.map((s, i) => <li key={i}><code>{hash(d.title, i)}</code><div><b>{s.title}</b>{s.desc && <p>{s.desc}</p>}</div></li>)}</ol>
      </Cmd>
      {d.contribution && <Cmd c="git shortlog --author=me"><P>{d.contribution}</P></Cmd>}
      {d.tradeoffs && <Cmd c="git revert --no-commit idea"><P>{d.tradeoffs}</P></Cmd>}
      <Cmd c="./run --release" ghost={d.ghost.solution}><P>{d.solution}</P></Cmd>
      {d.metrics.length > 0 && (
        <Cmd c="bench --summary" ghost={d.ghost.metrics}>
          <table className="tm-bench"><tbody>{d.metrics.map((m, i) => <tr key={i}><td>{m.label}</td><td>{m.value}</td></tr>)}</tbody></table>
        </Cmd>
      )}
      <Quote d={d} />
      <Gallery d={d} ratio="16 / 10" />
      {d.learned && <Cmd c="cat LESSONS.md"><P>{d.learned}</P></Cmd>}
      {d.skills.length > 0 && <Cmd c="cat stack.json"><p className="tm-stack">{`{ "stack": [${d.skills.map((s) => `"${s}"`).join(', ')}] }`}</p></Cmd>}
      <LinkOut d={d} />
    </div>
  );
}

/* ---------- 9. Poster: Swiss, huge type and colour blocks ---------- */
function Poster({ data }) {
  const d = cs(data);
  const words = d.title.split(' ');
  return (
    <div className="site cs cs2 cs-poster">
      <header className="ps-hero">
        <h1 className="cs-title">{words.map((w, i) => <span key={i}>{w} </span>)}</h1>
        <div className="ps-side"><p className="cs-kicker">{kicker(d)}</p><Tagline d={d} /><Facts d={d} /></div>
      </header>
      {d.metrics[0] && <div className={`ps-block ${d.ghost.metrics ? 'is-ghost' : ''}`}><b>{d.metrics[0].value}</b><span>{d.metrics[0].label}</span></div>}
      <Visual img={d.cover} seed={d.title} ratio="16 / 9" className="ps-cover" />
      <div className="ps-grid">
        <Sec k="A" title="Problem" ghost={d.ghost.problem}><P>{d.problem}</P></Sec>
        <Sec k="B" title="Goals" ghost={d.ghost.goals}><Goals d={d} /></Sec>
        <Sec k="C" title="Answer" ghost={d.ghost.solution}><P>{d.solution}</P></Sec>
      </div>
      <More d={d} />
      <Sec k="D" title="Process" ghost={d.ghost.process}><Steps d={d} className="ps-steps" /></Sec>
      {d.contribution && <Sec k="E" title="My part"><P>{d.contribution}</P></Sec>}
      <Cut d={d} k="F" />
      {d.metrics.length > 1 && <Metrics d={{ ...d, metrics: d.metrics.slice(1) }} />}
      <Quote d={d} />
      <Gallery d={d} />
      {d.learned && <Sec title="Lesson"><p className="cs-big">{d.learned}</p></Sec>}
      <Tags items={d.skills} />
      <LinkOut d={d} />
    </div>
  );
}

/* ---------- 10. Aurora: soft gradients and glass cards ---------- */
function Aurora({ data }) {
  const d = cs(data);
  const Card = ({ title, ghost, children }) => <section className={`au-card ${ghost ? 'is-ghost' : ''}`}><h2 className="cs-h">{title}</h2>{children}</section>;
  return (
    <div className="site cs cs2 cs-aurora">
      <div className="au-glow" aria-hidden><i /><i /><i /></div>
      <header className="au-hero">
        <p className="au-pill">{kicker(d)}</p>
        <h1 className="cs-title">{d.title}</h1>
        <Tagline d={d} />
        <Facts d={d} />
      </header>
      <div className="au-shot"><Visual img={d.cover} seed={d.title} ratio="16 / 9" /></div>
      <Metrics d={d} className="au-metrics" />
      <div className="au-cards">
        <Card title="The problem" ghost={d.ghost.problem}><P>{d.problem}</P></Card>
        <Card title="Goals" ghost={d.ghost.goals}><Goals d={d} /></Card>
        <Card title="Background" ghost={d.ghost.context}><P>{d.context}</P></Card>
        {d.contribution && <Card title="My part"><P>{d.contribution}</P></Card>}
      </div>
      <More d={d} />
      <Sec title="How it came together" ghost={d.ghost.process}><Steps d={d} className="au-steps" /></Sec>
      <Cut d={d} />
      <Sec title="The result" ghost={d.ghost.solution}><p className="cs-big">{d.solution}</p></Sec>
      <Quote d={d} />
      <Gallery d={d} ratio="16 / 10" />
      {d.learned && <Sec title="What I learned"><P>{d.learned}</P></Sec>}
      <Tags items={d.skills} />
      <LinkOut d={d} />
    </div>
  );
}

export { Mockup, Styleguide, Chapters, Pocket, Collage, Split, Tiles, Terminal, Poster, Aurora };
