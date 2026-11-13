import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { img } from '../assets.js';
import {
  Icon, AppArrow, AppArrowAccent,
  FORMATS, TEMPLATES, useProjects, useUser, timeAgo, useAmbient,
  deleteProject, ConfirmDelete, TrashIcon,
} from '../components/ui.jsx';
import DashSide from '../components/DashSide.jsx';
import { ScaledSite, SITE_TEMPLATES } from '../components/sites/index.jsx';
import { projectToSite } from '../components/sites/shared.jsx';
import { ScaledDoc, CV_TEMPLATES } from '../components/cv/index.jsx';
import { projectToCv } from '../components/cv/data.js';
import { ScaledCase, CASE_TEMPLATES } from '../components/case/index.jsx';
import { projectToCase } from '../components/case/data.js';

const STARTERS = [
  ['portfolio', '01 / PORTFOLIO', 'A home for your best work.', 'Bring projects, skills, and perspective together in one place.'],
  ['cv', '02 / CV', 'More than a list of roles.', 'A clear, purposeful CV that shows where you want to go next.'],
  ['case', '03 / CASE STUDY', 'Talk it through. We’ll write it up.', 'A ten-minute interview turns one project into a case study in your own words.'],
];

export default function Dashboard() {
  const [params, setParams] = useSearchParams();
  const projects = useProjects();
  const [doomed, setDoomed] = useState(null);
  const remove = () => { deleteProject(doomed.id); setDoomed(null); };
  const filter = ['cv', 'case', 'portfolio'].includes(params.get('f')) ? params.get('f') : 'all';
  const setFilter = (k) => setParams(k === 'all' ? {} : { f: k });
  const [q, setQ] = useState('');
  useAmbient();
  const user = useUser();
  const first = user.name.split(' ')[0];

  const shown = useMemo(
    () => [...projects]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .filter((p) => (filter === 'all' || p.type === filter) && p.title.toLowerCase().includes(q.trim().toLowerCase())),
    [projects, filter, q]
  );

  return (
    <div className="dash">
      <DashSide active={filter} onFilter={setFilter} />

      <main className="dash__main">
        <header className="dash__head">
          <div>
            <p className="section-label"><Icon src={img.markerApp} size={6} /><span>Your experience, coming into focus</span></p>
            <h1 className="dash__title">Good to see you, {first}.</h1>
            <p className="dash__lead">Pick up where you left off, or start something new.</p>
          </div>
          <Link to="/editor" className="app-btn app-btn--primary app-btn--lg"><span>New story</span><AppArrow /></Link>
        </header>

        <section className="dash__section">
          <h2 className="dash__h2">Start something new</h2>
          <div className="starters">
            {STARTERS.map(([type, k, t, d]) => (
              <Link key={type} to={`/${type}`} className="starter">
                <p className="starter__k"><span>{k}</span><AppArrowAccent /></p>
                <h3 className="starter__t">{t}</h3>
                <p className="starter__d">{d}</p>
              </Link>
            ))}
          </div>
        </section>

        <section className="dash__section">
          <div className="dash__row">
            <h2 className="dash__h2">Your work</h2>
            <input className="dash__search" type="search" placeholder="Search your work" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search your work" />
          </div>
          {shown.length === 0 ? (
            <p className="dash__empty">Nothing here yet. <Link to="/editor">Start a new story</Link>.</p>
          ) : (
            <div className="works">
              {shown.map((p) => (
                <div key={p.id} className="work-wrap">
                <Link to={`/editor/${p.id}`} className="work">
                  {p.type === 'portfolio' && SITE_TEMPLATES[p.template] ? (
                    <div className="work__thumb work__thumb--site" data-tpl={p.template}>
                      <ScaledSite template={p.template} data={projectToSite(p)} base={720} height={200} />
                    </div>
                  ) : p.type === 'case' && CASE_TEMPLATES[p.template] ? (
                    <div className="work__thumb work__thumb--site" data-tpl={p.template}>
                      <ScaledCase template={p.template} data={{ ...projectToCase(p), ghost: false }} height={200} />
                    </div>
                  ) : p.type === 'cv' && CV_TEMPLATES[p.template] ? (
                    <div className="work__thumb work__thumb--site work__thumb--cv" data-tpl={p.template}>
                      <ScaledDoc template={p.template} data={{ ...projectToCv(p), ghost: false }} height={200} />
                    </div>
                  ) : (
                  <div className="work__thumb" data-tpl={TEMPLATES[p.template] ? p.template : 'outline'}>
                    <div className="work__page">
                      <p className="work__k">{FORMATS[p.type].label}</p>
                      <p className="work__pt">{p.title || 'Untitled story'}</p>
                      <span className="work__line" />
                      <span className="work__line" style={{ width: 142.672 }} />
                      <span className="work__line" style={{ width: 111.359 }} />
                      <span className="work__line" />
                      <span className="work__line" style={{ width: 128.75 }} />
                    </div>
                  </div>
                  )}
                  <div className="work__info">
                    <div>
                      <h3 className="work__t">{p.title || 'Untitled story'}</h3>
                      <p className="work__m">{FORMATS[p.type].label} · Edited {timeAgo(p.updatedAt)}</p>
                    </div>
                    <span className={`badge ${p.status === 'Published' ? 'badge--live' : ''}`}>{p.status}</span>
                  </div>
                </Link>
                  <button type="button" className="work__del" onClick={() => setDoomed(p)} aria-label={`Delete ${p.title || p.name || 'untitled'}`} title="Delete"><TrashIcon /></button>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
      {doomed && <ConfirmDelete project={doomed} onCancel={() => setDoomed(null)} onConfirm={remove} />}
    </div>
  );
}
