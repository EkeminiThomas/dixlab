import { useEffect, useState } from 'react';
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom';
import { Logo, loadUser } from '../components/ui.jsx';
import { isSignedIn, verifyPayment, homeFor } from '../api.js';

/**
 * Bachs sends people back here after paying (?checkout_id=...). We confirm the
 * checkout with the server, which adds the credits. Bachs also tells the
 * server directly (webhook), so a slow confirmation is retried for a little while.
 */
export default function BillingCallback() {
  const [params] = useSearchParams();
  const { ref = '' } = useParams(); // Dixlab's own payment reference, in the return link
  // Bachs's checkout id, under whichever name it uses.
  const checkoutId = ['checkout_id', 'checkoutId', 'checkout_session_id', 'session_id', 'id'].map((k) => params.get(k)).find(Boolean) || '';
  const reference = ref || checkoutId;
  const [state, setState] = useState({ status: 'checking' });

  useEffect(() => {
    if (!reference || !isSignedIn()) return undefined;
    let tries = 0;
    let timer;
    let stopped = false;
    const check = async () => {
      tries += 1;
      try {
        const r = await verifyPayment(checkoutId, ref);
        if (stopped) return;
        if (r.payment === 'success') return setState({ status: 'success', plan: r.billing, domain: r.domainOrder });
        if (['failed', 'abandoned', 'reversed'].includes(r.payment)) return setState({ status: 'failed' });
        if (tries < 8) timer = setTimeout(check, 2500);
        else setState({ status: 'pending' });
      } catch (e) {
        if (!stopped) setState({ status: 'error', message: e.body?.unavailable ? 'Payments aren’t set up on this server.' : e.message });
      }
    };
    check();
    return () => { stopped = true; clearTimeout(timer); };
  }, [reference]);

  if (!isSignedIn()) return <Navigate to={`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`} replace />;
  const home = homeFor(loadUser());

  return (
    <div className="prc prc--center">
      <header className="prc__nav"><Logo to={home} /></header>
      <main className="bcb" aria-live="polite">
        {!reference && <><h1>No payment to check</h1><p>This page is where you land after paying.</p><Link className="prc__btn" to="/pricing">See prices</Link></>}
        {reference && state.status === 'checking' && <><span className="cz__spin" aria-hidden /><h1>Confirming your payment…</h1><p>This takes a few seconds.</p></>}
        {state.status === 'success' && state.domain && <>
          <span className="bcb__ok" aria-hidden>✓</span>
          <h1>{state.domain.status === 'failed' ? `We couldn’t register ${state.domain.domain}` : `${state.domain.domain} is yours`}</h1>
          <p>{state.domain.status === 'failed' ? state.domain.error
            : state.domain.status === 'active' ? 'It’s registered and connected to your page. HTTPS can take a few minutes the first time.'
            : 'Payment received. We’re registering it now and will connect it to your page by ourselves, usually within a few minutes. You can follow it in Publish.'}</p>
          <div className="bcb__actions"><Link className="prc__btn" to={`/editor/${state.domain.projectId}`}>Back to your page</Link></div>
        </>}
        {state.status === 'success' && !state.domain && <>
          <span className="bcb__ok" aria-hidden>✓</span>
          <h1>You have {(state.plan.credits ?? 0).toLocaleString()} credits.</h1>
          <p>Thanks! Your credits are on your account and never expire. A receipt is on its way to your email.</p>
          <div className="bcb__actions"><Link className="prc__btn" to={home}>Go to your work</Link><Link className="prc__btn prc__btn--ghost" to="/account#billing">Credits &amp; billing</Link></div>
        </>}
        {state.status === 'pending' && <>
          <h1>Your payment is still being confirmed</h1>
          <p>Bachs hasn’t confirmed it yet. It usually takes a minute; your credits arrive automatically as soon as it does.</p>
          <div className="bcb__actions"><button className="prc__btn" onClick={() => window.location.reload()}>Check again</button><Link className="prc__btn prc__btn--ghost" to={home}>Go to your work</Link></div>
        </>}
        {state.status === 'failed' && <>
          <h1>The payment didn’t go through</h1>
          <p>You haven’t been charged. You can try again with another card.</p>
          <Link className="prc__btn" to="/pricing">Back to prices</Link>
        </>}
        {state.status === 'error' && <>
          <h1>We couldn’t check that payment</h1>
          <p>{state.message} If you were charged, your credits arrive automatically; contact us if they don’t.</p>
          <Link className="prc__btn" to="/account#billing">Credits &amp; billing</Link>
        </>}
      </main>
    </div>
  );
}
