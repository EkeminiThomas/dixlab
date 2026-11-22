import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Logo, loadUser } from '../components/ui.jsx';
import { fetchGallery, isSignedIn, homeFor } from '../api.js';

const KINDS = [['all', 'Everything'], ['portfolio', 'Portfolios'], ['case', 'Case studies'], ['cv', 'CVs']];
const LABEL = { portfolio: 'Portfolio', case: 'Case study', cv: 'CV' };

/** /gallery: work made with Dixlab, featured by the team. Owners ask to be included from "Publish". */
export default function Gallery() {
  const [kind, setKind] = useState('all');
  const [pages, setPages] = useState(null);
  const [error, setError] = useState(false);
  const signedIn = isSignedIn();

  useEffect(() => {
    let live = true;
    setPages(null); setError(false);
    fetchGallery(kind).then((r) => { if (live) setPages(r.pages); }).catch(() => { if (live) setError(true); });
    return () => { live = false; };
  }, [kind]);
  useEffect(() => { const prev = document.title; document.title = 'Gallery · Dixlab'; return () => { document.title = prev; }; }, []);

  return (
    <div className="prc gal">
      <header className="prc__nav">
        <Logo to="/" />
        <nav className="prc__links">
          <Link to="/gallery" className="is-on">Gallery</Link>
          <Link to="/pricing">Pricing</Link>
        </nav>
        <div className="prc__actions">
          {signedIn ? <Link to={homeFor(loadUser())} className="prc__btn">Your work</Link> : <>
            <Link to="/login" className="prc__login">Log in</Link>
            <Link to="/signup" className="prc__btn">Start free</Link>
          </>}
        </div>
      </header>

      <section className="prc__hero">
        <p className="prc__kicker">Gallery</p>
        <h1 className="prc__h1">Work that <em>gets people hired</em>.</h1>
        <p className="prc__lead">Portfolios, case studies and CVs made with Dixlab, picked by our team. Publish yours and ask to be featured.</p>
      </section>

      <div className="gal__filters seg" role="tablist" aria-label="Type">
        {KINDS.map(([k, l]) => (
          <button key={k} role="tab" aria-selected={kind === k} className={`seg__btn ${kind === k ? 'is-active' : ''}`} onClick={() => setKind(k)}>{l}</button>
        ))}
      </div>

      <main className="gal__grid">
        {error && <p className="gal__empty">We couldn’t load the gallery. Please try again in a moment.</p>}
        {!error && !pages && <p className="gal__empty"><span className="cz__spin" aria-label="Loading" /></p>}
        {pages?.length === 0 && <p className="gal__empty">Nothing featured here yet. Yours could be first.</p>}
        {pages?.map((p) => (
          <a key={p.slug} href={`/p/${p.slug}`} className="gal__card">
            <div className="gal__img">
              {p.image ? <img src={p.image} alt="" loading="lazy" /> : <span aria-hidden>{(p.name || p.title || '?').trim().charAt(0).toUpperCase()}</span>}
            </div>
            <div className="gal__meta">
              <span className="gal__kind">{LABEL[p.type] || 'Page'}</span>
              <b>{p.title || p.name || 'Untitled'}</b>
              {(p.name && p.name !== p.title) || p.role ? <span className="gal__who">{[p.name !== p.title && p.name, p.role].filter(Boolean).join(' · ')}</span> : null}
              {p.summary && <p>{p.summary}</p>}
            </div>
          </a>
        ))}
      </main>
    </div>
  );
}
