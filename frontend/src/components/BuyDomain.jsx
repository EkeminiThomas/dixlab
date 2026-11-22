import { useEffect, useState } from 'react';
import { request, formatPrice, getCurrency } from '../api.js';
import { loadUser } from './ui.jsx';

const COUNTRIES = [['NG', 'Nigeria'], ['GH', 'Ghana'], ['KE', 'Kenya'], ['ZA', 'South Africa'], ['GB', 'United Kingdom'], ['US', 'United States'],
  ['CA', 'Canada'], ['DE', 'Germany'], ['FR', 'France'], ['NL', 'Netherlands'], ['AE', 'United Arab Emirates'], ['IN', 'India']];
const STATUS = { paid: 'Payment received · registering', registering: 'Registering (usually a few minutes)', active: 'Live', failed: 'Not registered' };

/** Search, pick and pay for a domain (bought through pxxl.app, owned by the customer). */
export default function BuyDomain({ projectId, demo, onLive }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState(null);
  const [pick, setPick] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [orders, setOrders] = useState([]);
  const currency = getCurrency();

  // Domains being registered right now: check on them every few seconds.
  useEffect(() => {
    let live = true; let timer;
    const load = () => request('/api/domain-orders').then((r) => {
      if (!live) return;
      const mine = r.orders.filter((o) => o.projectId === projectId);
      setOrders(mine);
      if (mine.some((o) => o.status === 'active')) onLive?.();
      if (mine.some((o) => o.status === 'paid' || o.status === 'registering')) timer = setTimeout(load, 8000);
    }).catch(() => {});
    load();
    return () => { live = false; clearTimeout(timer); };
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  const search = async (e) => {
    e.preventDefault();
    setBusy('search'); setError(''); setPick(null);
    try { setResults((await request(`/api/domains/search?q=${encodeURIComponent(q)}`)).results); } catch (err) { setError(err.message); }
    setBusy('');
  };

  const pending = orders.filter((o) => o.status !== 'active');
  const bought = (order) => { setPick(null); setResults(null); setOrders((list) => [order, ...list]); if (order.status === 'active') onLive?.(); };
  return (
    <div className="buyd">
      {demo && <p className="buyd__demo">Demo mode: nothing is really bought or charged. Names with “taken” show as unavailable; names with “fail” test the refund.</p>}
      {pending.map((o) => (
        <p key={o.reference} className={`buyd__order is-${o.status}`} role="status">
          <b>{o.domain}</b> · {STATUS[o.status] || o.status}{o.error ? ` · ${o.error}` : ''}
        </p>
      ))}
      {!pick ? (
        <>
          <form className="pw__form" onSubmit={search}>
            <input className="field__input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="yourname or yourname.com" aria-label="Find a domain" autoComplete="off" />
            <button type="submit" className="app-btn app-btn--primary" disabled={!q.trim() || !!busy}>{busy === 'search' ? 'Searching…' : 'Search'}</button>
          </form>
          {results && (
            <ul className="buyd__results">
              {results.map((r) => (
                <li key={r.domain}>
                  <span className={r.available ? '' : 'is-taken'}>{r.domain}{r.premium && <em> premium</em>}</span>
                  {r.available ? (
                    <>
                      <b>{formatPrice(r.prices[currency], currency)}<small> / year</small></b>
                      <button type="button" className="app-btn app-btn--ghost" onClick={() => setPick(r)}>Buy</button>
                    </>
                  ) : <i>{r.error ? 'Couldn’t check' : 'Taken'}</i>}
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <Checkout projectId={projectId} pick={pick} currency={currency} demo={demo} onDone={bought} onBack={() => setPick(null)} onError={setError} />
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  );
}

function Checkout({ projectId, pick, currency, demo, onDone, onBack, onError }) {
  const user = loadUser();
  const [first, ...rest] = String(user.name || '').split(' ');
  const [c, setC] = useState({ firstName: first || '', lastName: rest.join(' '), email: user.email || '', phone: '', organization: '',
    address1: '', address2: '', city: '', state: '', postalCode: '', country: currency === 'NGN' ? 'NG' : 'US' });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setC({ ...c, [k]: e.target.value });
  const ready = ['firstName', 'lastName', 'email', 'phone', 'address1', 'city', 'state', 'postalCode'].every((k) => c[k].trim());
  const pay = async (e) => {
    e.preventDefault();
    setBusy(true); onError('');
    try {
      const r = await request(`/api/projects/${encodeURIComponent(projectId)}/domain/buy`, { method: 'POST', body: { domain: pick.domain, years: 1, currency, contact: c } });
      if (r.url) window.location.assign(r.url);
      else if (r.order) onDone(r.order);  // demo without payments: done at once
    } catch (err) { onError(err.message); setBusy(false); }
  };
  const field = (k, label, props = {}) => (
    <label className="field"><span className="field__label">{label}</span><input className="field__input" value={c[k]} onChange={set(k)} {...props} /></label>
  );
  return (
    <form className="buyd__form" onSubmit={pay}>
      <p className="buyd__pick"><b>{pick.domain}</b> · {formatPrice(pick.prices[currency], currency)} for the first year</p>
      <p className="pw__d">Domain registrations need the owner’s real details. You’ll own the domain; it’s registered through pxxl.app.</p>
      <div className="ed__pair">{field('firstName', 'First name', { autoComplete: 'given-name' })}{field('lastName', 'Last name', { autoComplete: 'family-name' })}</div>
      <div className="ed__pair">{field('email', 'Email', { type: 'email', autoComplete: 'email' })}{field('phone', 'Phone', { type: 'tel', autoComplete: 'tel', placeholder: '+234…' })}</div>
      {field('address1', 'Address', { autoComplete: 'address-line1' })}
      <div className="ed__pair">{field('city', 'City', { autoComplete: 'address-level2' })}{field('state', 'State', { autoComplete: 'address-level1' })}</div>
      <div className="ed__pair">
        {field('postalCode', 'Postal code', { autoComplete: 'postal-code' })}
        <label className="field"><span className="field__label">Country</span>
          <select className="field__input" value={c.country} onChange={set('country')}>{COUNTRIES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </label>
      </div>
      <p className="pw__d">After you pay, we register it and connect it to this page by ourselves. Domain registrations are final and can’t be refunded once registered; if registration fails, you’re refunded automatically.</p>
      <div className="pw__btns">
        <button type="submit" className="app-btn app-btn--primary" disabled={!ready || busy}>{busy ? 'Opening checkout…' : `${demo ? 'Demo: pay' : 'Pay'} ${formatPrice(pick.prices[currency], currency)}`}</button>
        <button type="button" className="ed__browse" onClick={onBack}>Back</button>
      </div>
    </form>
  );
}
