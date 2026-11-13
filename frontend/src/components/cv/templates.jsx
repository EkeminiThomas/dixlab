/* ==========================================================================
   The CV templates. Each is an A4 page (794 × 1123 CSS px) built from the
   same blocks, arranged and styled differently. Styles live in cv.css.
   ========================================================================== */
import { cv, range } from './data.js';

const ICONS = {
  mail: 'M3 6h18v12H3zM3 7l9 6 9-6',
  phone: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2',
  pin: 'M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  web: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9S14.5 18.4 12 21M12 3C9.5 5.6 8.2 8.6 8.2 12s1.3 6.4 3.8 9',
};
const CvIcon = ({ name }) => (
  <svg className="cv-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={ICONS[name]} /></svg>
);

/* ---------- Building blocks ---------- */

const Sec = ({ title, ghost, className = '', children }) => (
  <section className={`cv-sec ${ghost ? 'is-ghost' : ''} ${className}`}>
    {title && <h2 className="cv-h">{title}</h2>}
    {children}
  </section>
);

const Contact = ({ d, icons, sep }) => (
  <ul className={`cv-contact ${sep ? 'cv-contact--sep' : ''}`}>
    {d.contacts.map(([k, v]) => <li key={k}>{icons && <CvIcon name={k} />}<span>{v}</span></li>)}
  </ul>
);

const Bullets = ({ items }) => items.length > 0 && <ul className="cv-bullets">{items.map((b, i) => <li key={i}>{b}</li>)}</ul>;

const Jobs = ({ d }) => d.experience.map((x, i) => (
  <article key={i} className="cv-item">
    <header className="cv-item__head">
      <div>
        <h3 className="cv-item__t">{x.role}</h3>
        <p className="cv-item__org">{[x.company, x.loc].filter(Boolean).join(' · ')}</p>
      </div>
      {(x.from || x.to) && <p className="cv-item__date">{range(x.from, x.to)}</p>}
    </header>
    <Bullets items={x.bullets} />
  </article>
));

const Schools = ({ d }) => d.education.map((x, i) => (
  <article key={i} className="cv-item">
    <header className="cv-item__head">
      <div>
        <h3 className="cv-item__t">{x.degree}</h3>
        <p className="cv-item__org">{x.school}</p>
      </div>
      {(x.from || x.to) && <p className="cv-item__date">{range(x.from, x.to)}</p>}
    </header>
    {x.desc && <p className="cv-item__d">{x.desc}</p>}
  </article>
));

const Projects = ({ d }) => d.projects.map((x, i) => (
  <article key={i} className="cv-item cv-item--proj">
    <header className="cv-item__head">
      <h3 className="cv-item__t">{x.title}</h3>
      {x.link && <p className="cv-item__date">{x.link.replace(/^https?:\/\//, '')}</p>}
    </header>
    {x.desc && <p className="cv-item__d">{x.desc}</p>}
  </article>
));

const Tags = ({ items }) => <ul className="cv-tags">{items.map((s) => <li key={s}>{s}</li>)}</ul>;
const Lines = ({ items }) => <ul className="cv-lines">{items.map((s) => <li key={s}>{s}</li>)}</ul>;

/** The common optional sections, rendered only when the user filled them in. */
const Extras = ({ d, as: List = Lines, titles = {} }) => (
  <>
    {d.projects.length > 0 && <Sec title={titles.projects || 'Projects'}><Projects d={d} /></Sec>}
    {d.certs.length > 0 && <Sec title={titles.certs || 'Certifications & awards'}><List items={d.certs} /></Sec>}
    {d.languages.length > 0 && <Sec title="Languages"><List items={d.languages} /></Sec>}
  </>
);

/* ---------- 1. Classic: centred, serif, timeless ---------- */
function Classic({ data }) {
  const d = cv(data);
  return (
    <div className="cvdoc cv-classic">
      <header className="cv-head">
        <h1 className="cv-name">{d.name}</h1>
        <p className="cv-role">{d.role}</p>
        <Contact d={d} sep />
      </header>
      {d.summary && <Sec title="Profile" ghost={d.ghost.summary}><p className="cv-summary">{d.summary}</p></Sec>}
      <Sec title="Experience" ghost={d.ghost.experience}><Jobs d={d} /></Sec>
      <Sec title="Education" ghost={d.ghost.education}><Schools d={d} /></Sec>
      <Sec title="Skills" ghost={d.ghost.skills}><p className="cv-inline">{d.skills.join('  ·  ')}</p></Sec>
      {d.projects.length > 0 && <Sec title="Projects"><Projects d={d} /></Sec>}
      {(d.certs.length > 0 || d.languages.length > 0) && (
        <Sec title="Additional">
          <dl className="cv-defs">
            {d.certs.length > 0 && <><dt>Certifications</dt><dd>{d.certs.join(', ')}</dd></>}
            {d.languages.length > 0 && <><dt>Languages</dt><dd>{d.languages.join(', ')}</dd></>}
          </dl>
        </Sec>
      )}
    </div>
  );
}

/* ---------- 2. Meridian: two columns, tinted sidebar ---------- */
function Meridian({ data }) {
  const d = cv(data);
  return (
    <div className="cvdoc cv-meridian">
      <aside className="cv-side">
        <span className="cv-mono">{d.mono}</span>
        <Sec title="Contact"><Contact d={d} icons /></Sec>
        <Sec title="Skills" ghost={d.ghost.skills}><Lines items={d.skills} /></Sec>
        {d.languages.length > 0 && <Sec title="Languages"><Lines items={d.languages} /></Sec>}
        {d.certs.length > 0 && <Sec title="Certifications"><Lines items={d.certs} /></Sec>}
      </aside>
      <main className="cv-main">
        <header className="cv-head">
          <h1 className="cv-name">{d.name}</h1>
          <p className="cv-role">{d.role}</p>
        </header>
        {d.summary && <Sec title="Profile" ghost={d.ghost.summary}><p className="cv-summary">{d.summary}</p></Sec>}
        <Sec title="Experience" ghost={d.ghost.experience}><Jobs d={d} /></Sec>
        <Sec title="Education" ghost={d.ghost.education}><Schools d={d} /></Sec>
        {d.projects.length > 0 && <Sec title="Projects"><Projects d={d} /></Sec>}
      </main>
    </div>
  );
}

/* ---------- 3. Executive: dark header band, competencies grid ---------- */
function Executive({ data }) {
  const d = cv(data);
  return (
    <div className="cvdoc cv-exec">
      <header className="cv-head">
        <div>
          <h1 className="cv-name">{d.name}</h1>
          <p className="cv-role">{d.role}</p>
        </div>
        <Contact d={d} icons />
      </header>
      <div className="cv-body">
        {d.summary && <Sec title="Executive profile" ghost={d.ghost.summary}><p className="cv-summary">{d.summary}</p></Sec>}
        <Sec title="Core competencies" ghost={d.ghost.skills}><ul className="cv-grid">{d.skills.map((s) => <li key={s}>{s}</li>)}</ul></Sec>
        <Sec title="Career history" ghost={d.ghost.experience}><Jobs d={d} /></Sec>
        <div className="cv-cols">
          <Sec title="Education" ghost={d.ghost.education}><Schools d={d} /></Sec>
          <div>
            {d.certs.length > 0 && <Sec title="Board & certifications"><Lines items={d.certs} /></Sec>}
            {d.languages.length > 0 && <Sec title="Languages"><Lines items={d.languages} /></Sec>}
          </div>
        </div>
        {d.projects.length > 0 && <Sec title="Selected initiatives"><Projects d={d} /></Sec>}
      </div>
    </div>
  );
}

/* ---------- 4. Margin: label column, generous whitespace ---------- */
const Row = ({ title, ghost, children }) => (
  <section className={`cv-row ${ghost ? 'is-ghost' : ''}`}>
    <h2 className="cv-h">{title}</h2>
    <div className="cv-row__c">{children}</div>
  </section>
);

function Margin({ data }) {
  const d = cv(data);
  return (
    <div className="cvdoc cv-margin">
      <header className="cv-head">
        <div>
          <h1 className="cv-name">{d.first}<br />{d.last}</h1>
          <p className="cv-role">{d.role}</p>
        </div>
        <Contact d={d} />
      </header>
      {d.summary && <Row title="About" ghost={d.ghost.summary}><p className="cv-summary">{d.summary}</p></Row>}
      <Row title="Experience" ghost={d.ghost.experience}><Jobs d={d} /></Row>
      <Row title="Education" ghost={d.ghost.education}><Schools d={d} /></Row>
      <Row title="Skills" ghost={d.ghost.skills}><p className="cv-inline">{d.skills.join(', ')}</p></Row>
      {d.projects.length > 0 && <Row title="Projects"><Projects d={d} /></Row>}
      {d.certs.length > 0 && <Row title="Awards"><p className="cv-inline">{d.certs.join(', ')}</p></Row>}
      {d.languages.length > 0 && <Row title="Languages"><p className="cv-inline">{d.languages.join(', ')}</p></Row>}
    </div>
  );
}

/* ---------- 5. Timeline: career as a vertical line ---------- */
function Timeline({ data }) {
  const d = cv(data);
  return (
    <div className="cvdoc cv-timeline">
      <header className="cv-head">
        <div>
          <h1 className="cv-name">{d.name}</h1>
          <p className="cv-role">{d.role}</p>
        </div>
        <Contact d={d} icons />
      </header>
      {d.summary && <Sec ghost={d.ghost.summary}><p className="cv-summary">{d.summary}</p></Sec>}
      <Sec title="Experience" ghost={d.ghost.experience}>
        <ol className="cv-line">
          {d.experience.map((x, i) => (
            <li key={i}>
              <p className="cv-line__date">{range(x.from, x.to)}</p>
              <div>
                <h3 className="cv-item__t">{x.role}</h3>
                <p className="cv-item__org">{[x.company, x.loc].filter(Boolean).join(' · ')}</p>
                <Bullets items={x.bullets} />
              </div>
            </li>
          ))}
        </ol>
      </Sec>
      <Sec title="Education" ghost={d.ghost.education}>
        <ol className="cv-line">
          {d.education.map((x, i) => (
            <li key={i}>
              <p className="cv-line__date">{range(x.from, x.to)}</p>
              <div><h3 className="cv-item__t">{x.degree}</h3><p className="cv-item__org">{x.school}</p>{x.desc && <p className="cv-item__d">{x.desc}</p>}</div>
            </li>
          ))}
        </ol>
      </Sec>
      <div className="cv-cols">
        <Sec title="Skills" ghost={d.ghost.skills}><Tags items={d.skills} /></Sec>
        <div>
          {d.certs.length > 0 && <Sec title="Certifications"><Lines items={d.certs} /></Sec>}
          {d.languages.length > 0 && <Sec title="Languages"><Lines items={d.languages} /></Sec>}
        </div>
      </div>
      {d.projects.length > 0 && <Sec title="Projects"><Projects d={d} /></Sec>}
    </div>
  );
}

/* ---------- 6. Plain: ATS-safe, single column, no graphics ---------- */
function Plain({ data }) {
  const d = cv(data);
  return (
    <div className="cvdoc cv-plain">
      <header className="cv-head">
        <h1 className="cv-name">{d.name}</h1>
        <p className="cv-role">{d.role}</p>
        <p className="cv-contact-line">{d.contacts.map(([, v]) => v).join('  |  ')}</p>
      </header>
      {d.summary && <Sec title="Summary" ghost={d.ghost.summary}><p className="cv-summary">{d.summary}</p></Sec>}
      <Sec title="Skills" ghost={d.ghost.skills}><p className="cv-inline">{d.skills.join(', ')}</p></Sec>
      <Sec title="Work experience" ghost={d.ghost.experience}><Jobs d={d} /></Sec>
      <Sec title="Education" ghost={d.ghost.education}><Schools d={d} /></Sec>
      <Extras d={d} />
    </div>
  );
}

/* ---------- 7. Canvas: bold colour block, for creatives ---------- */
function Canvas({ data }) {
  const d = cv(data);
  return (
    <div className="cvdoc cv-canvas">
      <header className="cv-head">
        <h1 className="cv-name">{d.first}<span>{d.last}</span></h1>
        <p className="cv-role">{d.role}</p>
      </header>
      <div className="cv-split">
        <main className="cv-main">
          {d.summary && <Sec title="Hello" ghost={d.ghost.summary}><p className="cv-summary">{d.summary}</p></Sec>}
          <Sec title="Experience" ghost={d.ghost.experience}><Jobs d={d} /></Sec>
          {d.projects.length > 0 && <Sec title="Selected work"><Projects d={d} /></Sec>}
        </main>
        <aside className="cv-side">
          <Sec title="Contact"><Contact d={d} icons /></Sec>
          <Sec title="Skills" ghost={d.ghost.skills}><Tags items={d.skills} /></Sec>
          <Sec title="Education" ghost={d.ghost.education}><Schools d={d} /></Sec>
          {d.certs.length > 0 && <Sec title="Recognition"><Lines items={d.certs} /></Sec>}
          {d.languages.length > 0 && <Sec title="Languages"><Lines items={d.languages} /></Sec>}
        </aside>
      </div>
    </div>
  );
}

/* ---------- 8. Stack: technical, monospace accents ---------- */
function Stack({ data }) {
  const d = cv(data);
  return (
    <div className="cvdoc cv-stack">
      <header className="cv-head">
        <p className="cv-prompt">~/cv $ whoami</p>
        <h1 className="cv-name">{d.name}</h1>
        <p className="cv-role">{d.role}</p>
        <Contact d={d} icons />
      </header>
      {d.summary && <Sec title="// about" ghost={d.ghost.summary}><p className="cv-summary">{d.summary}</p></Sec>}
      <Sec title="// stack" ghost={d.ghost.skills}><Tags items={d.skills} /></Sec>
      <Sec title="// experience" ghost={d.ghost.experience}><Jobs d={d} /></Sec>
      {d.projects.length > 0 && <Sec title="// projects"><Projects d={d} /></Sec>}
      <div className="cv-cols">
        <Sec title="// education" ghost={d.ghost.education}><Schools d={d} /></Sec>
        <div>
          {d.certs.length > 0 && <Sec title="// certifications"><Lines items={d.certs} /></Sec>}
          {d.languages.length > 0 && <Sec title="// languages"><Lines items={d.languages} /></Sec>}
        </div>
      </div>
    </div>
  );
}

/* ---------- 9. Graduate: education and projects first ---------- */
function Graduate({ data }) {
  const d = cv(data);
  return (
    <div className="cvdoc cv-grad">
      <header className="cv-head">
        <h1 className="cv-name">{d.name}</h1>
        <p className="cv-role">{d.role}</p>
        <Contact d={d} icons />
      </header>
      {d.summary && <Sec title="Personal statement" ghost={d.ghost.summary}><p className="cv-summary">{d.summary}</p></Sec>}
      <Sec title="Education" ghost={d.ghost.education}><Schools d={d} /></Sec>
      {d.projects.length > 0 && <Sec title="Projects"><Projects d={d} /></Sec>}
      <Sec title="Experience" ghost={d.ghost.experience}><Jobs d={d} /></Sec>
      <div className="cv-cols cv-cols--3">
        <Sec title="Skills" ghost={d.ghost.skills}><Tags items={d.skills} /></Sec>
        {d.certs.length > 0 && <Sec title="Achievements"><Lines items={d.certs} /></Sec>}
        {d.languages.length > 0 && <Sec title="Languages"><Lines items={d.languages} /></Sec>}
      </div>
    </div>
  );
}

/* ---------- 10. Atelier: refined serif, monogram, cream paper ---------- */
function Atelier({ data }) {
  const d = cv(data);
  return (
    <div className="cvdoc cv-atelier">
      <header className="cv-head">
        <span className="cv-mono">{d.mono}</span>
        <h1 className="cv-name">{d.name}</h1>
        <p className="cv-role">{d.role}</p>
      </header>
      <div className="cv-split">
        <aside className="cv-side">
          <Sec title="Contact"><Contact d={d} /></Sec>
          <Sec title="Expertise" ghost={d.ghost.skills}><Lines items={d.skills} /></Sec>
          {d.languages.length > 0 && <Sec title="Languages"><Lines items={d.languages} /></Sec>}
          {d.certs.length > 0 && <Sec title="Distinctions"><Lines items={d.certs} /></Sec>}
        </aside>
        <main className="cv-main">
          {d.summary && <Sec title="Profile" ghost={d.ghost.summary}><p className="cv-summary">{d.summary}</p></Sec>}
          <Sec title="Experience" ghost={d.ghost.experience}><Jobs d={d} /></Sec>
          <Sec title="Education" ghost={d.ghost.education}><Schools d={d} /></Sec>
          {d.projects.length > 0 && <Sec title="Projects"><Projects d={d} /></Sec>}
        </main>
      </div>
    </div>
  );
}

export { Classic, Meridian, Executive, Margin, Timeline, Plain, Canvas, Stack, Graduate, Atelier };
