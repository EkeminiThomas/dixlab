import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { admin } from '../api.js';
import { useUser } from '../components/ui.jsx';
import { Kpi, Panel, EventRow, Status, useLoad, ConfirmAction, fmt, bytes, date, ago, KIND } from './kit.jsx';
import { AdminHead } from './AdminLayout.jsx';

/** One account: what they've made, their activity, and account actions. */
export default function UserDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const me = useUser();
  const load = useLoad(() => admin.user(id), [id]);
  const [ask, setAsk] = useState(null);
  const [note, setNote] = useState('');
  const done = (msg) => { setNote(msg); load.reload(); };

  return (
    <Status state={load}>
      {({ user: u, projects, uploads, sessions, messages, activity, plan }) => {
        const self = u.id === me.id;
        const actions = {
          suspend: { title: `Suspend ${u.name}?`, body: 'They’ll be signed out everywhere, can’t log in, and their published pages and contact forms go offline until you unsuspend them. Nothing is deleted.', confirmLabel: 'Suspend account', danger: true, reasonLabel: 'Reason (kept in the activity log)', onConfirm: ({ reason }) => admin.suspend(u.id, reason).then(() => done('Account suspended.')) },
          unsuspend: { title: `Unsuspend ${u.name}?`, body: 'They can log in again and their published pages come back online.', confirmLabel: 'Unsuspend', onConfirm: () => admin.unsuspend(u.id).then(() => done('Account unsuspended.')) },
          signout: { title: 'Sign them out everywhere?', body: `Ends all ${fmt(sessions)} active session${sessions === 1 ? '' : 's'}. Useful if they think someone else got into their account. They can log straight back in.`, confirmLabel: 'Sign out everywhere', onConfirm: () => admin.signOutUser(u.id).then(() => done('Signed out of every device.')) },
          grant: { title: `Make ${u.name} an admin?`, body: 'Admins can see every account and page, suspend and delete people, and take pages down.', confirmLabel: 'Make admin', onConfirm: () => admin.setAdmin(u.id, true).then(() => done('They’re now an admin.')) },
          revoke: { title: 'Remove admin access?', body: 'They keep their account but lose access to this dashboard.', confirmLabel: 'Remove admin', onConfirm: () => admin.setAdmin(u.id, false).then(() => done('Admin access removed.')) },
          delete: { title: `Delete ${u.name}’s account?`, body: `This permanently deletes the account, ${fmt(projects.length)} project${projects.length === 1 ? '' : 's'}, every published page, their messages and ${bytes(uploads.bytes)} of uploads. It can’t be undone.`, confirmLabel: 'Delete everything', danger: true, phrase: u.email, onConfirm: ({ typed }) => admin.deleteUser(u.id, typed).then(() => nav('/admin/users')) },
        };
        return (
          <>
            <p className="adm-crumb"><Link to="/admin/users">← All users</Link></p>
            <AdminHead
              title={u.name}
              lead={<>{u.email} · joined {date(u.createdAt)} · last active {ago(u.lastSeenAt)}</>}
              actions={(
                <div className="adm-actions">
                  {u.suspended
                    ? <button className="adm-btn" onClick={() => setAsk('unsuspend')}>Unsuspend</button>
                    : <button className="adm-btn" onClick={() => setAsk('suspend')} disabled={self} title={self ? 'You can’t suspend yourself' : undefined}>Suspend</button>}
                  <button className="adm-btn" onClick={() => setAsk('signout')} disabled={!sessions}>Sign out everywhere</button>
                  {u.isAdmin
                    ? <button className="adm-btn" onClick={() => setAsk('revoke')} disabled={self} title={self ? 'You can’t remove your own admin access' : undefined}>Remove admin</button>
                    : <button className="adm-btn" onClick={() => setAsk('grant')}>Make admin</button>}
                  <button className="adm-btn adm-btn--danger" onClick={() => setAsk('delete')} disabled={self}>Delete account</button>
                </div>
              )}
            />
            {note && <p className="adm-msg adm-msg--good" role="status">{note}</p>}
            {u.suspended && <p className="adm-msg adm-msg--bad">Suspended {ago(u.suspendedAt)}{u.suspendReason ? `: “${u.suspendReason}”` : ''}. Their pages are offline.</p>}
            <div className="adm-kpis adm-kpis--5">
              <Kpi label="Projects" value={projects.length} />
              <Kpi label="Live pages" value={projects.filter((p) => p.slug).length} />
              <Kpi label="Page views" value={projects.reduce((a, p) => a + p.views, 0)} />
              <Kpi label="Messages received" value={messages} />
              <Kpi label="Storage used" value={uploads.bytes} format={bytes} hint={`${fmt(uploads.count)} files`} />
            </div>
            {plan && <PlanPanel user={u} plan={plan} self={self} onSaved={(p) => done(p.given ? `${self ? 'You now have' : 'They now have'} ${p.name} for free.` : 'The plan you gave was removed.')} />}
            <div className="adm-grid adm-grid--2-1">
              <Panel title="Projects">
                {projects.length ? (
                  <div className="adm-table-wrap">
                    <table className="adm-table">
                      <thead><tr><th>Title</th><th>Type</th><th>Template</th><th>Updated</th><th>Live page</th><th className="num">Views</th></tr></thead>
                      <tbody>{projects.map((p) => (
                        <tr key={p.id}>
                          <td><b>{p.title}</b></td><td>{KIND[p.type]}</td><td>{p.template}</td><td>{ago(p.updatedAt)}</td>
                          <td>{p.slug ? <a href={`/p/${p.slug}`} target="_blank" rel="noreferrer" className="adm-link">Open ↗</a> : <span className="adm-muted">Draft</span>}</td>
                          <td className="num">{fmt(p.views)}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                ) : <p className="adm-empty">No projects yet.</p>}
              </Panel>
              <Panel title="Recent activity" actions={<Link to={`/admin/activity?user=${u.id}`} className="adm-link">All</Link>}>
                {activity.length ? <ul className="adm-feed">{activity.map((e) => <EventRow key={e.id} e={e} showUser={false} />)}</ul> : <p className="adm-empty">Nothing recorded yet.</p>}
              </Panel>
            </div>
            <p className="adm-fine">User id <code>{u.id}</code> · {fmt(sessions)} active session{sessions === 1 ? '' : 's'}</p>
            {ask && <ConfirmAction {...actions[ask]} onClose={() => setAsk(null)} />}
          </>
        );
      }}
    </Status>
  );
}


const GIVE = [['free', 'Free'], ['starter', 'Starter'], ['pro', 'Pro'], ['premium', 'Premium']];
const SOURCE = { subscription: 'paid subscription', trial: 'free trial', override: 'given by an admin', free: 'default' };

/** Give someone a plan for free (yourself, a teammate, a tester), or take it back. */
function PlanPanel({ user, plan, self, onSaved }) {
  const [pick, setPick] = useState(plan.given || 'pro');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const save = async (value) => {
    setBusy(true); setError('');
    try { onSaved(await admin.setPlan(user.id, value)); } catch (e) { setError(e.message); }
    setBusy(false);
  };
  return (
    <Panel title="Plan">
      <div className="adm-plan">
        <p className="adm-plan__now">
          <b>{plan.name}</b> <span>· {SOURCE[plan.source] || plan.source}</span>
          {plan.given && plan.source !== 'override' && <span> · a {plan.given} plan you gave is below their paid plan</span>}
        </p>
        <div className="adm-plan__form">
          <label className="adm-select"><span className="sr-only">Plan to give</span>
            <select value={pick} onChange={(e) => setPick(e.target.value)} disabled={busy}>
              {GIVE.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>
          </label>
          <button className="adm-btn adm-btn--primary" disabled={busy} onClick={() => save(pick)}>{busy ? 'Saving…' : `Give ${self ? 'myself' : 'them'} this plan`}</button>
          {plan.given && <button className="adm-btn" disabled={busy} onClick={() => save('none')}>Remove the plan I gave</button>}
        </div>
        <small className="adm-plan__hint">Free of charge, no payment needed, and it doesn’t expire. If they pay for a higher plan, that one applies. Recorded in the activity log.</small>
        {error && <p className="form-error" role="alert">{error}</p>}
      </div>
    </Panel>
  );
}
