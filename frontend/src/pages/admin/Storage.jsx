import { useState } from 'react';
import { Link } from 'react-router-dom';
import { admin } from '../../api.js';
import { Kpi, Panel, BarList, Status, useLoad, ConfirmAction, fmt, bytes, ago } from '../../components/admin/kit.jsx';
import { AdminHead } from './AdminLayout.jsx';

/** Uploaded images, videos and documents: what's using space, and cleanup. */
export default function Storage() {
  const load = useLoad(() => admin.storage(), []);
  const [ask, setAsk] = useState(false);
  const [note, setNote] = useState('');

  return (
    <>
      <AdminHead title="Storage" lead="Images, videos and documents people have uploaded." />
      {note && <p className="adm-msg adm-msg--good" role="status">{note}</p>}
      <Status state={load}>
        {(d) => {
          const total = d.kinds.reduce((a, k) => a + k.bytes, 0);
          return (
            <>
              <div className="adm-kpis adm-kpis--4">
                <Kpi label="Stored" value={total} format={bytes} hint={`${fmt(d.kinds.reduce((a, k) => a + k.count, 0))} files`} />
                <Kpi label="On disk" value={d.disk.bytes} format={bytes} hint={`${fmt(d.disk.files)} files in uploads/`} />
                <Kpi label="Unused uploads" value={d.orphans.bytes} format={bytes} hint={`${fmt(d.orphans.count)} files no page uses`}
                  status={d.orphans.count ? { tone: 'warn', label: 'Can be cleaned' } : { tone: 'good', label: 'Tidy' }} />
                <Kpi label="Videos" value={d.kinds.find((k) => k.label === 'Videos')?.bytes || 0} format={bytes} hint="usually the biggest share" />
              </div>
              <div className="adm-grid adm-grid--3">
                <Panel title="By type"><BarList rows={d.kinds.map((k) => ({ ...k, value: k.bytes }))} format={bytes} render={(r) => <>{r.label} <small className="adm-muted">{fmt(r.count)} file{r.count === 1 ? '' : 's'}</small></>} empty="No uploads yet." /></Panel>
                <Panel title="Biggest users"><BarList rows={d.topUsers.map((u) => ({ ...u, value: u.bytes }))} format={bytes} render={(r) => <><Link to={`/admin/users/${r.id}`} className="adm-link">{r.name}</Link> <small className="adm-muted">{fmt(r.count)} file{r.count === 1 ? '' : 's'}</small></>} empty="No uploads yet." /></Panel>
                <Panel title="Clean up" sub="Files that no project or live page uses any more, uploaded over a day ago (so nothing mid-edit is touched).">
                  <p className="adm-big">{fmt(d.orphans.count)} files · {bytes(d.orphans.bytes)}</p>
                  <button className="adm-btn" onClick={() => setAsk(true)} disabled={!d.orphans.count}>Delete unused uploads</button>
                </Panel>
              </div>
              <Panel title="Largest files">
                <div className="adm-table-wrap">
                  <table className="adm-table">
                    <thead><tr><th>File</th><th>Type</th><th>Owner</th><th>Uploaded</th><th className="num">Size</th></tr></thead>
                    <tbody>{d.largest.map((f) => (
                      <tr key={f.name}>
                        <td><a href={`/uploads/${f.name}`} target="_blank" rel="noreferrer" className="adm-link adm-mono">{f.name}</a></td>
                        <td>{f.contentType}</td>
                        <td>{f.owner.id ? <Link to={`/admin/users/${f.owner.id}`} className="adm-link">{f.owner.name || 'Unknown'}</Link> : '–'}</td>
                        <td>{ago(f.createdAt)}</td>
                        <td className="num">{bytes(f.size)}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                  {!d.largest.length && <p className="adm-empty">No uploads yet.</p>}
                </div>
              </Panel>
              {ask && (
                <ConfirmAction
                  title="Delete unused uploads?"
                  body={`Deletes ${fmt(d.orphans.count)} files (${bytes(d.orphans.bytes)}) that no project or page uses. This can’t be undone.`}
                  confirmLabel="Delete files" danger
                  onConfirm={() => admin.cleanup().then((r) => { setNote(`Deleted ${fmt(r.files)} files and freed ${bytes(r.bytes)}.`); load.reload(); })}
                  onClose={() => setAsk(false)}
                />
              )}
            </>
          );
        }}
      </Status>
    </>
  );
}
