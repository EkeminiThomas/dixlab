import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Logo, TEMPLATES, FORMATS } from '../components/ui.jsx';
import { fetchPublic, pageEvent } from '../api.js';
import HireBar from '../components/sites/HireBar.jsx';
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
      .then(({ project, pdf, cvSlug, branding }) => { if (live) setState({ project, pdf: pdf !== false, cvSlug, branding: branding !== false }); })
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
    const desc = String(p.tagline || p.problem || p.notes || p.role || '').replace(/\s+/g, ' ').slice(0, 200);
    let tag = document.querySelector('meta[name="description"]');
    if (!tag) { tag = document.createElement('meta'); tag.name = 'description'; document.head.appendChild(tag); }
    const prevDesc = tag.content;
    tag.content = desc;
    return () => { document.title = prev; tag.content = prevDesc; };
  }, [p, workIndex]);

  // Visitor analytics (counted per day, nothing personal): where they came from, once per visit…
  const sentRef = useRef(false);
  useEffect(() => {
    if (!p || sentRef.current) return;
    sentRef.current = true;
    pageEvent(slug, 'ref', document.referrer || '');
  }, [p, slug]);
  // …how far they scroll…
  useEffect(() => {
    if (!p) return undefined;
    const done = new Set();
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const pct = max <= 0 ? 100 : (window.scrollY / max) * 100;
      for (const m of [25, 50, 75, 100]) {
        if (pct >= m - 2 && !done.has(m)) { done.add(m); pageEvent(slug, 'depth', String(m)); }
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [p, slug]);
  // …which project they open…
  useEffect(() => {
    if (p && workIndex != null) pageEvent(slug, 'open', s.projects[workIndex]?.title || `Project ${workIndex + 1}`);
  }, [p, workIndex, slug]); // eslint-disable-line react-hooks/exhaustive-deps
  // …and which outside links they follow (live sites, repos, socials).
  const onLinkClick = (e) => {
    const a = e.target.closest?.('a[href]');
    if (a && /^https?:/i.test(a.href) && new URL(a.href).origin !== window.location.origin) pageEvent(slug, 'action', 'link');
  };

  // Opened from a portfolio's "Download CV": save it as a PDF straight away.
  const autoPrinted = useRef(false);
  useEffect(() => {
    if (!p || p.type !== 'cv' || autoPrinted.current || !state.pdf) return undefined;
    if (new URLSearchParams(window.location.search).get('download') !== '1') return undefined;
    autoPrinted.current = true;
    const t = setTimeout(() => printCvNow(), 700);
    return () => clearTimeout(t);
  }, [p, state.pdf]);

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

  const printCv = printCvNow;

  let body;
  if (p.type === 'case' && CASE_TEMPLATES[p.template]) {
    body = <CasePreview template={p.template} data={{ ...projectToCase(p), ghost: false }} meta />;
  } else if (p.type === 'cv' && CV_TEMPLATES[p.template]) {
    const data = { ...projectToCv(p), ghost: false };
    body = (
      <>
        <div className="pub__cv">
          <ScaledDoc template={p.template} data={data} />
          {state.pdf && <button className="app-btn app-btn--primary pub__pdf" onClick={printCv}>Download PDF</button>}
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
      <main className="pub__page" onClick={onLinkClick}>{body}</main>
      {p.type === 'portfolio' && workIndex == null && (
        <HireBar availability={p.availability || {}} cvSlug={state.cvSlug} onAction={(k) => pageEvent(slug, 'action', k)} />
      )}
      {state.branding && (
        <footer className="pub__foot">
          <span>Made with</span> <Link to="/" className="pub__brand">Dixlab</Link>
          <Link to="/signup" className="pub__make">Make yours →</Link>
        </footer>
      )}
    </div>
  );
}

function printCvNow() {
  document.body.classList.add('is-printing-cv');
  const done = () => { document.body.classList.remove('is-printing-cv'); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  window.print();
}
