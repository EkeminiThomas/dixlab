import { Suspense, useEffect } from 'react';
import '../../admin.css';
import { Link, NavLink, Navigate, Outlet } from 'react-router-dom';
import { Logo, useUser, initials } from '../../components/ui.jsx';
import { isSignedIn, refreshUser } from '../../api.js';

const NAV = [
  ['/admin', 'Overview', true],
  ['/admin/users', 'Users'],
  ['/admin/pages', 'Published pages'],
  ['/admin/messages', 'Messages'],
  ['/admin/storage', 'Storage'],
  ['/admin/activity', 'Activity log'],
  ['/admin/system', 'System health'],
];

/**
 * The admin area. Only admins get past the check here, and the server
 * checks every request again, so hiding the UI is never the only guard.
 */
export default function AdminLayout() {
  const user = useUser();
  useEffect(() => { refreshUser(); }, []);
  if (!isSignedIn()) return <Navigate to="/login" replace />;
  if (!user.isAdmin) {
    return (
      <div className="adm-denied">
        <Logo to="/dashboard" />
        <h1>Admins only</h1>
        <p>This area is for the people who run Dixlab. If you should have access, ask an admin to add you.</p>
        <Link to="/dashboard" className="app-btn app-btn--primary">Back to your work</Link>
      </div>
    );
  }
  return (
    <div className="adm">
      <aside className="adm__side">
        <div className="adm__brand"><Logo to="/admin" /><span className="adm__tag">Admin</span></div>
        <nav className="adm__nav" aria-label="Admin">
          {NAV.map(([to, label, end]) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => `adm__link ${isActive ? 'is-active' : ''}`}>{label}</NavLink>
          ))}
        </nav>
        <div className="adm__side-foot">
          <Link to="/dashboard" className="adm__back">← Back to the app</Link>
          <div className="adm__me"><span className="dash__avatar">{initials(user.name)}</span><span><b>{user.name}</b><small>{user.email}</small></span></div>
        </div>
      </aside>
      <main className="adm__main"><Suspense fallback={<div className="adm-msg"><span className="cz__spin" aria-label="Loading" /></div>}><Outlet /></Suspense></main>
    </div>
  );
}

export function AdminHead({ title, lead, actions }) {
  return (
    <header className="adm-head">
      <div><h1 className="adm-head__t">{title}</h1>{lead && <p className="adm-head__lead">{lead}</p>}</div>
      {actions && <div className="adm-head__actions">{actions}</div>}
    </header>
  );
}
