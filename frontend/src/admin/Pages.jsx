import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { admin } from '../api.js';
import { Panel, Pager, Status, useLoad, ConfirmAction, fmt, ago, KIND } from './kit.jsx';
import { AdminHead } from './AdminLayout.jsx';

const KINDS = [['all', 'All'], ['portfolio', 'Portfolios'], ['cv', 'CVs'], ['case', 'Case studies']];
const GALLERY = [['any', 'All pages'], ['requested', 'Gallery requests'], ['featured', 'Featured']];
const SORTS = [['newest', 'Newest'], ['updated', 'Recently updated'], ['views', 'Most viewed']];

/** Every live page: review it, see its reach, take it down if it breaks the rules. */
export default function Pages() {
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState('all');
  const [sort, setSort] = useState('newest');
  const [gal, setGal] = useState('any');
  const [page, setPage] = useState(1);
  const [doomed, setDoomed] = useState(null);
  const [note, setNote] = useState('');
  useEffect(() => { const t = setTimeout(() => { setSearch(q); setPage(1); }, 250); return () => clearTimeout(t); }, [q]);
  const load = useLoad(() => admin.pages({ q: search, kind, sort, page, gallery: gal }), [search, kind, sort, page, gal]);
  const decide = (p, status) => admin.gallery(p.slug, status).then(() => {
    setNote(status === 'featured' ? `“${p.title}” is now in the gallery.` : status === 'declined' ? `Declined “${p.title}”.` : `“${p.title}” left the gallery.`);
    load.reload();
  });

  return (
    <>
      <AdminHead title="Published pages" lead="Every portfolio, CV and case study that’s live right now." />
      {note && <p className="adm-msg adm-msg--good" role="status">{note}</p>}
      <Panel>
        <div className="adm-filters">
          <input className="field__input adm-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title, link or owner" aria-label="Search pages" />
          <div className="seg seg--sm" role="tablist" aria-label="Type">
            {KINDS.map(([k, l]) => <button key={k} role="tab" aria-selected={kind === k} className={`seg__btn ${kind === k ? 'is-active' : ''}`} onClick={() => { setKind(k); setPage(1); }}>{l}</button>)}
          </div>
          <div className="seg seg--sm" role="tablist" aria-label="Gallery">
            {GALLERY.map(([k, l]) => <button key={k} role="tab" aria-selected={gal === k} className={`seg__btn ${gal === k ? 'is-active' : ''}`} onClick={() => { setGal(k); setPage(1); }}>{l}</button>)}
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
                  <thead><tr><th>Page</th><th>Owner</th><th>Type</th><th>Published</th><th>Updated</th><th className="num">Views</th><th /></tr></thead>
                  <tbody>
                    {d.pages.map((p) => (
                      <tr key={p.slug}>
                        <td><a href={`/p/${p.slug}`} target="_blank" rel="noreferrer" className="adm-person"><b>{p.title}</b><small>/p/{p.slug} ↗</small></a></td>
                        <td><Link to={`/admin/users/${p.owner.id}`} className="adm-link">{p.owner.name}</Link>{p.owner.suspended && <span className="adm-pill adm-pill--bad">Suspended</span>}</td>
                        <td>{KIND[p.kind]} <small className="adm-muted">{p.template}</small></td>
                        <td>{ago(p.createdAt)}</td>
                        <td>{ago(p.updatedAt)}</td>
                        <td className="num">{fmt(p.views)}</td>
                        <td className="adm-row-act">
                          {p.gallery === 'requested' && <><button className="adm-btn adm-btn--sm" onClick={() => decide(p, 'featured')}>Feature</button> <button className="adm-btn adm-btn--sm" onClick={() => decide(p, 'declined')}>Decline</button> </>}
                          {p.gallery === 'featured' && <><span className="adm-pill">Featured</span> <button className="adm-btn adm-btn--sm" onClick={() => decide(p, 'none')}>Unfeature</button> </>}
                          <button className="adm-btn adm-btn--sm" onClick={() => setDoomed(p)}>Take down</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!d.pages.length && <p className="adm-empty">No live pages match that.</p>}
              </div>
              <Pager page={d.page} pageSize={d.pageSize} total={d.total} onPage={setPage} />
            </>
          )}
        </Status>
      </Panel>
      {doomed && (
        <ConfirmAction
          title={`Take down “${doomed.title}”?`}
          body={`The link /p/${doomed.slug} stops working straight away. ${doomed.owner.name}’s project isn’t deleted; they can publish again (at a new link).`}
          confirmLabel="Take down page" danger reasonLabel="Reason (kept in the activity log)"
          onConfirm={({ reason }) => admin.takedown(doomed.slug, reason).then(() => { setNote(`“${doomed.title}” was taken down.`); load.reload(); })}
          onClose={() => setDoomed(null)}
        />
      )}
    </>
  );
}
