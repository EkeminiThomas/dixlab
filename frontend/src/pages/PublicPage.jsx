import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Logo, TEMPLATES, FORMATS } from '../components/ui.jsx';
import { fetchPublic, unlockPublic, pageEvent } from '../api.js';
import HireBar from '../components/sites/HireBar.jsx';
import LiveStats from '../components/sites/LiveStats.jsx';
import { applyTranslation, pageLangs, isRtl, LangSwitch } from '../components/Languages.jsx';
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
export default function PublicPage({ domainSlug }) {
  // On a custom domain the page lives at "/" (and its projects at /work/:n).
  const params = useParams();
  const slug = domainSlug || params.slug;
  const rest = params['*'] || '';
  const home = domainSlug ? '' : `/p/${slug}`;
  const n = /^work\/(\d+)\/?$/.exec(rest)?.[1]; // /p/:slug/work/:n
  const navigate = useNavigate();
  const [state, setState] = useState({ loading: true });
  const [pickedLang, setPickedLang] = useState(() => new URLSearchParams(window.location.search).get('lang'));

  useEffect(() => {
    let live = true;
    fetchPublic(slug)
      .then((r) => { if (live) setState(loaded(r)); })
      .catch((e) => {
        if (!live) return;
        if (e.status === 401 && e.body?.detail?.code === 'password_required') setState({ locked: true });
        else setState({ error: e.status === 404 ? 'missing' : 'offline' });
      });
    return () => { live = false; };
  }, [slug]);

  // Languages: ?lang=, else the visitor's browser language when the page has it, else the page's own.
  const langs = pageLangs(state.project);
  const browser = (navigator.language || '').slice(0, 2).toLowerCase();
  const lang = langs.includes(pickedLang) ? pickedLang : langs.includes(browser) ? browser : langs[0];
  const p = useMemo(() => (state.project ? applyTranslation(state.project, lang) : state.project), [state.project, lang]);
  useEffect(() => {
    if (!state.project) return undefined;
    const html = document.documentElement;
    const prev = [html.lang, html.dir];
    html.lang = lang; html.dir = isRtl(lang) ? 'rtl' : 'ltr';
    return () => { [html.lang, html.dir] = prev; };
  }, [lang, state.project]);
  const pickLang = (l) => {
    setPickedLang(l);
    const url = new URL(window.location.href);
    if (l === langs[0]) url.searchParams.delete('lang'); else url.searchParams.set('lang', l);
    window.history.replaceState(null, '', url);
  };
  const siteData = p?.type === 'portfolio' && SITE_TEMPLATES[p.template] ? projectToSite(p) : null;
  const s = siteData ? site(siteData) : null;
  const count = s?.hasProjects ? s.projects.length : 0;
  const workIndex = n != null && +n >= 1 && +n <= count ? +n - 1 : null;
  const workHref = (i) => `${home}/work/${i + 1}`;

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
  if (state.locked) return <Unlock slug={slug} onOpen={(r) => setState(loaded(r))} />;
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
        hrefFor={(to) => (to === 'home' ? home || '/' : workHref(to))}
        onBack={() => navigate(home || '/')}
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
      <LangSwitch langs={langs} value={lang} onChange={pickLang} />
      <main className="pub__page" onClick={onLinkClick}>{body}</main>
      {p.type === 'portfolio' && workIndex == null && <LiveStats slug={slug} enabled={Boolean(p.liveStats?.github || p.liveStats?.stackoverflow)} />}
      {p.type === 'portfolio' && workIndex == null && state.testimonials.length > 0 && <Testimonials items={state.testimonials} />}
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

const loaded = ({ project, pdf, cvSlug, branding, testimonials }) => ({
  project, pdf: pdf !== false, cvSlug, branding: branding !== false, testimonials: testimonials || [],
});

/** A password-protected page: ask for the password, then show it. */
function Unlock({ slug, onOpen }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try { onOpen(await unlockPublic(slug, password)); } catch (err) { setError(err.message); setBusy(false); }
  };
  return (
    <div className="pub pub--msg">
      <Logo to="/" />
      <h1>This page is password protected.</h1>
      <p>Enter the password you were given to view it.</p>
      <form className="pub__unlock" onSubmit={submit}>
        <input className="field__input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} aria-label="Password" autoFocus autoComplete="off" />
        <button type="submit" className="app-btn app-btn--primary" disabled={busy || !password}>{busy ? 'Checking…' : 'View page'}</button>
      </form>
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  );
}

/** Approved testimonials, under the portfolio. */
function Testimonials({ items }) {
  return (
    <section className="pub-tst" aria-labelledby="pub-tst-t">
      <h2 id="pub-tst-t">What people say</h2>
      <div className="pub-tst__grid">
        {items.map((t, i) => (
          <figure key={i} className="pub-tst__card">
            <blockquote>“{t.body}”</blockquote>
            <figcaption>
              <b>{t.name}</b>
              {(t.role || t.company) && <span>{[t.role, t.company].filter(Boolean).join(', ')}</span>}
              {t.relation && <em>{t.relation}</em>}
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
