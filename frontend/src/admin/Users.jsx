import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { admin } from '../api.js';
import { Panel, Pager, Status, useLoad, fmt, ago, date } from './kit.jsx';
import { AdminHead } from './AdminLayout.jsx';

const STATES = [['all', 'Everyone'], ['active', 'Active'], ['suspended', 'Suspended'], ['admins', 'Admins']];
const SORTS = [['newest', 'Newest'], ['active', 'Last active'], ['projects', 'Most projects'], ['views', 'Most views'], ['name', 'Name'], ['oldest', 'Oldest']];

/** Every account: search, filter, sort, open one, export to CSV. */
export default function Users() {
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [state, setState] = useState('all');
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState('');
  useEffect(() => { const t = setTimeout(() => { setSearch(q); setPage(1); }, 250); return () => clearTimeout(t); }, [q]);
  const load = useLoad(() => admin.users({ q: search, state, sort, page }), [search, state, sort, page]);

  const exportCsv = async () => {
    setExporting('Exporting…');
    try { await admin.exportUsers({ q: search, state }); setExporting(''); } catch (e) { setExporting(e.message); }
  };

  return (
    <>
      <AdminHead title="Users" lead="Everyone with a Dixlab account." actions={<button className="adm-btn" onClick={exportCsv} disabled={exporting === 'Exporting…'}>{exporting || 'Export CSV'}</button>} />
      <Panel>
        <div className="adm-filters">
          <input className="field__input adm-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email or user id" aria-label="Search users" />
          <div className="seg seg--sm" role="tablist" aria-label="Status">
            {STATES.map(([k, l]) => <button key={k} role="tab" aria-selected={state === k} className={`seg__btn ${state === k ? 'is-active' : ''}`} onClick={() => { setState(k); setPage(1); }}>{l}</button>)}
          </div>
          <label className="adm-select"><span>Sort</span>
            <select value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }}>{SORTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          </label>
        </div>
        <Status state={load}>
          {(d) => (
            <>
              <div className="adm-table-wrap">
                <table className="adm-table">
                  <thead><tr><th>Person</th><th>Joined</th><th>Last active</th><th className="num">Projects</th><th className="num">Live pages</th><th className="num">Views</th><th>Status</th></tr></thead>
                  <tbody>
                    {d.users.map((u) => (
                      <tr key={u.id}>
                        <td><Link to={`/admin/users/${u.id}`} className="adm-person"><b>{u.name}</b><small>{u.email}</small></Link></td>
                        <td title={date(u.createdAt)}>{ago(u.createdAt)}</td>
                        <td>{ago(u.lastSeenAt)}</td>
                        <td className="num">{fmt(u.projects)}</td>
                        <td className="num">{fmt(u.pages)}</td>
                        <td className="num">{fmt(u.views)}</td>
                        <td>
                          {u.suspended ? <span className="adm-pill adm-pill--bad"><span aria-hidden>!</span>Suspended</span> : <span className="adm-pill adm-pill--good"><span aria-hidden>✓</span>Active</span>}
                          {u.isAdmin && <span className="adm-pill adm-pill--admin">Admin</span>}
                          {!u.emailVerified && <span className="adm-pill adm-pill--warn"><span aria-hidden>!</span>Email not confirmed</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!d.users.length && <p className="adm-empty">No one matches that.</p>}
              </div>
              <Pager page={d.page} pageSize={d.pageSize} total={d.total} onPage={setPage} />
            </>
          )}
        </Status>
      </Panel>
    </>
  );
}
