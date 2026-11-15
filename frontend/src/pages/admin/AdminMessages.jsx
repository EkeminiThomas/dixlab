import { useState } from 'react';
import { Link } from 'react-router-dom';
import { admin } from '../../api.js';
import { Panel, Pager, Status, useLoad, ConfirmAction, fmt, ago } from '../../components/admin/kit.jsx';
import { AdminHead } from './AdminLayout.jsx';

/**
 * Get in touch traffic, for spotting spam and delivery problems. Only who,
 * when and whether it was delivered: what visitors wrote stays private.
 */
export default function AdminMessages() {
  const [page, setPage] = useState(1);
  const [doomed, setDoomed] = useState(null);
  const load = useLoad(() => admin.messages(page), [page]);

  return (
    <>
      <AdminHead title="Messages" lead="Messages visitors sent through Get in touch forms. Contents stay private between the visitor and the owner." />
      <Status state={load}>
        {(d) => (
          <Panel sub={d.emailEnabled ? 'Email delivery is on.' : 'Email delivery is off (no SMTP settings): messages are saved, but owners don’t receive them until it’s set up.'}>
            <div className="adm-table-wrap">
              <table className="adm-table">
                <thead><tr><th>From</th><th>To</th><th>Sent</th><th className="num">Length</th><th>Delivered</th><th>Read</th><th /></tr></thead>
                <tbody>
                  {d.messages.map((m) => (
                    <tr key={m.id}>
                      <td><span className="adm-person"><b>{m.fromName}</b><small>{m.fromEmail}</small></span>{m.spammy && <span className="adm-pill adm-pill--warn" title="This sender wrote to 3 or more portfolios in the last day"><span aria-hidden>!</span>Possible spam</span>}</td>
                      <td><Link to={`/admin/users/${m.owner.id}`} className="adm-link">{m.owner.name}</Link></td>
                      <td>{ago(m.createdAt)}</td>
                      <td className="num">{fmt(m.length)} chars</td>
                      <td>{m.emailed ? <span className="adm-pill adm-pill--good"><span aria-hidden>✓</span>Emailed</span> : <span className="adm-pill adm-pill--warn"><span aria-hidden>!</span>Not emailed</span>}</td>
                      <td>{m.read ? 'Yes' : <span className="adm-muted">Not yet</span>}</td>
                      <td className="adm-row-act"><button className="adm-btn adm-btn--sm" onClick={() => setDoomed(m)}>Delete</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!d.messages.length && <p className="adm-empty">No messages yet.</p>}
            </div>
            <Pager page={d.page} pageSize={d.pageSize} total={d.total} onPage={setPage} />
          </Panel>
        )}
      </Status>
      {doomed && (
        <ConfirmAction
          title="Delete this message?"
          body={`From ${doomed.fromName} to ${doomed.owner.name}. Use this for spam or abuse.`}
          confirmLabel="Delete message" danger
          onConfirm={() => admin.deleteMessage(doomed.id).then(load.reload)}
          onClose={() => setDoomed(null)}
        />
      )}
    </>
  );
}
