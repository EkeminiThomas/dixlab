import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Logo, loadUser } from '../components/ui.jsx';
import {
  usePlan, loadCatalog, refreshPlan, isSignedIn, startTrial, checkout, formatPrice, homeFor,
  getCurrency, setCurrency, PLAN_NAMES,
} from '../api.js';

/* What each plan's card lists (the limits themselves are enforced by the server). */
const CARDS = {
  free: {
    for: 'Try Dixlab and build your first professional asset.', lead: 'Includes',
    items: [['One creation category', 'Choose a CV, a portfolio or a case study'], ['One asset in that category'],
      ['Basic templates'], ['Limited AI help', '10 AI units a month'], ['Basic editing'], ['PDF export'], ['Publish on a Dixlab subdomain'], ['Your dashboard']],
  },
  starter: {
    for: 'Affordable access to everything you need beyond Free.', lead: 'Everything in Free, plus',
    items: [['CVs, portfolios and case studies', 'All three categories'], ['Up to 3 CVs, 2 portfolios, 5 case studies'],
      ['Premium templates'], ['AI-assisted content', '100 AI units a month'], ['Publish on a Dixlab subdomain']],
  },
  pro: {
    for: 'For professionals, freelancers, designers, developers and active job seekers.', lead: 'Everything in Starter, plus',
    items: [['Unlimited CVs', 'Fair use'], ['Up to 5 portfolios and 15 case studies'], ['Advanced templates', 'Including 3D'],
      ['Advanced AI and CV tailoring', '300 AI units a month'], ['Connect your own domain'], ['Portfolio analytics'], ['Remove Dixlab branding']],
  },
  premium: {
    for: 'For highly active professionals who need more flexibility.', lead: 'Everything in Pro, plus',
    items: [['Unlimited portfolios and case studies', 'Fair use'], ['Multiple professional profiles'], ['Premium AI workflows', '800 AI units a month'],
      ['Multiple custom domains'], ['Advanced portfolio analytics'], ['Priority support']],
  },
};

const COMPARE = [
  ['Create', [['CVs', '1 · or one other category', '3', 'Unlimited*', 'Unlimited*'], ['Portfolios', '1 · or one other category', '2', '5', 'Unlimited*'],
    ['Case studies', '1 · or one other category', '5', '15', 'Unlimited*'], ['Basic templates', '✓', '✓', '✓', '✓'], ['Premium templates', '—', '✓', '✓', '✓'],
    ['Advanced templates (3D, specialist)', '—', '—', '✓', '✓'], ['PDF exports', '✓', '✓', '✓', '✓']]],
  ['AI', [['AI features', 'Limited', 'Standard', 'Advanced', 'Advanced'], ['AI units a month', '10', '100', '300', '800'],
    ['Advanced CV tailoring', '—', '—', '✓', '✓'], ['Premium AI workflows', '—', '—', '—', '✓']]],
  ['Publish & brand', [['Dixlab subdomain', '✓', '✓', '✓', '✓'], ['Custom domains', '—', '—', '1', 'Multiple'],
    ['Portfolio analytics', '—', '—', '✓', 'Advanced'], ['Remove Dixlab branding', '—', '—', '✓', '✓'], ['Multiple professional profiles', '—', '—', '—', '✓']]],
  ['Support', [['Help centre', '✓', '✓', '✓', '✓'], ['Priority support', '—', '—', '—', '✓']]],
];

const UNITS = [['Generate CV or portfolio content', 10], ['Improve content (“Describe a change”)', 5], ['Write a case study', 15],
  ['Build from your GitHub, LinkedIn or X', 15], ['Tailor a CV to a job advert (Pro)', 20]];

const FAQ = [
  ['Is the free plan really free?', 'Yes. Pick one category, a CV, a portfolio or a case study, and make one asset in it. Keep it live for as long as you like. No card needed.'],
  ['Why naira or dollars?', 'Prices are set separately for Nigeria (in naira) and everywhere else (in US dollars); they aren’t exchange-rate conversions. We suggest one based on where you are, and you can switch before paying.'],
  ['How does paying work?', 'Payments run on Bachs’s secure checkout, so Dixlab never sees your card. Dollar plans renew automatically until you cancel. Naira plans are paid for one month or one year at a time, and you renew by paying again (automatic naira renewals are coming).'],
  ['What are AI units?', 'Each plan includes a monthly AI allowance. Different tasks use different amounts: writing a case study uses 15 units, improving content uses 5. If you run out, your work stays and you can keep editing by hand until it resets or you upgrade.'],
  ['What happens if I downgrade or cancel?', 'Nothing is deleted. You keep your paid features until the end of the period, then anything beyond your new plan stays saved but read-only.'],
  ['Do you offer refunds?', 'Yes: ask within 14 days of being charged and we refund that payment in full, from Your account.'],
];

export default function Pricing() {
  const nav = useNavigate();
  const { catalog, plan } = usePlan();
  const [yearly, setYearly] = useState(false);
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

  const interval = yearly ? 'yearly' : 'monthly';
  const current = signedIn ? plan?.plan || null : null;
  const renews = catalog?.renews?.[currency] !== false;
  const prices = (id) => catalog?.plans.find((p) => p.id === id)?.prices?.[currency];

  const run = async (key, fn) => {
    setBusy(key); setMessage(null);
    try { await fn(); } catch (e) {
      setMessage({ error: true, text: e.body?.unavailable ? 'Payments aren’t set up yet. You can start the free Pro trial in the meantime.' : e.message });
    }
    setBusy('');
  };
  const choose = (id) => {
    if (!signedIn) { nav(`/signup?next=${encodeURIComponent('/pricing')}`); return; }
    if (id === 'free') { nav(homeFor(loadUser())); return; }
    run(id, async () => {
      const res = await checkout(id, interval, currency);
      if (res?.changed) {
        setMessage({ text: res.when === 'now'
          ? `You’re now on ${PLAN_NAMES[id]}. The difference is charged or credited on your card.`
          : `Your plan changes to ${PLAN_NAMES[id]} (${interval}) at your next renewal. Until then nothing changes.` });
      }
    });
  };
  const trial = () => run('trial', async () => {
    const me = await startTrial();
    setMessage({ text: `You’re on Pro until ${new Date(me.trialEndsAt).toLocaleDateString(undefined, { day: 'numeric', month: 'long' })}. Enjoy!` });
  });

  const cta = (id) => {
    const isCurrent = current === id && (id === 'free' || plan?.source !== 'trial');
    if (isCurrent && (id === 'free' || plan?.renews)) return <button className="prc__cta" disabled>Your current plan</button>;
    if (id === 'free') return <button className="prc__cta" onClick={() => choose('free')}>{signedIn ? 'Go to your work' : 'Start free'}</button>;
    const verb = isCurrent ? 'Renew' : 'Get';
    const main = (
      <button className={`prc__cta prc__cta--${id}`} onClick={() => choose(id)} disabled={!!busy}>
        {busy === id ? 'Opening checkout…' : `${verb} ${PLAN_NAMES[id]}`}
      </button>
    );
    if (id === 'pro' && (catalog?.trialDays ?? 14) > 0 && plan?.trialAvailable !== false && (!signedIn || plan?.plan === 'free')) {
      return (
        <div className="prc__ctas">
          {main}
          <button className="prc__sub-cta" onClick={signedIn ? trial : () => choose('pro')} disabled={!!busy}>
            {busy === 'trial' ? 'Starting…' : `Or try Pro free for ${catalog?.trialDays || 14} days`}
          </button>
        </div>
      );
    }
    return main;
  };

  const per = '/ month';
  return (
    <div className="prc">
      <header className="prc__nav">
        <Logo to="/" />
        <nav className="prc__links">
          <Link to="/#templates">Templates</Link>
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
        <h1 className="prc__h1">Your professional identity,<br />built in <em>one place</em>.</h1>
        <p className="prc__lead">Start free with one CV, portfolio or case study. Upgrade for all three, more of each, advanced AI, your own domain and analytics.</p>
        <div className="prc__switches">
          <div className="prc__toggle" role="group" aria-label="Currency">
            <button className={currency === 'NGN' ? 'is-on' : ''} aria-pressed={currency === 'NGN'} onClick={() => setCurrency('NGN')}>₦ Naira</button>
            <button className={currency === 'USD' ? 'is-on' : ''} aria-pressed={currency === 'USD'} onClick={() => setCurrency('USD')}>$ US dollars</button>
          </div>
          <div className="prc__toggle" role="group" aria-label="Billing period">
            <button className={!yearly ? 'is-on' : ''} aria-pressed={!yearly} onClick={() => setYearly(false)}>Monthly</button>
            <button className={yearly ? 'is-on' : ''} aria-pressed={yearly} onClick={() => setYearly(true)}>Yearly <span>Save 20%</span></button>
          </div>
        </div>
        <p className="prc__note">{currency === 'NGN'
          ? (renews ? 'Billed in naira. Renews automatically until you cancel.' : 'Billed in naira, one month or one year at a time. Renew by paying again; nothing is charged automatically.')
          : 'Billed in US dollars by card. Renews automatically until you cancel. Your bank may add its own exchange fees.'}</p>
        {message && <p className={`prc__msg ${message.error ? 'is-error' : ''}`} role={message.error ? 'alert' : 'status'}>{message.text}</p>}
        {plan?.source === 'trial' && <p className="prc__msg">Your free Pro trial ends {new Date(plan.trialEndsAt).toLocaleDateString(undefined, { day: 'numeric', month: 'long' })}. Choose a plan to keep your features.</p>}
      </section>

      <section className="prc__plans prc__plans--four" aria-label="Plans">
        {['free', 'starter', 'pro', 'premium'].map((id) => {
          const c = CARDS[id];
          const p = prices(id);
          const amount = p ? (yearly ? p.yearly / 12 : p.monthly) : 0;
          return (
            <article key={id} className={`prc__plan prc__plan--${id} ${current === id ? 'is-current' : ''}`}>
              <div className="prc__plan-top">
                <div className="prc__plan-row"><h2>{PLAN_NAMES[id]}</h2>
                  {id === 'pro' && <span className="prc__tag">Most popular</span>}{id === 'premium' && <span className="prc__tag prc__tag--gold">Everything</span>}</div>
                <p className="prc__for">{c.for}</p>
              </div>
              <div className="prc__price">
                <p><b>{catalog ? formatPrice(id === 'free' ? 0 : Math.round(amount), currency) : '—'}</b><span>{id === 'free' ? 'forever' : per}</span></p>
                <small>{id === 'free' ? 'No card needed.'
                  : yearly && p ? `${formatPrice(p.yearly, currency)} for the year${renews ? ', billed yearly' : ''}.`
                  : renews ? 'Billed monthly. Cancel any time.' : 'Paid monthly. Renew when you like.'}</small>
              </div>
              {cta(id)}
              <div className="prc__divider" />
              <p className="prc__lead-k">{c.lead}</p>
              <ul className="prc__items">
                {c.items.map(([t, s]) => <li key={t}><i aria-hidden>✓</i><span>{t}{s && <small>{s}</small>}</span></li>)}
              </ul>
            </article>
          );
        })}
      </section>
      <p className="prc__fair">*Unlimited means generous fair-use and technical limits apply.</p>

      <section className="prc__teams" aria-label="For teams and organisations">
        <div className="prc__team">
          <span className="prc__offer-tag">Coming soon</span>
          <h3>Dixlab Teams</h3>
          <p className="prc__team-price">{currency === 'NGN' ? '₦35,000' : '$39'}<span> / month</span></p>
          <p>For small teams, agencies and professional groups: up to 5 members, a shared workspace, shared templates and one bill.</p>
          <a className="prc__cta prc__cta--ghost" href="mailto:hello@dixlab.app?subject=Dixlab%20Teams">Join the waitlist</a>
        </div>
        <div className="prc__team">
          <span className="prc__offer-tag">Coming soon</span>
          <h3>Dixlab Enterprise</h3>
          <p className="prc__team-price">Custom<span> quote</span></p>
          <p>For universities, training institutions, career centres, recruiters and large organisations: bulk onboarding, your branding, admin controls and dedicated support.</p>
          <a className="prc__cta prc__cta--ghost" href="mailto:hello@dixlab.app?subject=Dixlab%20Enterprise">Talk to us</a>
        </div>
      </section>

      <section className="prc__compare">
        <h2 className="prc__h2">Compare plans</h2>
        <div className="prc__table-wrap">
          <table className="prc__table prc__table--four">
            <thead><tr><th scope="col"><span className="sr-only">Feature</span></th>{['free', 'starter', 'pro', 'premium'].map((id) => {
              const p = prices(id);
              return <th scope="col" key={id}>{PLAN_NAMES[id]}<small>{id === 'free' ? formatPrice(0, currency) : p ? `${formatPrice(p.monthly, currency)} / mo` : ''}</small></th>;
            })}</tr></thead>
            {COMPARE.map(([group, rows]) => (
              <tbody key={group}>
                <tr className="prc__group"><th scope="rowgroup" colSpan={5}>{group}</th></tr>
                {rows.map(([name, ...vals]) => (
                  <tr key={name}><th scope="row">{name}</th>{vals.map((v, i) => <td key={i} className={v === '✓' ? `is-yes is-yes--${i}` : v === '—' ? 'is-no' : ''}>{v === '—' ? <span aria-label="Not included">—</span> : v === '✓' ? <span aria-label="Included">✓</span> : v}</td>)}</tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
      </section>

      <section className="prc__units">
        <div>
          <h2 className="prc__h2">How AI units work</h2>
          <p>Every plan includes a monthly AI allowance, so you never buy credits for each action. Units reset at the start of each billing period and don’t roll over. Run out, and your work stays: keep editing by hand, or upgrade.</p>
        </div>
        <ul className="prc__unit-list">
          {UNITS.map(([t, n]) => <li key={t}><span>{t}</span><b>{n} units</b></li>)}
        </ul>
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
        <p>Start free today. Upgrade only when it’s worth it.</p>
        <div><Link to={signedIn ? homeFor(loadUser()) : '/signup'} className="prc__btn">Start free</Link><Link to="/#templates" className="prc__btn prc__btn--ghost">See templates</Link></div>
      </section>

      <footer className="prc__foot">
        <span>© {new Date().getFullYear()} Dixlab · Payments by Bachs</span>
        <span>Nigeria: prices in naira · Elsewhere: prices in US dollars. Taxes may apply.</span>
      </footer>
    </div>
  );
}
