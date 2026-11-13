import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Logo, TEMPLATES, FORMATS } from '../components/ui.jsx';
import { fetchPublic } from '../api.js';
import { SitePreview, SITE_TEMPLATES } from '../components/sites/index.jsx';
import { projectToSite } from '../components/sites/shared.jsx';
import { ScaledDoc, CvDoc, CV_TEMPLATES } from '../components/cv/index.jsx';
import { projectToCv } from '../components/cv/data.js';
import { CasePreview, CASE_TEMPLATES } from '../components/case/index.jsx';
import { projectToCase } from '../components/case/data.js';

/** A published portfolio, CV or case study at /p/:slug. No login needed. */
export default function PublicPage() {
  const { slug } = useParams();
  const [state, setState] = useState({ loading: true });

  useEffect(() => {
    let live = true;
    fetchPublic(slug)
      .then(({ project }) => { if (live) setState({ project }); })
      .catch((e) => { if (live) setState({ error: e.status === 404 ? 'missing' : 'offline' }); });
    return () => { live = false; };
  }, [slug]);

  const p = state.project;
  useEffect(() => {
    if (!p) return;
    const prev = document.title;
    document.title = [p.title || p.name, p.role].filter(Boolean).join(' · ') || 'Dixlab';
    return () => { document.title = prev; };
  }, [p]);

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
  } else if (p.type === 'portfolio' && SITE_TEMPLATES[p.template]) {
    body = <SitePreview template={p.template} data={projectToSite(p)} />;
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
