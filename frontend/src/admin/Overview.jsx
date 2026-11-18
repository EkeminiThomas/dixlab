import { useState } from 'react';
import { Link } from 'react-router-dom';
import { admin } from '../api.js';
import { Kpi, Panel, ColumnChart, BarList, EventRow, Status, useLoad, fmt, KIND } from './kit.jsx';
import { AdminHead } from './AdminLayout.jsx';

const RANGES = [[7, '7 days'], [30, '30 days'], [90, '90 days']];
const CHARTS = [['signups', 'Sign-ups', 'sign-ups'], ['projects', 'Projects started', 'projects'], ['published', 'Pages published', 'pages'], ['views', 'Page views', 'views']];

/** The health of Dixlab at a glance: growth, usage, the funnel and live activity. */
export default function Overview() {
  const [days, setDays] = useState(30);
  const [chart, setChart] = useState('signups');
  const state = useLoad(() => admin.overview(days), [days]);

  return (
    <>
      <AdminHead
        title="Overview"
        lead="How Dixlab is growing and what people are doing right now."
        actions={(
          <div className="seg" role="tablist" aria-label="Time range">
            {RANGES.map(([d, l]) => <button key={d} role="tab" aria-selected={days === d} className={`seg__btn ${days === d ? 'is-active' : ''}`} onClick={() => setDays(d)}>{l}</button>)}
          </div>
        )}
      />
      <Status state={state}>
        {(d) => {
          const k = d.kpis;
          return (
            <>
              <div className="adm-kpis">
                <Kpi label="Total users" value={k.users.value} hint={`+${fmt(k.users.new)} in ${days} days`} to="/admin/users" />
                <Kpi label={`New users · ${days}d`} value={k.users.new} prev={k.users.newPrev} />
                <Kpi label="Active · 7 days" value={k.active7.value} prev={k.active7.prev} hint="used the app" />
                <Kpi label="Live pages" value={k.pages.value} hint={`${fmt(k.pages.new)} published in ${days}d`} to="/admin/pages" />
                <Kpi label={`Page views · ${days}d`} value={k.views.value} prev={k.views.prev} hint={`${fmt(k.views.total)} all time`} />
                <Kpi label={`AI requests · ${days}d`} value={k.ai.value}
                  status={k.ai.configured ? (k.ai.failed ? { tone: 'warn', label: `${fmt(k.ai.failed)} failed` } : { tone: 'good', label: 'Working' }) : { tone: 'warn', label: 'Not configured' }} />
                <Kpi label={`Messages · ${days}d`} value={k.messages.value} to="/admin/messages" />
                <Kpi label="Errors · 24h" value={k.errors24h} to="/admin/system"
                  status={k.errors24h ? { tone: 'bad', label: 'Check system' } : { tone: 'good', label: 'All clear' }} />
              </div>

              <div className="adm-grid adm-grid--2-1">
                <Panel
                  title={CHARTS.find((c) => c[0] === chart)[1]}
                  sub={`Per day, last ${days} days (UTC)`}
                  actions={(
                    <div className="seg seg--sm" role="tablist" aria-label="Metric">
                      {CHARTS.map(([key, label]) => <button key={key} role="tab" aria-selected={chart === key} className={`seg__btn ${chart === key ? 'is-active' : ''}`} onClick={() => setChart(key)}>{label}</button>)}
                    </div>
                  )}
                >
                  <ColumnChart data={d.series[chart]} label={CHARTS.find((c) => c[0] === chart)[1]} unit={CHARTS.find((c) => c[0] === chart)[2]} />
                </Panel>
                <Panel title="Live activity" sub="The latest things people did" actions={<Link to="/admin/activity" className="adm-link">See all</Link>}>
                  {d.recent.length ? <ul className="adm-feed">{d.recent.map((e) => <EventRow key={e.id} e={e} />)}</ul> : <p className="adm-empty">No activity yet.</p>}
                </Panel>
              </div>

              <div className="adm-grid adm-grid--3">
                <Panel title="Funnel" sub="How far people get, all time">
                  <BarList rows={d.funnel} labelKey="step" share />
                </Panel>
                <Panel title="Popular templates" sub="Projects using each template">
                  <BarList rows={d.templates} render={(r) => <>{r.label} <small className="adm-muted">{KIND[r.kind]}</small></>} empty="No projects yet." />
                </Panel>
                <Panel title="What people make" sub="Projects by type">
                  <BarList rows={d.byType.map((r) => ({ ...r, label: KIND[r.label] || r.label }))} empty="No projects yet." />
                  <h3 className="adm-panel__t adm-panel__t--sub">AI features · {days}d</h3>
                  <BarList rows={d.aiByFeature.map((r) => ({ ...r, label: { customize: 'Customize', interview_next: 'Interview questions', interview_draft: 'Interview drafts' }[r.label] || r.label }))}
                    render={(r) => <>{r.label}{r.failed ? <small className="adm-bad"> · {fmt(r.failed)} failed</small> : null}</>}
                    empty={k.ai.configured ? 'No AI requests in this period.' : 'AI isn’t configured on this server (ANTHROPIC_API_KEY).'} />
                </Panel>
              </div>
            </>
          );
        }}
      </Status>
    </>
  );
}
