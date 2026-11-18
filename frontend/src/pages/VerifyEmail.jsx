import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { verifyEmail, isSignedIn, homeFor } from '../api.js';
import { useUser } from '../components/ui.jsx';
import { AuthLayout } from './AuthAside.jsx';

/**
 * The token from an emailed link (#token=…; older links used ?token=…). The
 * part after "#" is never sent to any server, so it stays out of logs and
 * Referer headers; it's also removed from the address bar straight away, so it
 * doesn't stay in history or get shared by accident.
 * Returns undefined while reading, '' if there wasn't one.
 */
export function useLinkToken() {
  // Read the token once, while the page first renders and before anything changes
  // the address. (Reading it in an effect lost it in development: React runs effects
  // twice there, and the second run found the address already cleaned.)
  const [token] = useState(() => {
    const fromHash = new URLSearchParams(window.location.hash.slice(1)).get('token');
    const fromQuery = new URLSearchParams(window.location.search).get('token');
    return fromHash || fromQuery || '';
  });
  useEffect(() => {
    // Then take it out of the address bar, so it isn't kept in history or shared by accident.
    if (window.location.hash || window.location.search) window.history.replaceState(null, '', window.location.pathname);
  }, []);
  return token;
}

/** Confirms an email address from the link we sent. */
export default function VerifyEmail() {
  const token = useLinkToken();
  const user = useUser();
  const [state, setState] = useState({ status: 'working' });
  const ran = useRef(false);

  useEffect(() => {
    if (token === undefined || ran.current) return;
    ran.current = true;
    if (!token) { setState({ status: 'error', error: 'This link is incomplete.' }); return; }
    verifyEmail(token)
      .then(() => setState({ status: 'done' }))
      .catch((err) => setState({ status: 'error', error: err.offline ? 'Can’t reach the Dixlab server. Please try again.' : err.message }));
  }, [token]);

  const next = isSignedIn() ? homeFor(user) : '/login';
  return (
    <AuthLayout
      mode="verify"
      title={state.status === 'done' ? 'Email confirmed.' : state.status === 'error' ? 'That link didn’t work.' : 'Confirming your email…'}
      lead={state.status === 'done' ? 'Thanks! You can now publish your work.' : state.status === 'error' ? state.error : 'One moment.'}
    >
      {state.status === 'working' ? <span className="cz__spin" aria-label="Working" /> : (
        <div className="auth__submit">
          <Link to={state.status === 'done' ? next : (isSignedIn() ? '/account' : '/login')} className="app-btn app-btn--primary">
            {state.status === 'done' ? (isSignedIn() ? 'Continue' : 'Log in') : (isSignedIn() ? 'Send a new link' : 'Log in to send a new link')}
          </Link>
        </div>
      )}
    </AuthLayout>
  );
}
