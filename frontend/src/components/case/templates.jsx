/* ==========================================================================
   Case study templates. Each renders a responsive page (it's a `.site`, so
   container queries, branding fonts, accent colour and motion all apply).
   Styles live in case.css.
   ========================================================================== */
import { useContext } from 'react';
import { cs } from './data.js';
import { hash, StaticSite } from '../sites/shared.jsx';
import { fileExt, fileSize } from '../media.js';

const BADGE = { pdf: 'PDF', docx: 'DOC', pptx: 'PPT', xlsx: 'XLS' };

/* ---------- Visuals: the user's image, or generated artwork ---------- */

const PALETTES = [
  ['#1e1b4b', '#a5b4fc', '#f472b6'], ['#0f2e24', '#6ee7b7', '#fde68a'], ['#3b1d0f', '#fdba74', '#fef3c7'],
  ['#0b2545', '#8ecae6', '#ffb703'], ['#2a0f2f', '#f0abfc', '#67e8f9'], ['#18181b', '#e4e4e7', '#f97316'],
];

export function Visual({ img, seed = '', i = 0, ratio = '16 / 10', className = '', caption }) {
  const h = parseInt(hash(`${seed}${i}`), 16);
  const [bg, fg, hi] = PALETTES[(h + i) % PALETTES.length];
  const kind = (h >> 3) % 3;
  return (
    <figure className={`csv ${className}`}>
      <div className="csv__media" style={{ aspectRatio: ratio, background: img?.src ? '#eee' : bg }}>
        {img?.src && img.type === 'video' ? <video src={img.src} muted loop playsInline autoPlay preload="metadata" aria-label={img.caption || caption || 'Video'} />
          : img?.src ? <img src={img.src} alt={img.caption || caption || ''} loading="lazy" /> : (
          <div className={`csv__art csv__art--${kind}`} style={{ '--fg': fg, '--hi': hi }} aria-hidden>
            <i /><i /><i /><b /><b /><b />
          </div>
        )}
      </div>
      {(img?.caption || caption) && <figcaption>{img?.caption || caption}</figcaption>}
    </figure>
  );
}

/* ---------- Building blocks ---------- */

const Sec = ({ k, title, ghost, className = '', children }) => (
  <section className={`cs-sec ${ghost ? 'is-ghost' : ''} ${className}`}>
    {(k || title) && <h2 className="cs-h">{k && <span className="cs-k">{k}</span>}{title}</h2>}
    {children}
  </section>
);

const Facts = ({ d, className = '' }) => d.facts.length > 0 && (
  <dl className={`cs-facts ${className}`}>
    {d.facts.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
  </dl>
);

const Metrics = ({ d, className = '' }) => d.metrics.length > 0 && (
  <ul className={`cs-metrics ${d.ghost.metrics ? 'is-ghost' : ''} ${className}`}>
    {d.metrics.map((m, i) => <li key={i}><b>{m.value}</b><span>{m.label}</span></li>)}
  </ul>
);

const Steps = ({ d, className = '' }) => (
  <ol className={`cs-steps ${className}`}>
    {d.process.map((s, i) => (
      <li key={i}><span className="cs-steps__n">{String(i + 1).padStart(2, '0')}</span><div><h3>{s.title}</h3>{s.desc && <p>{s.desc}</p>}</div></li>
    ))}
  </ol>
);

const Goals = ({ d }) => <ul className="cs-goals">{d.goals.map((g, i) => <li key={i}>{g}</li>)}</ul>;
const Tags = ({ items }) => items.length > 0 && <ul className="cs-tags">{items.map((s) => <li key={s}>{s}</li>)}</ul>;
const Quote = ({ d, className = '' }) => d.quote && (
  <blockquote className={`cs-quote ${className}`}><p>“{d.quote.replace(/^["“]|["”]$/g, '')}”</p>{d.quoteBy && <cite>{d.quoteBy}</cite>}</blockquote>
);
const P = ({ children }) => children ? <p className="cs-p">{children}</p> : null;

/** What they cut or decided against: where the thinking shows. */
const Cut = ({ d, k, title = 'What I cut, and why' }) => d.tradeoffs && <Sec k={k} title={title} className="cs-cut"><P>{d.tradeoffs}</P></Sec>;

/** Optional supporting sections, shown only when filled in. */
const More = ({ d }) => (
  <>
    {(d.audience || d.constraints) && (
      <div className="cs-pair">
        {d.audience && <Sec title="Audience"><P>{d.audience}</P></Sec>}
        {d.constraints && <Sec title="Constraints"><P>{d.constraints}</P></Sec>}
      </div>
    )}
  </>
);

const Gallery = ({ d, className = '', ratio = '4 / 3', min = 0 }) => {
  const items = d.gallery.length ? d.gallery : Array.from({ length: min }, () => null);
  return items.length > 0 && (
    <div className={`cs-gallery ${className}`}>
      {items.map((g, i) => <Visual key={i} img={g} seed={d.title} i={i + 1} ratio={ratio} />)}
    </div>
  );
};

/** Attachments (reports, decks, specs) people can open or download. */
function Files({ d }) {
  const isStatic = useContext(StaticSite);
  if (!d.files.length) return null;
  return (
    <Sec title="Files" className="cs-files">
      <ul className="cs-filelist">
        {d.files.map((f, i) => {
          const ext = fileExt(f.src);
          const body = (
            <>
              <span className="cs-file__ext">{BADGE[ext] || ext.toUpperCase()}</span>
              <span className="cs-file__name">{f.name || 'Attachment'}</span>
              <span className="cs-file__size">{fileSize(f.size)}</span>
              <span className="cs-file__go" aria-hidden>{ext === 'pdf' ? '↗' : '↓'}</span>
            </>
          );
          return (
            <li key={i}>
              {isStatic ? <span className="cs-file">{body}</span>
                : <a className="cs-file" href={f.src} target="_blank" rel="noreferrer" download={ext === 'pdf' ? undefined : (f.name || true)}>{body}</a>}
            </li>
          );
        })}
      </ul>
    </Sec>
  );
}

const LinkOut = ({ d }) => (
  <>
    <Files d={d} />
    {d.link && <p className="cs-link">View the project <span>→</span> {d.link.replace(/^https?:\/\//, '')}</p>}
  </>
);

/* ---------- 1. Chronicle: editorial long-read ---------- */
function Chronicle({ data }) {
  const d = cs(data);
  return (
    <div className="site cs cs-chronicle">
      <header className="cs-hero">
        <p className="cs-kicker">{[d.industry, d.timeline].filter(Boolean).join(' · ') || 'Case study'}</p>
        <h1 className="cs-title">{d.title}</h1>
        {d.tagline && <p className={`cs-tagline ${d.ghost.tagline ? 'is-ghost' : ''}`}>{d.tagline}</p>}
        <Facts d={d} />
      </header>
      <Visual img={d.cover} seed={d.title} ratio="21 / 9" className="cs-cover" />
      <article className="cs-measure">
        <Sec title="Background" ghost={d.ghost.context}><P>{d.context}</P></Sec>
        <Sec title="The problem" ghost={d.ghost.problem}><P>{d.problem}</P></Sec>
        <Sec title="What we set out to do" ghost={d.ghost.goals}><Goals d={d} /></Sec>
        <More d={d} />
        {d.research && <Sec title="Research"><P>{d.research}</P></Sec>}
        <Sec title="How it came together" ghost={d.ghost.process}><Steps d={d} /></Sec>
        <Cut d={d} />
        {d.contribution && <Sec title="My part"><P>{d.contribution}</P></Sec>}
        <Gallery d={d} ratio="16 / 10" />
        <Sec title="The solution" ghost={d.ghost.solution}><P>{d.solution}</P></Sec>
        <Metrics d={d} />
        <Quote d={d} />
        {d.learned && <Sec title="What I learned"><P>{d.learned}</P></Sec>}
        {d.next && <Sec title="What’s next"><P>{d.next}</P></Sec>}
        <Tags items={d.skills} />
        <LinkOut d={d} />
      </article>
    </div>
  );
}

/* ---------- 2. Snapshot: scannable one-pager ---------- */
function Snapshot({ data }) {
  const d = cs(data);
  return (
    <div className="site cs cs-snapshot">
      <header className="cs-hero">
        <div>
          <p className="cs-kicker">Case study{d.client ? ` · ${d.client}` : ''}</p>
          <h1 className="cs-title">{d.title}</h1>
          {d.tagline && <p className={`cs-tagline ${d.ghost.tagline ? 'is-ghost' : ''}`}>{d.tagline}</p>}
        </div>
        <Facts d={d} className="cs-card" />
      </header>
      <Metrics d={d} />
      <div className="cs-three">
        <Sec k="01" title="Problem" ghost={d.ghost.problem}><P>{d.problem}</P></Sec>
        <Sec k="02" title="Approach" ghost={d.ghost.process}><ul className="cs-goals">{d.process.map((s, i) => <li key={i}>{s.title && <b>{s.title}. </b>}{s.desc}</li>)}</ul></Sec>
        <Sec k="03" title="Outcome" ghost={d.ghost.solution}><P>{d.solution}</P></Sec>
      </div>
      <Cut d={d} />
      <Visual img={d.cover} seed={d.title} ratio="16 / 8" className="cs-cover" />
      <div className="cs-pair">
        <Sec title="Context" ghost={d.ghost.context}><P>{d.context}</P></Sec>
        <Sec title="Goals" ghost={d.ghost.goals}><Goals d={d} /></Sec>
      </div>
      {d.contribution && <Sec title="My role"><P>{d.contribution}</P></Sec>}
      <Gallery d={d} ratio="4 / 3" />
      <Quote d={d} />
      <div className="cs-pair">
        {d.learned && <Sec title="Learned"><P>{d.learned}</P></Sec>}
        {d.skills.length > 0 && <Sec title="Tools"><Tags items={d.skills} /></Sec>}
      </div>
      <LinkOut d={d} />
    </div>
  );
}

/* ---------- 3. Blueprint: process-led, technical ---------- */
function Blueprint({ data }) {
  const d = cs(data);
  return (
    <div className="site cs cs-blueprint">
      <header className="cs-hero">
        <p className="cs-kicker">// case-study.md{d.timeline ? ` · ${d.timeline}` : ''}</p>
        <h1 className="cs-title">{d.title}</h1>
        {d.tagline && <p className={`cs-tagline ${d.ghost.tagline ? 'is-ghost' : ''}`}>{d.tagline}</p>}
        <Facts d={d} />
        <Tags items={d.skills} />
      </header>
      <div className="cs-pair">
        <Sec k="01" title="Context" ghost={d.ghost.context}><P>{d.context}</P></Sec>
        <Sec k="02" title="Problem" ghost={d.ghost.problem}><P>{d.problem}</P></Sec>
      </div>
      <Sec k="03" title="Requirements" ghost={d.ghost.goals}><Goals d={d} /></Sec>
      <More d={d} />
      {d.research && <Sec k="04" title="Investigation"><P>{d.research}</P></Sec>}
      <Sec k="05" title="Process" ghost={d.ghost.process}><Steps d={d} className="cs-steps--flow" /></Sec>
      <Cut d={d} k="05b" title="Trade-offs" />
      <Visual img={d.cover} seed={d.title} ratio="16 / 8" className="cs-cover" />
      {d.contribution && <Sec k="06" title="My contribution"><P>{d.contribution}</P></Sec>}
      <Sec k="07" title="Solution" ghost={d.ghost.solution}><P>{d.solution}</P></Sec>
      <Gallery d={d} ratio="16 / 10" />
      <Sec k="08" title="Results"><Metrics d={d} /></Sec>
      <Quote d={d} />
      {(d.learned || d.next) && <div className="cs-pair">{d.learned && <Sec title="Retrospective"><P>{d.learned}</P></Sec>}{d.next && <Sec title="Next"><P>{d.next}</P></Sec>}</div>}
      <LinkOut d={d} />
    </div>
  );
}

/* ---------- 4. Spotlight: dark, cinematic, results-led ---------- */
function Spotlight({ data }) {
  const d = cs(data);
  return (
    <div className="site cs cs-spotlight">
      <header className="cs-hero">
        <Visual img={d.cover} seed={d.title} ratio="16 / 9" className="cs-cover" />
        <div className="cs-hero__text">
          <p className="cs-kicker">{d.client || 'Case study'}</p>
          <h1 className="cs-title">{d.title}</h1>
          {d.tagline && <p className={`cs-tagline ${d.ghost.tagline ? 'is-ghost' : ''}`}>{d.tagline}</p>}
        </div>
      </header>
      <Metrics d={d} />
      <Facts d={d} />
      <div className="cs-pair">
        <Sec title="The brief" ghost={d.ghost.context}><P>{d.context}</P></Sec>
        <Sec title="The challenge" ghost={d.ghost.problem}><P>{d.problem}</P></Sec>
      </div>
      <Sec title="Ambition" ghost={d.ghost.goals}><Goals d={d} /></Sec>
      <Sec title="The work" ghost={d.ghost.process}><Steps d={d} /></Sec>
      <Cut d={d} title="What we left out" />
      <Gallery d={d} ratio="4 / 3" min={2} />
      <Sec title="The idea" ghost={d.ghost.solution}><p className="cs-big">{d.solution}</p></Sec>
      <Quote d={d} />
      {d.contribution && <Sec title="My role"><P>{d.contribution}</P></Sec>}
      {d.learned && <Sec title="Takeaway"><P>{d.learned}</P></Sec>}
      <Tags items={d.skills} />
      <LinkOut d={d} />
    </div>
  );
}

/* ---------- 5. Framework: challenge → approach → result ---------- */
function Framework({ data }) {
  const d = cs(data);
  return (
    <div className="site cs cs-framework">
      <header className="cs-hero">
        <p className="cs-kicker">{d.industry || 'Client engagement'}{d.client ? ` · ${d.client}` : ''}</p>
        <h1 className="cs-title">{d.title}</h1>
        {d.tagline && <p className={`cs-tagline ${d.ghost.tagline ? 'is-ghost' : ''}`}>{d.tagline}</p>}
        <Facts d={d} />
      </header>
      <div className="cs-cards">
        <Sec k="Situation" title="" ghost={d.ghost.context} className="cs-card"><P>{d.context}</P></Sec>
        <Sec k="Challenge" title="" ghost={d.ghost.problem} className="cs-card"><P>{d.problem}</P></Sec>
        <Sec k="Objectives" title="" ghost={d.ghost.goals} className="cs-card"><Goals d={d} /></Sec>
      </div>
      <More d={d} />
      <Sec title="Approach" ghost={d.ghost.process}><Steps d={d} className="cs-steps--grid" /></Sec>
      <Cut d={d} title="Options ruled out" />
      {d.research && <Sec title="Analysis"><P>{d.research}</P></Sec>}
      <Sec title="Recommendation" ghost={d.ghost.solution} className="cs-callout"><P>{d.solution}</P></Sec>
      <Sec title="Impact"><Metrics d={d} /></Sec>
      <Visual img={d.cover} seed={d.title} ratio="16 / 7" className="cs-cover" />
      <Quote d={d} />
      <div className="cs-pair">
        {d.contribution && <Sec title="My role"><P>{d.contribution}</P></Sec>}
        {d.learned && <Sec title="Lessons"><P>{d.learned}</P></Sec>}
      </div>
      <Gallery d={d} />
      <Tags items={d.skills} />
      <LinkOut d={d} />
    </div>
  );
}

/* ---------- 6. Lab: research notes ---------- */
function Lab({ data }) {
  const d = cs(data);
  return (
    <div className="site cs cs-lab">
      <header className="cs-hero">
        <p className="cs-kicker">Research report{d.timeline ? ` · ${d.timeline}` : ''}</p>
        <h1 className="cs-title">{d.title}</h1>
        {d.tagline && <p className={`cs-tagline ${d.ghost.tagline ? 'is-ghost' : ''}`}>{d.tagline}</p>}
        <Facts d={d} />
      </header>
      <Sec k="§1" title="Abstract" ghost={d.ghost.context}><P>{d.context}</P></Sec>
      <Sec k="§2" title="Research question" ghost={d.ghost.problem}><p className="cs-big">{d.problem}</p></Sec>
      <Sec k="§3" title="Objectives" ghost={d.ghost.goals}><Goals d={d} /></Sec>
      <Sec k="§4" title="Method">{d.research ? <P>{d.research}</P> : null}{(d.audience || d.constraints) && <dl className="cs-facts cs-facts--inline">{d.audience && <div><dt>Participants</dt><dd>{d.audience}</dd></div>}{d.constraints && <div><dt>Limits</dt><dd>{d.constraints}</dd></div>}</dl>}</Sec>
      <Sec k="§5" title="Findings" ghost={d.ghost.process}>
        <ol className="cs-findings">{d.process.map((s, i) => <li key={i}><span>F{i + 1}</span><div><h3>{s.title}</h3><p>{s.desc}</p></div></li>)}</ol>
      </Sec>
      <Visual img={d.cover} seed={d.title} ratio="16 / 8" className="cs-cover" caption={d.cover?.caption || 'Figure 1'} />
      <Cut d={d} k="§5b" title="Paths not taken" />
      <Sec k="§6" title="Recommendations" ghost={d.ghost.solution}><P>{d.solution}</P></Sec>
      <Sec k="§7" title="Impact"><Metrics d={d} /></Sec>
      <Gallery d={d} ratio="4 / 3" />
      {d.contribution && <Sec k="§8" title="My role"><P>{d.contribution}</P></Sec>}
      {d.learned && <Sec k="§9" title="Reflection"><P>{d.learned}</P></Sec>}
      <Quote d={d} />
      <Tags items={d.skills} />
      <LinkOut d={d} />
    </div>
  );
}

/* ---------- 7. Showcase: visuals first ---------- */
function Showcase({ data }) {
  const d = cs(data);
  return (
    <div className="site cs cs-showcase">
      <header className="cs-hero">
        <h1 className="cs-title">{d.title}</h1>
        <div className="cs-hero__side">
          {d.tagline && <p className={`cs-tagline ${d.ghost.tagline ? 'is-ghost' : ''}`}>{d.tagline}</p>}
          <Facts d={d} />
        </div>
      </header>
      <Visual img={d.cover} seed={d.title} ratio="16 / 9" className="cs-cover" />
      <div className="cs-pair">
        <Sec title="Brief" ghost={d.ghost.problem}><P>{d.problem}</P></Sec>
        <Sec title="Response" ghost={d.ghost.solution}><P>{d.solution}</P></Sec>
      </div>
      <Gallery d={d} ratio="4 / 5" min={4} className="cs-gallery--wall" />
      <Sec title="Process" ghost={d.ghost.process}><Steps d={d} className="cs-steps--grid" /></Sec>
      <Cut d={d} title="What I left out" />
      <Metrics d={d} />
      <div className="cs-pair">
        <Sec title="Context" ghost={d.ghost.context}><P>{d.context}</P></Sec>
        <Sec title="Goals" ghost={d.ghost.goals}><Goals d={d} /></Sec>
      </div>
      <Quote d={d} />
      {d.learned && <Sec title="Reflection"><P>{d.learned}</P></Sec>}
      <Tags items={d.skills} />
      <LinkOut d={d} />
    </div>
  );
}

/* ---------- 8. Impact: numbers first, before and after ---------- */
function Impact({ data }) {
  const d = cs(data);
  const [lead, ...rest] = d.metrics;
  return (
    <div className="site cs cs-impact">
      <header className="cs-hero">
        <div>
          <p className="cs-kicker">{d.client || 'Case study'}{d.timeline ? ` · ${d.timeline}` : ''}</p>
          <h1 className="cs-title">{d.title}</h1>
          {d.tagline && <p className={`cs-tagline ${d.ghost.tagline ? 'is-ghost' : ''}`}>{d.tagline}</p>}
        </div>
        {lead && <div className={`cs-lead ${d.ghost.metrics ? 'is-ghost' : ''}`}><b>{lead.value}</b><span>{lead.label}</span></div>}
      </header>
      {rest.length > 0 && <Metrics d={{ ...d, metrics: rest }} />}
      <div className="cs-ba">
        <Sec k="Before" title="" ghost={d.ghost.problem} className="cs-ba__b"><P>{d.problem}</P></Sec>
        <Sec k="After" title="" ghost={d.ghost.solution} className="cs-ba__a"><P>{d.solution}</P></Sec>
      </div>
      <Facts d={d} />
      <div className="cs-pair">
        <Sec title="Context" ghost={d.ghost.context}><P>{d.context}</P></Sec>
        <Sec title="Targets" ghost={d.ghost.goals}><Goals d={d} /></Sec>
      </div>
      <Sec title="How we got there" ghost={d.ghost.process}><Steps d={d} className="cs-steps--line" /></Sec>
      <Cut d={d} title="What we chose not to do" />
      <Visual img={d.cover} seed={d.title} ratio="16 / 8" className="cs-cover" />
      {d.contribution && <Sec title="My contribution"><P>{d.contribution}</P></Sec>}
      <Gallery d={d} />
      <Quote d={d} />
      {d.learned && <Sec title="What I learned"><P>{d.learned}</P></Sec>}
      <Tags items={d.skills} />
      <LinkOut d={d} />
    </div>
  );
}

/* ---------- 9. Deck: slides you scroll ---------- */
function Deck({ data }) {
  const d = cs(data);
  const slides = [
    ['Context', d.ghost.context, <p className="cs-big">{d.context}</p>],
    ['Problem', d.ghost.problem, <p className="cs-big">{d.problem}</p>],
    ['Goals', d.ghost.goals, <Goals d={d} />],
    ['Process', d.ghost.process, <Steps d={d} className="cs-steps--grid" />],
    ...(d.tradeoffs ? [['Trade-offs', false, <p className="cs-big">{d.tradeoffs}</p>]] : []),
    ['Solution', d.ghost.solution, <p className="cs-big">{d.solution}</p>],
    ['Results', d.ghost.metrics, <Metrics d={d} />],
  ];
  if (d.learned) slides.push(['Learnings', false, <p className="cs-big">{d.learned}</p>]);
  const total = slides.length + 1;
  return (
    <div className="site cs cs-deck">
      <header className="cs-hero cs-slide">
        <span className="cs-slide__n">01 / {String(total).padStart(2, '0')}</span>
        <p className="cs-kicker">{d.client || 'Case study'}</p>
        <h1 className="cs-title">{d.title}</h1>
        {d.tagline && <p className={`cs-tagline ${d.ghost.tagline ? 'is-ghost' : ''}`}>{d.tagline}</p>}
        <Facts d={d} />
      </header>
      {slides.map(([title, ghost, body], i) => (
        <section key={title} className={`cs-slide ${ghost ? 'is-ghost-body' : ''}`}>
          <span className="cs-slide__n">{String(i + 2).padStart(2, '0')} / {String(total).padStart(2, '0')}</span>
          <h2 className="cs-h">{title}</h2>
          <div className={ghost ? 'is-ghost' : ''}>{body}</div>
          {title === 'Solution' && <Visual img={d.cover} seed={d.title} ratio="16 / 8" className="cs-cover" />}
        </section>
      ))}
      {(d.gallery.length > 0 || d.quote) && (
        <section className="cs-slide">
          <Gallery d={d} />
          <Quote d={d} />
        </section>
      )}
      <footer className="cs-slide cs-slide--end">
        <Tags items={d.skills} />
        <LinkOut d={d} />
      </footer>
    </div>
  );
}

/* ---------- 10. Brief: Swiss, numbered, compact ---------- */
function Brief({ data }) {
  const d = cs(data);
  return (
    <div className="site cs cs-brief">
      <header className="cs-hero">
        <p className="cs-kicker">Case study</p>
        <h1 className="cs-title">{d.title}</h1>
        <div className="cs-hero__row">
          {d.tagline && <p className={`cs-tagline ${d.ghost.tagline ? 'is-ghost' : ''}`}>{d.tagline}</p>}
          <Facts d={d} />
        </div>
      </header>
      <div className="cs-grid">
        <Sec k="1" title="Context" ghost={d.ghost.context}><P>{d.context}</P></Sec>
        <Sec k="2" title="Problem" ghost={d.ghost.problem}><P>{d.problem}</P></Sec>
        <Sec k="3" title="Goals" ghost={d.ghost.goals}><Goals d={d} /></Sec>
        <Sec k="4" title="Process" ghost={d.ghost.process}><ol className="cs-goals cs-goals--num">{d.process.map((s, i) => <li key={i}>{s.title && <b>{s.title} </b>}{s.desc}</li>)}</ol></Sec>
        <Sec k="5" title="Solution" ghost={d.ghost.solution}><P>{d.solution}</P></Sec>
        <Sec k="6" title="Results"><Metrics d={d} className="cs-metrics--list" /></Sec>
      </div>
      <Visual img={d.cover} seed={d.title} ratio="16 / 7" className="cs-cover" />
      <Gallery d={d} />
      <div className="cs-grid">
        <Cut d={d} k="7" title="Trade-offs" />
        {d.contribution && <Sec k="8" title="My role"><P>{d.contribution}</P></Sec>}
        {d.learned && <Sec k="9" title="Learned"><P>{d.learned}</P></Sec>}
      </div>
      <Quote d={d} />
      <Tags items={d.skills} />
      <LinkOut d={d} />
    </div>
  );
}

export { Chronicle, Snapshot, Blueprint, Spotlight, Framework, Lab, Showcase, Impact, Deck, Brief };
