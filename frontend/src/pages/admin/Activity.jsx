import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { admin } from '../../api.js';
import { Panel, Pager, EventRow, Status, useLoad } from '../../components/admin/kit.jsx';
import { AdminHead } from './AdminLayout.jsx';

const GROUPS = [['', 'Everything'], ['user.', 'Accounts'], ['project.', 'Projects'], ['page.', 'Publishing'], ['ai.', 'AI'], ['upload.', 'Uploads'], ['contact.', 'Messages'], ['admin.', 'Admin actions'], ['error', 'Errors']];

/** Everything that happens on Dixlab, newest first, with an audit trail of admin actions. */
export default function Activity() {
  const [params, setParams] = useSearchParams();
  const type = params.get('type') || '';
  const user = params.get('user') || '';
  const [page, setPage] = useState(1);
  const load = useLoad(() => admin.activity({ type, user, page }), [type, user, page]);
  const pick = (t) => { const next = new URLSearchParams(params); if (t) next.set('type', t); else next.delete('type'); setParams(next); setPage(1); };

  return (
    <>
      <AdminHead title="Activity log" lead="Sign-ups, publishing, AI use, errors and every admin action. Kept for 180 days." />
      <Panel>
        <div className="adm-filters">
          <div className="seg seg--sm adm-seg-wrap" role="tablist" aria-label="Kind of activity">
            {GROUPS.map(([k, l]) => <button key={k || 'all'} role="tab" aria-selected={type === k} className={`seg__btn ${type === k ? 'is-active' : ''}`} onClick={() => pick(k)}>{l}</button>)}
          </div>
          {user && <span className="adm-chip">One user <Link to="/admin/activity" className="adm-link" onClick={() => setPage(1)}>Clear</Link></span>}
        </div>
        <Status state={load}>
          {(d) => (
            <>
              {d.events.length ? <ul className="adm-feed adm-feed--full">{d.events.map((e) => <EventRow key={e.id} e={e} />)}</ul> : <p className="adm-empty">Nothing recorded for this filter.</p>}
              <Pager page={d.page} pageSize={d.pageSize} total={d.total} onPage={setPage} />
            </>
          )}
        </Status>
      </Panel>
    </>
  );
}
