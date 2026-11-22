import { useEffect, useState } from 'react';
import { projectAnalytics, usePlan, openUpgrade, hasFeature } from '../api.js';

const SOURCE_NAMES = {
  direct: 'Direct or app', dixlab: 'Dixlab', linkedin: 'LinkedIn', x: 'X', google: 'Google', github: 'GitHub',
  facebook: 'Facebook', instagram: 'Instagram', whatsapp: 'WhatsApp', telegram: 'Telegram', bing: 'Bing',
  duckduckgo: 'DuckDuckGo', mercor: 'Mercor', upwork: 'Upwork',
};
const fmtDay = (d) => new Date(`${d}T00:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' });

/**
 * Visitor analytics for one published page (Pro: 30 days, Premium: a year).
 * Views over time, where visitors came from, what they opened, how far they
 * read and what they did next. Nothing here identifies a visitor.
 */
export default function Analytics({ projectId }) {
  const { plan } = usePlan();
  const maxDays = hasFeature('insights', plan) ? (plan?.limits?.insightDays || 365) : 0;
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!maxDays) return;
    let live = true;
    setError('');
    projectAnalytics(projectId, Math.min(days, maxDays))
      .then((r) => { if (live) setData(r); })
      .catch((e) => { if (live) setError(e.offline ? 'Can’t reach the Dixlab server.' : e.message); });
    return () => { live = false; };
  }, [projectId, days, maxDays]);

  if (!maxDays) {
    return (
      <div className="ana ana--locked">
        <p className="ana__t">Visitor insights <span className="ana__tag">Unlock</span></p>
        <p className="ana__d">See where visitors come from (LinkedIn, Google, a direct link), which projects they open, how far they read, and who downloads your CV or books a call.</p>
        <button type="button" className="app-btn app-btn--ghost" onClick={() => openUpgrade({ code: 'unlock_needed', feature: 'insights' })}>Unlock with credits</button>
      </div>
    );
  }
  if (error) return <div className="ana"><p className="form-error" role="alert">{error}</p></div>;
  if (!data) return <div className="ana"><p className="ana__d">Loading insights…</p></div>;
  if (!data.published) return null;

  const ranges = [7, 30, 90, 365].filter((d) => d <= maxDays);
  const read = data.depth['100'] && data.total ? Math.round((data.depth['100'] / data.total) * 100) : null;
  return (
    <div className="ana">
      <div className="ana__head">
        <p className="ana__t">Visitor insights</p>
        <div className="ana__ranges" role="group" aria-label="Time range">
          {ranges.map((d) => (
            <button key={d} type="button" className={`ana__range ${days === d ? 'is-active' : ''}`} aria-pressed={days === d} onClick={() => setDays(d)}>
              {d === 365 ? '1y' : `${d}d`}
            </button>
          ))}
        </div>
      </div>
      <div className="ana__tiles">
        <Tile label={`Views, last ${data.days} days`} value={data.total} />
        <Tile label="CV downloads" value={data.actions.cv} />
        <Tile label="Calls booked" value={data.actions.book} />
        <Tile label="Messages" value={data.actions.messages} />
      </div>
      <Bars series={data.series} />
      <div className="ana__cols">
        <List title="Where visitors came from" rows={data.sources.map((r) => ({ label: SOURCE_NAMES[r.key] || r.key, n: r.count }))} empty="No visits yet." />
        {data.opens.length > 0 && <List title="Projects opened" rows={data.opens.map((r) => ({ label: r.key, n: r.count }))} />}
      </div>
      <p className="ana__foot">
        {read != null ? `${read}% of visitors read to the end. ` : ''}
        {data.actions.link ? `${data.actions.link} clicked through to a live link or profile. ` : ''}
        {data.allTime} views since you published.
      </p>
    </div>
  );
}

function Tile({ label, value }) {
  return <div className="ana__tile"><b>{value.toLocaleString()}</b><span>{label}</span></div>;
}

/** Daily views as thin bars, one hue, with a tooltip per day. */
function Bars({ series }) {
  const [hover, setHover] = useState(null);
  const max = Math.max(1, ...series.map((d) => d.views));
  const h = 72;
  const w = 100 / series.length;
  return (
    <figure className="ana__chart">
      <figcaption className="ana__cap">Views per day</figcaption>
      <div className="ana__plot" onMouseLeave={() => setHover(null)}>
        <svg viewBox={`0 0 100 ${h}`} preserveAspectRatio="none" role="img" aria-label={`Views per day, highest ${max}`}>
          <line x1="0" x2="100" y1={h - 0.5} y2={h - 0.5} className="ana__base" />
          {series.map((d, i) => {
            const bh = d.views ? Math.max(2, (d.views / max) * (h - 6)) : 0;
            return (
              <g key={d.day} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={-1}>
                <rect x={i * w} y="0" width={w} height={h} fill="transparent" />
                {bh > 0 && <rect className={`ana__bar ${hover === i ? 'is-hover' : ''}`} x={i * w + w * 0.18} y={h - 1 - bh} width={w * 0.64} height={bh} rx="0.6" />}
              </g>
            );
          })}
        </svg>
        {hover != null && (
          <div className="ana__tip" style={{ left: `${(hover + 0.5) * w}%` }} role="status">
            <b>{series[hover].views}</b> {series[hover].views === 1 ? 'view' : 'views'}<span>{fmtDay(series[hover].day)}</span>
          </div>
        )}
      </div>
      <div className="ana__axis"><span>{fmtDay(series[0].day)}</span><span>Max {max}</span><span>{fmtDay(series[series.length - 1].day)}</span></div>
      <details className="ana__table">
        <summary>Show as a table</summary>
        <table><thead><tr><th>Day</th><th>Views</th></tr></thead>
          <tbody>{series.filter((d) => d.views).map((d) => <tr key={d.day}><td>{fmtDay(d.day)}</td><td>{d.views}</td></tr>)}</tbody>
        </table>
      </details>
    </figure>
  );
}

function List({ title, rows, empty }) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  return (
    <div className="ana__list">
      <p className="ana__cap">{title}</p>
      {rows.length === 0 ? <p className="ana__d">{empty}</p> : (
        <ul>
          {rows.slice(0, 6).map((r) => (
            <li key={r.label} title={`${r.label}: ${r.n}`}>
              <span className="ana__lbl">{r.label}</span>
              <span className="ana__meter"><i style={{ width: `${(r.n / max) * 100}%` }} /></span>
              <b>{r.n}</b>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
