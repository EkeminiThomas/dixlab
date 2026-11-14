import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Logo, TEMPLATES, FORMATS } from '../components/ui.jsx';
import { fetchPublic } from '../api.js';
import { SitePreview, SITE_TEMPLATES } from '../components/sites/index.jsx';
import { projectToSite, site, OpenProject } from '../components/sites/shared.jsx';
import ProjectView from '../components/sites/ProjectView.jsx';
import { ContactTarget } from '../components/sites/contact.jsx';
import { ScaledDoc, CvDoc, CV_TEMPLATES } from '../components/cv/index.jsx';
import { projectToCv } from '../components/cv/data.js';
import { CasePreview, CASE_TEMPLATES } from '../components/case/index.jsx';
import { projectToCase } from '../components/case/data.js';

/**
 * A published portfolio, CV or case study at /p/:slug. No login needed.
 * Each portfolio project also has its own page at /p/:slug/work/:n.
 */
export default function PublicPage() {
  const { slug, '*': rest = '' } = useParams();
  const n = /^work\/(\d+)\/?$/.exec(rest)?.[1]; // /p/:slug/work/:n
  const navigate = useNavigate();
  const [state, setState] = useState({ loading: true });

  useEffect(() => {
    let live = true;
    fetchPublic(slug)
      .then(({ project }) => { if (live) setState({ project }); })
      .catch((e) => { if (live) setState({ error: e.status === 404 ? 'missing' : 'offline' }); });
    return () => { live = false; };
  }, [slug]);

  const p = state.project;
  const siteData = p?.type === 'portfolio' && SITE_TEMPLATES[p.template] ? projectToSite(p) : null;
  const s = siteData ? site(siteData) : null;
  const count = s?.hasProjects ? s.projects.length : 0;
  const workIndex = n != null && +n >= 1 && +n <= count ? +n - 1 : null;
  const workHref = (i) => `/p/${slug}/work/${i + 1}`;

  useEffect(() => {
    if (!p) return;
    const prev = document.title;
    const page = workIndex != null ? s.projects[workIndex].title : '';
    document.title = [page, p.title || p.name, p.role].filter(Boolean).join(' · ') || 'Dixlab';
    return () => { document.title = prev; };
  }, [p, workIndex]);

  // Coming back to the portfolio from a project: start at the top.
  useEffect(() => { window.scrollTo({ top: 0 }); }, [workIndex]);

  if (state.loading) return <div className="pub pub--msg"><span className="cz__spin" aria-label="Loading" /></div>;
  if (state.error) {
    return (
      <div className="pub pub--msg">
        <Logo to="/" />
        <h1>{state.error === 'missing' ? 'This page isn’t published.' : 'We couldn’t load this page.'}</h1>
        <p>{state.error === 'missing' ? 'The link may be mistyped, or its owner has unpublished it.' : 'Please try again in a moment.'}</p>
      </div>
    );
  }

  const printCv = () => {
    document.body.classList.add('is-printing-cv');
    const done = () => { document.body.classList.remove('is-printing-cv'); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    window.print();
  };

  let body;
  if (p.type === 'case' && CASE_TEMPLATES[p.template]) {
    body = <CasePreview template={p.template} data={{ ...projectToCase(p), ghost: false }} />;
  } else if (p.type === 'cv' && CV_TEMPLATES[p.template]) {
    const data = { ...projectToCv(p), ghost: false };
    body = (
      <>
        <div className="pub__cv">
          <ScaledDoc template={p.template} data={data} />
          <button className="app-btn app-btn--primary pub__pdf" onClick={printCv}>Download PDF</button>
        </div>
        <div className="cvprint" aria-hidden><CvDoc template={p.template} data={data} /></div>
      </>
    );
  } else if (siteData && workIndex != null) {
    body = (
      <ProjectView
        template={p.template}
        data={siteData}
        index={workIndex}
        hrefFor={(to) => (to === 'home' ? `/p/${slug}` : workHref(to))}
        onBack={() => navigate(`/p/${slug}`)}
        onGo={(i) => navigate(workHref(i))}
      />
    );
  } else if (siteData) {
    body = (
      <OpenProject.Provider value={{ count, href: workHref, open: (i) => navigate(workHref(i)) }}>
        <ContactTarget.Provider value={slug}>
          <SitePreview template={p.template} data={siteData} />
        </ContactTarget.Provider>
      </OpenProject.Provider>
    );
  } else {
    const tpl = TEMPLATES[p.template] && !TEMPLATES[p.template].site ? p.template : 'outline';
    body = (
      <article className={`story story--${tpl} pub__story`}>
        <p className="story__k">{FORMATS[p.type]?.label}{p.role ? ` · ${p.role}` : ''}</p>
        <h1 className="story__title">{p.title || 'Untitled'}</h1>
        {p.notes && <p className="story__lead">{p.notes}</p>}
        {[['problem', 'The challenge'], ['contribution', 'My contribution'], ['learned', 'What I learned']].map(([k, label]) => p[k] && (
          <div key={k} className="story__sec"><h3>{label}</h3><p>{p[k]}</p></div>
        ))}
      </article>
    );
  }

  return (
    <div className={`pub pub--${p.type}`}>
      <main className="pub__page">{body}</main>
      <footer className="pub__foot">
        <span>Made with</span> <Link to="/" className="pub__brand">Dixlab</Link>
        <Link to="/signup" className="pub__make">Make yours →</Link>
      </footer>
    </div>
  );
}
