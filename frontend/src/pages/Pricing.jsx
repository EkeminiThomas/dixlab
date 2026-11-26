import { useEffect, useState } from 'react';
import { mailto } from '../contact.js';
import { Link, useNavigate } from 'react-router-dom';
import { Logo, loadUser } from '../components/ui.jsx';
import {
  usePlan, loadCatalog, refreshPlan, isSignedIn, buyCredits, formatPrice, homeFor, getCurrency, setCurrency, openUpgrade, hasFeature,
} from '../api.js';

const PACKS = {
  s: { name: 'Starter pack', for: 'Try the AI on a CV or two.' },
  m: { name: 'Builder pack', for: 'A strong CV, a portfolio and a few unlocks.', tag: 'Most popular' },
  l: { name: 'Career pack', for: 'Everything unlocked, with plenty of AI left.' },
  xl: { name: 'Pro pack', for: 'For heavy use: many CVs, translations and case studies.', tag: 'Best value' },
};

const AI_NAMES = {
  assist_tailor_cv: 'Tailor your CV to a job',
  assist_profiles: 'Build from your GitHub and other profiles',
  assist_case_links: 'Case study from project links',
  interview_draft_case: 'Write a case study from your interview',
  interview_draft_portfolio: 'Write your portfolio from your interview',
  assist_translate: 'Translate a page into another language',
  customize: 'Describe a change (“make it more concise”)',
};

const FAQ = [
  ['Do credits expire?', 'No. Credits you buy stay on your account until you use them, however long that takes. There’s no subscription and nothing renews.'],
  ['What’s free?', 'Every account gets free credits to try the AI, one project (a CV, portfolio or case study), the free templates, PDF export, publishing on a Dixlab link, testimonials, feedback links, live GitHub stats and the accessibility check.'],
  ['What does an unlock do?', 'An unlock is paid once, with credits, and stays on your account for good: premium templates, visitor insights, your own yourname.dixlab.click address, password pages, or removing the Dixlab footer. Room for more projects and storage can be added as many times as you need.'],
  ['What happens when I run out?', 'Nothing is lost. Your work stays, your pages stay live, and everything you unlocked stays unlocked. You can keep editing by hand, and top up whenever you want more AI help.'],
  ['Can I use my own domain?', 'Yes, and connecting it is free. Buy a domain like yourname.com on pxxl.app (or anywhere), then connect it from Publish. Credits are only for the free yourname.dixlab.click address.'],
  ['Can I get a refund?', 'Yes. Ask within 14 days of buying a pack, while its credits are unused, from Profile → Credits & billing.'],
  ['Why naira and dollars?', 'People in Nigeria pay in naira at local prices. Everyone else pays in US dollars by card. Your bank may add its own fees.'],
];

export default function Pricing() {
  const nav = useNavigate();
  const { catalog, plan } = usePlan();
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState(null);
  const [open, setOpen] = useState(0);
  const signedIn = isSignedIn();
  const currency = getCurrency();

  useEffect(() => { loadCatalog(); if (signedIn) refreshPlan(); }, [signedIn]);
  useEffect(() => {
    document.title = 'Pricing · Dixlab';
    if (new URLSearchParams(window.location.search).get('checkout') === 'cancelled') {
      setMessage({ text: 'Checkout cancelled. You haven’t been charged.' });
    }
  }, []);

  const buy = async (id) => {
    if (!signedIn) { nav(`/signup?next=${encodeURIComponent('/pricing')}`); return; }
    setBusy(id); setMessage(null);
    try { await buyCredits(id, currency); } catch (e) {
      setMessage({ error: true, text: e.body?.unavailable ? 'Payments aren’t set up yet. Check back soon.' : e.message });
    }
    setBusy('');
  };
  const packs = catalog?.packs || [];
  const cheapestPer = Math.min(...packs.map((p) => p.prices[currency] / p.credits));

  return (
    <div className="prc">
      <header className="prc__nav">
        <Logo to="/" />
        <nav className="prc__links">
          <Link to="/gallery">Gallery</Link>
          <Link to="/pricing" className="is-on">Pricing</Link>
        </nav>
        <div className="prc__actions">
          {signedIn ? <Link to={homeFor(loadUser())} className="prc__btn">Your work</Link> : <>
            <Link to="/login" className="prc__login">Log in</Link>
            <Link to="/signup" className="prc__btn">Start free</Link>
          </>}
        </div>
      </header>

      <section className="prc__hero">
        <p className="prc__kicker">Pricing</p>
        <h1 className="prc__h1">Pay for what you use.<br /><em>Keep it forever.</em></h1>
        <p className="prc__lead">No subscription. Buy credits once, use them for AI help and to unlock features, and top up when you need more. Credits never expire.</p>
        <div className="prc__switches">
          <div className="prc__toggle" role="group" aria-label="Currency">
            <button className={currency === 'NGN' ? 'is-on' : ''} aria-pressed={currency === 'NGN'} onClick={() => setCurrency('NGN')}>₦ Naira</button>
            <button className={currency === 'USD' ? 'is-on' : ''} aria-pressed={currency === 'USD'} onClick={() => setCurrency('USD')}>$ US dollars</button>
          </div>
        </div>
        {signedIn && plan?.enforced && <p className="prc__balance">You have <b>{(plan.credits ?? 0).toLocaleString()} credits</b>.</p>}
        {!signedIn && catalog?.welcome > 0 && <p className="prc__note">New accounts get {catalog.welcome} free credits to try the AI.</p>}
        {message && <p className={`prc__msg ${message.error ? 'is-error' : ''}`} role={message.error ? 'alert' : 'status'}>{message.text}</p>}
      </section>

      <section className="prc__plans prc__plans--four" aria-label="Credit packs">
        {packs.map((p) => {
          const c = PACKS[p.id] || { name: `${p.credits} credits`, for: '' };
          const per100 = (p.prices[currency] / p.credits) * 100;
          const save = Math.round((1 - (p.prices[currency] / p.credits) / (packs[0].prices[currency] / packs[0].credits)) * 100);
          return (
            <article key={p.id} className={`prc__plan ${c.tag === 'Most popular' ? 'prc__plan--pro' : ''}`}>
              <div className="prc__plan-top">
                <div className="prc__plan-row"><h2>{c.name}</h2>{c.tag && <span className={`prc__tag ${c.tag === 'Best value' ? 'prc__tag--gold' : ''}`}>{c.tag}</span>}</div>
                <p className="prc__for">{c.for}</p>
              </div>
              <div className="prc__price">
                <p><b>{formatPrice(p.prices[currency], currency)}</b><span>once</span></p>
                <small>{p.credits.toLocaleString()} credits · {formatPrice(Math.round(per100 / 100) * 100, currency)} per 100{save > 0 ? ` · save ${save}%` : ''}</small>
              </div>
              <button className={`prc__cta ${c.tag === 'Most popular' ? 'prc__cta--pro' : ''}`} onClick={() => buy(p.id)} disabled={!!busy}>
                {busy === p.id ? 'Opening checkout…' : `Buy ${p.credits.toLocaleString()} credits`}
              </button>
              <div className="prc__divider" />
              <ul className="prc__items">
                <li><i aria-hidden>✓</i><span>About {Math.floor(p.credits / 20)} tailored CVs<small>or any mix of AI actions and unlocks</small></span></li>
                <li><i aria-hidden>✓</i><span>Never expire</span></li>
                <li><i aria-hidden>✓</i><span>Refund within 14 days if unused</span></li>
              </ul>
            </article>
          );
        })}
      </section>
      {packs.length > 0 && Number.isFinite(cheapestPer) && <p className="prc__fair">Paid once, in {currency === 'NGN' ? 'naira' : 'US dollars'}. Nothing renews.</p>}

      <section className="prc__units">
        <div>
          <h2 className="prc__h2">Unlock once, keep for good</h2>
          <p>Features you unlock with credits stay on your account forever, even if your balance runs out.</p>
        </div>
        <ul className="prc__unit-list">
          {(catalog?.unlocks || []).map((u) => {
            const owned = signedIn && !u.stack && hasFeature(u.id, plan) && plan?.enforced;
            return (
              <li key={u.id}>
                <span>{u.name}<small>{u.desc}</small></span>
                {owned ? <b className="is-owned">✓ Yours</b>
                  : signedIn ? <button className="prc__unit-btn" onClick={() => openUpgrade({ code: 'unlock_needed', feature: u.id })}>{u.credits} credits{u.stack ? ' each' : ''}</button>
                  : <b>{u.credits} credits{u.stack ? ' each' : ''}</b>}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="prc__units">
        <div>
          <h2 className="prc__h2">What AI help costs</h2>
          <p>Credits are only used when the AI finishes the job. If a link can’t be read or something fails, nothing is taken. Asking interview questions is free.</p>
        </div>
        <ul className="prc__unit-list">
          {Object.entries(catalog?.aiCosts || {}).sort((a, b) => b[1] - a[1]).map(([k, n]) => (
            <li key={k}><span>{AI_NAMES[k] || k}</span><b>{n} credits</b></li>
          ))}
        </ul>
      </section>

      <section className="prc__teams" aria-label="For teams and organisations">
        <div className="prc__team">
          <span className="prc__offer-tag">Coming soon</span>
          <h3>Dixlab for teams</h3>
          <p>For agencies, bootcamps and career centres: shared credits for your whole team, bulk onboarding and one bill.</p>
          <a className="prc__cta prc__cta--ghost" href={mailto('Dixlab for teams')}>Talk to us</a>
        </div>
      </section>

      <section className="prc__faq">
        <div><h2 className="prc__h2">Questions</h2><p>Still unsure? Write to us and a real person will reply.</p></div>
        <div className="prc__qs">
          {FAQ.map(([q, a], i) => (
            <div key={q} className={`prc__q ${open === i ? 'is-open' : ''}`}>
              <button aria-expanded={open === i} onClick={() => setOpen(open === i ? -1 : i)}><span>{q}</span><i aria-hidden>{open === i ? '–' : '+'}</i></button>
              {open === i && <p>{a}</p>}
            </div>
          ))}
        </div>
      </section>

      <section className="prc__band">
        <h2>Your professional identity, built in one place.</h2>
        <p>Start free today. Buy credits only when it’s worth it.</p>
        <div><Link to={signedIn ? homeFor(loadUser()) : '/signup'} className="prc__btn">Start free</Link><Link to="/gallery" className="prc__btn prc__btn--ghost">See the gallery</Link></div>
      </section>

      <footer className="prc__foot">
        <span>© {new Date().getFullYear()} Dixlab · Payments by Bachs</span>
        <span>Nigeria: prices in naira · Elsewhere: prices in US dollars. Taxes may apply. <Link to="/terms">Terms</Link> · <Link to="/privacy">Privacy</Link> · <Link to="/refunds">Refunds</Link></span>
      </footer>
    </div>
  );
}
