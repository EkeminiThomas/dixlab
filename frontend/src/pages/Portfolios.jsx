import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { img } from '../assets.js';
import { Icon, AppArrow, TEMPLATES, useProjects, createProject, timeAgo, useAmbient, deleteProject, ConfirmDelete, TrashIcon } from '../components/ui.jsx';
import DashSide from '../components/DashSide.jsx';
import { ScaledSite, SITE_TEMPLATES, NICHES, nicheLabels } from '../components/sites/index.jsx';
import TemplateViewer from '../components/sites/Viewer.jsx';
import { projectToSite } from '../components/sites/shared.jsx';

/* The portfolio "dashboard": a collection of site templates to choose from,
   plus the portfolios you've already started. */
export default function Portfolios() {
  const nav = useNavigate();
  const [niche, setNiche] = useState('all');
  const [preview, setPreview] = useState(null);
  useAmbient();

  const [doomed, setDoomed] = useState(null);
  const all = useProjects();
  const mine = useMemo(
    () => all.filter((p) => p.type === 'portfolio').sort((a, b) => b.updatedAt - a.updatedAt),
    [all]
  );
  const remove = () => { deleteProject(doomed.id); setDoomed(null); };
  const list = Object.entries(SITE_TEMPLATES).filter(([, t]) => niche === 'all' || t.niches.includes(niche));
  const nicheInfo = NICHES.find((n) => n.id === niche);

  const use = (key) => {
    const p = createProject('portfolio', key);
    nav(`/editor/${p.id}`);
  };
  const interview = () => {
    const p = createProject('portfolio', 'folio');
    nav(`/interview/${p.id}`);
  };

  return (
    <div className="dash">
      <DashSide active="portfolio" />

      <main className="dash__main">
        <header className="dash__head">
          <div>
            <p className="section-label"><Icon src={img.markerApp} size={6} /><span>Portfolio templates</span></p>
            <h1 className="dash__title">Pick a look. Make it yours.</h1>
            <p className="dash__lead">Every template uses the same details: your projects, experience and skills. Switch any time without retyping a thing.</p>
          </div>
          <span className="ptpl__count">{Object.keys(SITE_TEMPLATES).length} templates</span>
        </header>

        <section className="intv-cta">
          <div className="intv-cta__text">
            <p className="intv-cta__k">About 10 minutes · type or talk</p>
            <h2>Tell us what you do. We’ll build the page.</h2>
            <p>Answer a few questions about what you do and the projects you’re proud of. We write your portfolio in your own words; then you add images and videos to each project and publish it as a link.</p>
          </div>
          <ol className="intv-cta__steps" aria-label="How it works">
            <li><b>1</b>Talk through your work and projects</li>
            <li><b>2</b>Add images and videos to each project</li>
            <li><b>3</b>Pick a look, publish, send the link</li>
          </ol>
          <button className="app-btn app-btn--primary app-btn--lg" onClick={interview}><span>Start the interview</span><AppArrow /></button>
        </section>

        <h2 className="dash__h2 ptpl__or">Or start from a template</h2>
        <div className="ptpl__filter">
          <p className="ptpl__filter-k">What do you do?</p>
          <div className="ptpl__niches" role="tablist" aria-label="Filter templates by field">
            <button role="tab" aria-selected={niche === 'all'} className={`ptpl__niche ${niche === 'all' ? 'is-active' : ''}`} onClick={() => setNiche('all')}>All fields</button>
            {NICHES.map((n) => (
              <button key={n.id} role="tab" aria-selected={niche === n.id} className={`ptpl__niche ${niche === n.id ? 'is-active' : ''}`} onClick={() => setNiche(n.id)}>{n.label}</button>
            ))}
          </div>
          {nicheInfo && <p className="ptpl__careers"><span>Made for</span> {nicheInfo.careers} · {list.length} template{list.length === 1 ? '' : 's'}</p>}
        </div>

        <div className="ptpls">
          {list.map(([key, t]) => (
            <article key={key} className="ptpl">
              <button className="ptpl__frame" onClick={() => setPreview(key)} aria-label={`Preview the ${t.name} template`}>
                <ScaledSite template={key} data={t.sample} base={760} height={400} />
                <span className="ptpl__hint">Click to preview</span>
              </button>
              <div className="ptpl__info">
                <div className="ptpl__text">
                  <div className="ptpl__title"><h3>{t.name}</h3><span>{t.desc}</span></div>
                  <p>{t.blurb}</p>
                  <p className="ptpl__best"><span>Best for</span> {nicheLabels(t.niches).join(' · ')}</p>
                  <ul className="ptpl__tags">{t.tags.map((g) => <li key={g} className={g === 'New' ? 'is-new' : ''}>{g}</li>)}</ul>
                </div>
                <div className="ptpl__actions">
                  <button className="app-btn app-btn--ghost" onClick={() => setPreview(key)}>Preview</button>
                  <button className="app-btn app-btn--primary" onClick={() => use(key)}><span>Use template</span><AppArrow /></button>
                </div>
              </div>
            </article>
          ))}
        </div>

        <section className="dash__section">
          <div className="dash__row">
            <h2 className="dash__h2">Your portfolios</h2>
            {mine.length > 0 && <span className="ptpl__count">{mine.length} saved</span>}
          </div>
          {mine.length === 0 ? (
            <p className="dash__empty">You haven’t started a portfolio yet. Pick a template above to begin.</p>
          ) : (
            <div className="works">
              {mine.map((p) => (
                <div key={p.id} className="work-wrap">
                <Link to={`/editor/${p.id}`} className="work">
                  <div className={`work__thumb ${SITE_TEMPLATES[p.template] ? 'work__thumb--site' : ''}`} data-tpl={p.template}>
                    {SITE_TEMPLATES[p.template]
                      ? <ScaledSite template={p.template} data={projectToSite(p)} base={720} height={200} />
                      : <div className="work__page"><p className="work__k">Portfolio</p><p className="work__pt">{p.title || 'Untitled story'}</p><span className="work__line" /><span className="work__line" style={{ width: 120 }} /></div>}
                  </div>
                  <div className="work__info">
                    <div>
                      <h3 className="work__t">{p.title || p.name || 'Untitled portfolio'}</h3>
                      <p className="work__m">{TEMPLATES[p.template]?.name || 'Portfolio'} · Edited {timeAgo(p.updatedAt)}</p>
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

      {preview && (
        <TemplateViewer
          template={preview}
          data={SITE_TEMPLATES[preview].sample}
          onClose={() => setPreview(null)}
          onStep={(dir) => {
            const keys = Object.keys(SITE_TEMPLATES);
            setPreview(keys[(keys.indexOf(preview) + dir + keys.length) % keys.length]);
          }}
          actions={<button className="app-btn app-btn--primary" onClick={() => use(preview)}><span>Use this template</span><AppArrow /></button>}
        />
      )}
    </div>
  );
}
