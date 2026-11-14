import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Logo, AppSparkles13, useProjects, useUser, initials } from './ui.jsx';
import { logOut, useUnread, refreshUnread } from '../api.js';

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
  const counts = { all: 0, portfolio: 0, cv: 0, case: 0 };
  useProjects().forEach((p) => { counts.all += 1; counts[p.type] = (counts[p.type] || 0) + 1; });

  const go = (k) => {
    if (k === 'portfolio') return nav('/portfolio');
    if (k === 'cv') return nav('/cv');
    if (k === 'case') return nav('/case');
    if (onFilter) return onFilter(k);
    nav(k === 'all' ? '/dashboard' : `/dashboard?f=${k}`);
  };
  const unread = useUnread();
  useEffect(() => { refreshUnread(); }, []);
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
        <p className="dash__nav-k dash__nav-k--gap">Inbox</p>
        <button className={`dash__nav-btn ${active === 'messages' ? 'is-active' : ''}`} onClick={() => nav('/messages')} aria-pressed={active === 'messages'}>
          <span>Messages</span>
          <small>{unread > 0 ? <span className="dash__nav-badge" aria-label={`${unread} unread`}>{unread}</span> : null}</small>
        </button>
      </nav>
      <div className="dash__side-foot">
        <div className="dash__tip">
          <p className="dash__tip-t"><AppSparkles13 />One story. More ways to tell it.</p>
          <p className="dash__tip-d">A finished case study makes a strong section in your portfolio and a sharper line in your CV.</p>
        </div>
        <div className="dash__user">
          <span className="dash__avatar">{initials(user.name)}</span>
          <div>
            <p className="dash__user-name">{user.name}</p>
            <button className="dash__logout" onClick={onLogOut}>Log out</button>
          </div>
        </div>
      </div>
    </aside>
  );
}
