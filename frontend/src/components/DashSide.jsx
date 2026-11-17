import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Logo, AppSparkles13, useProjects, useUser, initials } from './ui.jsx';
import { logOut, resendVerification, isSignedIn, usePlan } from '../api.js';

const ITEMS = [
  ['all', 'Everything'],
  ['portfolio', 'Portfolios'],
  ['cv', 'CVs'],
  ['case', 'Case studies'],
];

/**
 * The app sidebar shared by the dashboard and the portfolio templates page.
 * Portfolios, CVs and Case studies open their template collections; "Everything" lists your work.
 */
export default function DashSide({ active, onFilter }) {
  const nav = useNavigate();
  const user = useUser();
  const { plan } = usePlan();
  const counts = { all: 0, portfolio: 0, cv: 0, case: 0 };
  useProjects().forEach((p) => { counts.all += 1; counts[p.type] = (counts[p.type] || 0) + 1; });

  const go = (k) => {
    if (k === 'portfolio') return nav('/portfolio');
    if (k === 'cv') return nav('/cv');
    if (k === 'case') return nav('/case');
    if (onFilter) return onFilter(k);
    nav(k === 'all' ? '/dashboard' : `/dashboard?f=${k}`);
  };
  const onLogOut = async () => { await logOut(); nav('/login'); };

  return (
    <aside className="dash__side">
      <div className="dash__logo"><Logo to="/dashboard" /></div>
      <nav className="dash__nav" aria-label="Your work">
        <p className="dash__nav-k">Your work</p>
        {ITEMS.map(([k, label]) => (
          <button key={k} className={`dash__nav-btn ${active === k ? 'is-active' : ''}`} onClick={() => go(k)} aria-pressed={active === k}>
            <span>{label}</span>
            <small>{k !== 'all' ? <span className="dash__nav-new">Templates</span> : counts[k]}</small>
          </button>
        ))}
        {user.isAdmin && (
          <>
            <p className="dash__nav-k dash__nav-k--gap">Dixlab</p>
            <button className="dash__nav-btn" onClick={() => nav('/admin')}>
              <span>Admin dashboard</span>
              <small><span className="dash__nav-new">Admin</span></small>
            </button>
          </>
        )}
      </nav>
      <div className="dash__side-foot">
        {isSignedIn() && user.emailVerified === false ? <VerifyNudge /> : (
        <div className="dash__tip">
          <p className="dash__tip-t"><AppSparkles13 />One story. More ways to tell it.</p>
          <p className="dash__tip-d">A finished case study makes a strong section in your portfolio and a sharper line in your CV.</p>
        </div>
        )}
        <div className="dash__user">
          {isSignedIn() ? <UserMenu user={user} onLogOut={onLogOut} /> : <span className="dash__avatar">{initials(user.name || 'You')}</span>}
          <div>
            <p className="dash__user-name">{user.name || (isSignedIn() ? 'Your profile' : 'Not signed in')}</p>
            {plan?.enforced && (
              <Link to="/pricing" className={`dash__plan dash__plan--${plan.plan}`} title={plan.source === 'trial' ? 'Free Pro trial' : `${plan.name} plan`}>
                {plan.name}{plan.source === 'trial' ? ' trial' : ''}{plan.plan !== 'premium' && <span>Upgrade</span>}
              </Link>
            )}
            {plan?.enforced && plan.usage?.ai && (() => {
              const { units, allowance } = plan.usage.ai;
              const left = Math.max(0, allowance - units);
              const level = left === 0 ? 'is-out' : left <= allowance * 0.2 ? 'is-low' : '';
              return (
                <Link to="/account" className={`dash__units ${level}`} title="AI units reset at the start of each billing period">
                  {left === 0 ? 'No AI units left' : `${left} of ${allowance} AI units left`}
                </Link>
              );
            })()}
            <span className="dash__user-links">
              {isSignedIn()
                ? <><Link to="/account" className={`dash__logout ${active === 'account' ? 'is-on' : ''}`}>Profile</Link>
                  <button className="dash__logout" onClick={onLogOut}>Log out</button></>
                : <Link to="/login" className="dash__logout">Log in</Link>}
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
}

/** The avatar opens a small menu: view your profile, change your password, delete your account, log out. */
function UserMenu({ user, onLogOut }) {
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (e.type === 'keydown' ? e.key === 'Escape' : !box.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close); };
  }, [open]);
  const go = (hash) => { setOpen(false); nav(`/account${hash}`); };
  return (
    <div className="umenu" ref={box}>
      <button type="button" className="dash__avatar umenu__btn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}
        title="Your profile">{initials(user.name || 'You')}</button>
      {open && (
        <div className="umenu__pop" role="menu">
          <div className="umenu__who"><b>{user.name || 'Your profile'}</b><span>{user.email}</span></div>
          <button role="menuitem" onClick={() => go('#profile')}>View profile</button>
          <button role="menuitem" onClick={() => go('#password')}>Change password</button>
          <button role="menuitem" onClick={() => go('#billing')}>Plan &amp; billing</button>
          <button role="menuitem" className="is-danger" onClick={() => go('#delete')}>Delete account</button>
          <button role="menuitem" onClick={() => { setOpen(false); onLogOut(); }}>Log out</button>
        </div>
      )}
    </div>
  );
}

/** Shown until the account's email is confirmed (needed to publish). */
function VerifyNudge() {
  const [state, setState] = useState('');
  const send = async () => {
    setState('Sending…');
    try { await resendVerification(); setState('Sent! Check your inbox.'); } catch (e) { setState(e.message); }
  };
  return (
    <div className="dash__tip dash__tip--verify" role="status">
      <p className="dash__tip-t">Confirm your email</p>
      <p className="dash__tip-d">We sent you a link. Confirm your email to publish your work and receive messages from visitors.</p>
      {state ? <p className="dash__tip-d dash__tip-note">{state}</p>
        : <button className="dash__tip-btn" onClick={send}>Send the link again</button>}
    </div>
  );
}
