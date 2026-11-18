import { useEffect, useState } from 'react';
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom';
import { Logo, loadUser } from '../components/ui.jsx';
import { isSignedIn, verifyPayment, homeFor } from '../api.js';

/**
 * Bachs sends people back here after paying (?checkout_id=...). We confirm the
 * checkout with the server, which switches the plan on. Bachs also tells the
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
        if (r.payment === 'success') return setState({ status: 'success', plan: r.billing });
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
  const until = state.plan?.periodEnd && new Date(state.plan.periodEnd).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className="prc prc--center">
      <header className="prc__nav"><Logo to={home} /></header>
      <main className="bcb" aria-live="polite">
        {!reference && <><h1>No payment to check</h1><p>This page is where you land after paying.</p><Link className="prc__btn" to="/pricing">See plans</Link></>}
        {reference && state.status === 'checking' && <><span className="cz__spin" aria-hidden /><h1>Confirming your payment…</h1><p>This takes a few seconds.</p></>}
        {state.status === 'success' && <>
          <span className="bcb__ok" aria-hidden>✓</span>
          <h1>You’re on {state.plan.name}.</h1>
          <p>Thanks for upgrading. {until && <>Your plan renews on {until}. </>}A receipt is on its way to your email.</p>
          <div className="bcb__actions"><Link className="prc__btn" to={home}>Go to your work</Link><Link className="prc__btn prc__btn--ghost" to="/account">Plan &amp; billing</Link></div>
        </>}
        {state.status === 'pending' && <>
          <h1>Your payment is still being confirmed</h1>
          <p>Bachs hasn’t confirmed it yet. It usually takes a minute; your plan switches on automatically as soon as it does.</p>
          <div className="bcb__actions"><button className="prc__btn" onClick={() => window.location.reload()}>Check again</button><Link className="prc__btn prc__btn--ghost" to={home}>Go to your work</Link></div>
        </>}
        {state.status === 'failed' && <>
          <h1>The payment didn’t go through</h1>
          <p>You haven’t been charged. You can try again with another card.</p>
          <Link className="prc__btn" to="/pricing">Back to plans</Link>
        </>}
        {state.status === 'error' && <>
          <h1>We couldn’t check that payment</h1>
          <p>{state.message} If you were charged, your plan switches on automatically; contact us if it doesn’t.</p>
          <Link className="prc__btn" to="/account">Plan &amp; billing</Link>
        </>}
      </main>
    </div>
  );
}
