import { admin } from '../api.js';
import { Kpi, Panel, EventRow, Status, useLoad, fmt, bytes } from './kit.jsx';
import { AdminHead } from './AdminLayout.jsx';

const uptime = (s) => (s >= 86400 ? `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h` : s >= 3600 ? `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m` : `${Math.floor(s / 60)}m`);

/** Is everything working? Services, storage, versions and recent server errors. */
export default function System() {
  const load = useLoad(() => admin.system(), []);
  return (
    <>
      <AdminHead title="System health" lead="Whether the server and the services Dixlab depends on are working." actions={<button className="adm-btn" onClick={load.reload}>Refresh</button>} />
      <Status state={load}>
        {(d) => (
          <>
            <div className="adm-kpis adm-kpis--4">
              <Kpi label="API" value={d.status === 'ok' ? 'Running' : d.status} format={(v) => v} hint={`up ${uptime(d.uptimeSeconds)}`} status={{ tone: 'good', label: 'Healthy' }} />
              <Kpi label="Errors · 24h" value={d.errors.last24h} status={d.errors.last24h ? { tone: 'bad', label: 'Needs a look' } : { tone: 'good', label: 'None' }} />
              <Kpi label="Database" value={d.storage.databaseBytes} format={bytes} hint="SQLite" />
              <Kpi label="Uploads on disk" value={d.storage.uploadBytes} format={bytes} hint={`${fmt(d.storage.uploadFiles)} files`} />
            </div>
            <div className="adm-grid adm-grid--3">
              <Panel title="Services">
                <ul className="adm-checks">
                  <li><span className={`adm-pill adm-pill--${d.services.ai.configured ? 'good' : 'warn'}`}><span aria-hidden>{d.services.ai.configured ? '✓' : '!'}</span>{d.services.ai.configured ? 'On' : 'Off'}</span>
                    <span><b>AI (Claude)</b><small>{d.services.ai.configured ? `${d.services.ai.model} · ${fmt(d.services.ai.last24h)} requests, ${fmt(d.services.ai.failed24h)} failed in 24h` : 'Set ANTHROPIC_API_KEY in backend/.env. The app falls back to built-in helpers.'}</small></span></li>
                  <li><span className={`adm-pill adm-pill--${d.services.email.configured ? 'good' : 'warn'}`}><span aria-hidden>{d.services.email.configured ? '✓' : '!'}</span>{d.services.email.configured ? 'On' : 'Off'}</span>
                    <span><b>Email (SMTP)</b><small>{d.services.email.configured ? 'Get in touch messages are emailed to owners.' : 'Set SMTP_* in backend/.env. Until then, Get in touch messages are saved but owners aren’t told about them.'}</small></span></li>
                  <li><span className="adm-pill adm-pill--admin">{fmt(d.admins.count)}</span>
                    <span><b>Admins</b><small>Granted with <code>python -m app.admin_cli grant</code> or by another admin</small></span></li>
                </ul>
              </Panel>
              <Panel title="Records">
                <table className="adm-table adm-table--tight"><tbody>
                  {Object.entries(d.tables).map(([t, n]) => <tr key={t}><td>{t}</td><td className="num">{fmt(n)}</td></tr>)}
                </tbody></table>
              </Panel>
              <Panel title="Versions">
                <table className="adm-table adm-table--tight"><tbody>
                  {Object.entries(d.versions).map(([k, v]) => <tr key={k}><td>{k}</td><td className="num adm-mono">{v}</td></tr>)}
                </tbody></table>
              </Panel>
            </div>
            <Panel title="Recent server errors" sub="Request path and status only. Full details are in the server log.">
              {d.errors.recent.length ? <ul className="adm-feed adm-feed--full">{d.errors.recent.map((e) => <EventRow key={e.id} e={e} />)}</ul> : <p className="adm-empty">No server errors recorded.</p>}
            </Panel>
          </>
        )}
      </Status>
    </>
  );
}
