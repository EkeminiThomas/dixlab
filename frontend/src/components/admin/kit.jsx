import { useEffect, useId, useState } from 'react';
import { Link } from 'react-router-dom';

/* ==========================================================================
   Building blocks for the admin dashboard: number formats, event labels,
   stat tiles and small, accessible charts (hover tooltips + a table view).
   ========================================================================== */

export const fmt = (n) => (n == null ? '–' : Number(n).toLocaleString('en-GB'));
export const compact = (n) => (n >= 10000 ? `${(n / 1000).toFixed(n >= 100000 ? 0 : 1)}K` : fmt(n));
export const bytes = (n = 0) => (n >= 1073741824 ? `${(n / 1073741824).toFixed(1)} GB` : n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : n >= 1024 ? `${Math.round(n / 1024)} KB` : `${n} B`);
export const date = (ms) => (ms ? new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '–');
export const dateTime = (ms) => (ms ? new Date(ms).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '–');
export const shortDay = (d) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
export function ago(ms) {
  if (!ms) return 'never';
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return date(ms);
}
export const KIND = { portfolio: 'Portfolio', cv: 'CV', case: 'Case study' };

/** Plain-English descriptions of activity log entries. */
const LABELS = {
  'user.signup': 'signed up',
  'user.login': 'logged in',
  'user.login_failed': 'failed to log in',
  'project.created': (d) => `started a ${KIND[d.kind]?.toLowerCase() || 'project'}${d.template ? ` (${d.template})` : ''}`,
  'project.deleted': 'deleted a project',
  'page.published': (d) => `published a ${KIND[d.kind]?.toLowerCase() || 'page'}`,
  'page.updated': 'updated a live page',
  'page.unpublished': 'unpublished a page',
  'contact.sent': 'received a Get in touch message',
  'upload.created': (d) => `uploaded ${d.kind === 'video' ? 'a video' : d.kind === 'file' ? 'a document' : 'an image'} (${bytes(d.size)})`,
  'ai.customize': (d) => `used AI Customize${d.ok ? '' : ' (failed)'}`,
  'ai.interview_next': (d) => `answered an interview question${d.ok ? '' : ' (AI failed)'}`,
  'ai.interview_draft': (d) => `had the interview write a draft${d.ok ? '' : ' (failed)'}`,
  error: (d) => `Server error ${d.status} on ${d.method} ${d.path}`,
  'admin.suspend': (d) => `was suspended by an admin${d.reason ? `: “${d.reason}”` : ''}`,
  'admin.unsuspend': 'was unsuspended by an admin',
  'admin.signout': 'was signed out everywhere by an admin',
  'admin.grant': 'was made an admin',
  'admin.revoke': 'had admin removed',
  'admin.takedown': (d) => `had a page taken down${d.reason ? `: “${d.reason}”` : ''}`,
  'admin.delete_user': 'was deleted by an admin',
  'admin.delete_message': 'had a message deleted by an admin',
  'admin.export_users': (d) => `Users exported to CSV (${fmt(d.count)} rows)`,
  'admin.cleanup_uploads': (d) => `Unused uploads cleaned up (${fmt(d.files)} files, ${bytes(d.bytes)})`,
};
export function describe(e) {
  const l = LABELS[e.type];
  return typeof l === 'function' ? l(e.data || {}) : l || e.type;
}
export const TONE = (type) => (type === 'error' || type === 'user.login_failed' || type.endsWith('_failed') ? 'bad'
  : type.startsWith('admin.') ? 'admin' : type.startsWith('page.published') || type === 'user.signup' ? 'good' : 'plain');

/** One line of the activity feed. */
export function EventRow({ e, showUser = true }) {
  const self = !['error', 'admin.export_users', 'admin.cleanup_uploads'].includes(e.type);
  const failed = e.data && e.data.ok === false;
  return (
    <li className={`adm-ev adm-ev--${failed ? 'bad' : TONE(e.type)}`}>
      <span className="adm-ev__dot" aria-hidden />
      <span className="adm-ev__text">
        {self && showUser && (e.userId
          ? (e.userName ? <Link to={`/admin/users/${e.userId}`} className="adm-ev__who">{e.userName}</Link> : <span className="adm-ev__who adm-ev__who--gone">Deleted user</span>)
          : <span className="adm-ev__who adm-ev__who--gone">Someone</span>)}{self && showUser ? ' ' : ''}
        {describe(e)}
        {e.actorName && <span className="adm-ev__by"> · by {e.actorName}</span>}
      </span>
      <time className="adm-ev__time" dateTime={new Date(e.createdAt).toISOString()} title={dateTime(e.createdAt)}>{ago(e.createdAt)}</time>
    </li>
  );
}

/** A headline number with its change against the previous period. */
export function Kpi({ label, value, prev, hint, to, format = fmt, status }) {
  const delta = prev == null ? null : value - prev;
  const pct = prev ? Math.round((delta / prev) * 100) : null;
  const body = (
    <>
      <span className="adm-kpi__label">{label}</span>
      <strong className="adm-kpi__value">{format(value)}</strong>
      <span className="adm-kpi__foot">
        {delta != null && (
          <span className={`adm-kpi__delta ${delta > 0 ? 'is-up' : delta < 0 ? 'is-down' : ''}`}>
            <span aria-hidden>{delta > 0 ? '▲' : delta < 0 ? '▼' : '■'}</span>
            {delta === 0 ? 'No change' : `${delta > 0 ? '+' : ''}${fmt(delta)}${pct != null ? ` (${pct > 0 ? '+' : ''}${pct}%)` : ''}`}
          </span>
        )}
        {status && <span className={`adm-pill adm-pill--${status.tone}`}><span aria-hidden>{status.tone === 'good' ? '✓' : '!'}</span>{status.label}</span>}
        {hint && <span className="adm-kpi__hint">{hint}</span>}
      </span>
    </>
  );
  return to ? <Link to={to} className="adm-kpi is-link">{body}</Link> : <div className="adm-kpi">{body}</div>;
}

export function Panel({ title, sub, actions, children, className = '' }) {
  return (
    <section className={`adm-panel ${className}`}>
      {(title || actions) && (
        <header className="adm-panel__head">
          <div>{title && <h2 className="adm-panel__t">{title}</h2>}{sub && <p className="adm-panel__sub">{sub}</p>}</div>
          {actions && <div className="adm-panel__actions">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

const niceMax = (v) => {
  if (v <= 4) return 4;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = Math.ceil(v / p);
  return (n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
};

/**
 * Daily values as columns (one series). Hover or focus a day for its value;
 * "Table" shows the same numbers as a table.
 */
export function ColumnChart({ data = [], label, unit = '' }) {
  const [hover, setHover] = useState(null);
  const [table, setTable] = useState(false);
  const id = useId();
  const max = niceMax(Math.max(0, ...data.map((d) => d.value)));
  const total = data.reduce((a, d) => a + d.value, 0);
  const W = 640; const H = 180; const L = 34; const B = 22; const T = 8;
  const plotW = W - L - 4; const plotH = H - B - T;
  const step = plotW / Math.max(1, data.length);
  const barW = Math.min(24, Math.max(2, step - 2));
  const ticks = [0, max / 2, max];
  const every = Math.ceil(data.length / 6);
  const shown = hover != null ? data[hover] : null;

  return (
    <div className="adm-chart">
      <div className="adm-chart__bar">
        <p className="adm-chart__readout" aria-live="polite">
          {shown ? <><b>{fmt(shown.value)}</b> {unit} on {shortDay(shown.day)}</> : <><b>{fmt(total)}</b> {unit} in {data.length} days</>}
        </p>
        <button type="button" className="adm-link" onClick={() => setTable((t) => !t)} aria-expanded={table} aria-controls={id}>{table ? 'Chart' : 'Table'}</button>
      </div>
      {table ? (
        <div className="adm-chart__table" id={id}>
          <table className="adm-table adm-table--tight">
            <thead><tr><th>Day</th><th className="num">{label}</th></tr></thead>
            <tbody>{[...data].reverse().map((d) => <tr key={d.day}><td>{shortDay(d.day)}</td><td className="num">{fmt(d.value)}</td></tr>)}</tbody>
          </table>
        </div>
      ) : (
        <svg id={id} className="adm-chart__svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label}: ${fmt(total)} ${unit} over ${data.length} days`} onMouseLeave={() => setHover(null)}>
          {ticks.map((t) => {
            const y = T + plotH - (t / max) * plotH;
            return (
              <g key={t}>
                <line x1={L} x2={W} y1={y} y2={y} className="adm-chart__grid" />
                <text x={L - 6} y={y + 3} className="adm-chart__tick" textAnchor="end">{compact(t)}</text>
              </g>
            );
          })}
          {data.map((d, i) => {
            const h = (d.value / max) * plotH;
            const x = L + i * step + (step - barW) / 2;
            const y = T + plotH - h;
            const r = Math.min(4, barW / 2, h);
            return (
              <g key={d.day} className={`adm-chart__col ${hover === i ? 'is-on' : ''}`}>
                {h > 0 && <path d={`M${x},${T + plotH} V${y + r} Q${x},${y} ${x + r},${y} H${x + barW - r} Q${x + barW},${y} ${x + barW},${y + r} V${T + plotH} Z`} className="adm-chart__mark" />}
                <rect x={L + i * step} y={T} width={step} height={plotH} fill="transparent" tabIndex={0}
                  onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)}
                  aria-label={`${shortDay(d.day)}: ${fmt(d.value)} ${unit}`} />
                {i % every === 0 && <text x={L + i * step + step / 2} y={H - 6} className="adm-chart__tick" textAnchor="middle">{shortDay(d.day)}</text>}
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}

/** Horizontal bars with the value at the tip. Optional share of the first row (funnels). */
export function BarList({ rows = [], valueKey = 'value', labelKey = 'label', share = false, empty = 'Nothing yet.', render, format = fmt }) {
  const max = Math.max(1, ...rows.map((r) => r[valueKey]));
  const first = rows[0]?.[valueKey] || 0;
  if (!rows.length) return <p className="adm-empty">{empty}</p>;
  return (
    <ul className="adm-bars">
      {rows.map((r, i) => {
        const v = r[valueKey];
        return (
          <li key={`${r[labelKey]}-${i}`} className="adm-bars__row">
            <span className="adm-bars__label">{render ? render(r) : r[labelKey]}</span>
            <span className="adm-bars__track">
              <span className="adm-bars__fill" style={{ width: `${Math.max(v ? 1.5 : 0, (v / max) * 100)}%` }} />
              <span className="adm-bars__value">{format(v)}{share && i > 0 && first ? <small> · {Math.round((v / first) * 100)}%</small> : null}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function Pager({ page, pageSize, total, onPage }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return <p className="adm-pager__info">{fmt(total)} total</p>;
  return (
    <nav className="adm-pager" aria-label="Pages">
      <span className="adm-pager__info">{fmt((page - 1) * pageSize + 1)}–{fmt(Math.min(total, page * pageSize))} of {fmt(total)}</span>
      <button type="button" className="adm-btn" onClick={() => onPage(page - 1)} disabled={page <= 1}>← Previous</button>
      <button type="button" className="adm-btn" onClick={() => onPage(page + 1)} disabled={page >= pages}>Next →</button>
    </nav>
  );
}

/** Load data for a page, with loading and error states. */
export function useLoad(fn, deps) {
  const [state, setState] = useState({ loading: true });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    setState((s) => ({ ...s, loading: true, error: '' }));
    fn().then((data) => live && setState({ data }))
      .catch((e) => live && setState({ error: e.offline ? 'Can’t reach the Dixlab server.' : e.message }));
    return () => { live = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return { ...state, reload: () => setTick((t) => t + 1) };
}

export function Status({ state, children }) {
  if (state.error) return <div className="adm-msg adm-msg--bad" role="alert">{state.error}<button type="button" className="adm-link" onClick={state.reload}>Try again</button></div>;
  if (!state.data) return <div className="adm-msg"><span className="cz__spin" aria-label="Loading" /></div>;
  return children(state.data);
}

/** Confirm a risky admin action; optionally require typing a phrase, or a reason. */
export function ConfirmAction({ title, body, confirmLabel, danger, phrase, reasonLabel, onConfirm, onClose }) {
  const [typed, setTyped] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const ok = !phrase || typed.trim().toLowerCase() === phrase.toLowerCase();
  const go = async () => {
    setBusy(true); setError('');
    try { await onConfirm({ typed: typed.trim(), reason: reason.trim() }); onClose(); } catch (e) { setError(e.message); setBusy(false); }
  };
  return (
    <div className="confirm" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="confirm__box adm-confirm" role="alertdialog" aria-modal="true" aria-labelledby="adm-c-t">
        <h2 id="adm-c-t" className="confirm__t">{title}</h2>
        <p className="confirm__d">{body}</p>
        {reasonLabel && (
          <label className="field"><span className="field__label">{reasonLabel} <em className="field__opt">optional</em></span>
            <input className="field__input" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} autoFocus />
          </label>
        )}
        {phrase && (
          <label className="field"><span className="field__label">Type <b>{phrase}</b> to confirm</span>
            <input className="field__input" value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus autoComplete="off" />
          </label>
        )}
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="confirm__actions">
          <button type="button" className="app-btn app-btn--ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className={`app-btn ${danger ? 'adm-btn--danger' : 'app-btn--primary'}`} onClick={go} disabled={!ok || busy}>{busy ? 'Working…' : confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
