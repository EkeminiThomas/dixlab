import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { img } from '../assets.js';
import { Icon, AppArrow, TEMPLATES, useProjects, createProject, timeAgo, useAmbient, deleteProject, ConfirmDelete, TrashIcon } from '../components/ui.jsx';
import DashSide from '../components/DashSide.jsx';
import { ScaledCase, CasePreview, CASE_TEMPLATES, CASE_NICHES, caseNicheLabels } from '../components/case/index.jsx';
import { projectToCase } from '../components/case/data.js';
import TemplateViewer from '../components/sites/Viewer.jsx';

/* The case study "dashboard": templates to choose from, plus the case
   studies you've already started. Mirrors the portfolio and CV pages. */
export default function CaseStudies() {
  const nav = useNavigate();
  const [niche, setNiche] = useState('all');
  const [preview, setPreview] = useState(null);
  const [doomed, setDoomed] = useState(null);
  useAmbient();

  const all = useProjects();
  const mine = useMemo(
    () => all.filter((p) => p.type === 'case').sort((a, b) => b.updatedAt - a.updatedAt),
    [all]
  );
  const list = Object.entries(CASE_TEMPLATES).filter(([, t]) => niche === 'all' || t.niches.includes(niche));
  const nicheInfo = CASE_NICHES.find((n) => n.id === niche);
  const remove = () => { deleteProject(doomed.id); setDoomed(null); };

  const use = (key) => {
    const p = createProject('case', key);
    nav(`/editor/${p.id}`);
  };
  const interview = () => {
    const p = createProject('case', 'snapshot');
    nav(`/interview/${p.id}`);
  };

  return (
    <div className="dash">
      <DashSide active="case" />

      <main className="dash__main">
        <header className="dash__head">
          <div>
            <p className="section-label"><Icon src={img.markerApp} size={6} /><span>Case study templates</span></p>
            <h1 className="dash__title">Show how you think.</h1>
            <p className="dash__lead">The hard part of a case study isn’t the layout. It’s getting the thinking out of your head. So we start with a conversation.</p>
          </div>
          <span className="ptpl__count">{Object.keys(CASE_TEMPLATES).length} templates</span>
        </header>

        <section className="intv-cta">
          <div className="intv-cta__text">
            <p className="intv-cta__k">About 10 minutes · type or talk</p>
            <h2>Talk it through. We’ll write it up.</h2>
            <p>Answer a few questions about one project. We dig into the parts that matter (what was wrong, what you tried, what you cut, what changed) and draft a case study in your own words. Then publish it as a link.</p>
          </div>
          <ol className="intv-cta__steps" aria-label="How it works">
            <li><b>1</b>Answer questions, one at a time</li>
            <li><b>2</b>Check the draft sounds like you</li>
            <li><b>3</b>Publish and send the link</li>
          </ol>
          <button className="app-btn app-btn--primary app-btn--lg" onClick={interview}><span>Start the interview</span><AppArrow /></button>
        </section>

        <h2 className="dash__h2 ptpl__or">Or start from a template</h2>
        <div className="ptpl__filter">
          <p className="ptpl__filter-k">What do you do?</p>
          <div className="ptpl__niches" role="tablist" aria-label="Filter templates by field">
            <button role="tab" aria-selected={niche === 'all'} className={`ptpl__niche ${niche === 'all' ? 'is-active' : ''}`} onClick={() => setNiche('all')}>All fields</button>
            {CASE_NICHES.map((n) => (
              <button key={n.id} role="tab" aria-selected={niche === n.id} className={`ptpl__niche ${niche === n.id ? 'is-active' : ''}`} onClick={() => setNiche(n.id)}>{n.label}</button>
            ))}
          </div>
          {nicheInfo && <p className="ptpl__careers"><span>Made for</span> {nicheInfo.careers} · {list.length} template{list.length === 1 ? '' : 's'}</p>}
        </div>

        <div className="ptpls">
          {list.map(([key, t]) => (
            <article key={key} className="ptpl">
              <button className="ptpl__frame" onClick={() => setPreview(key)} aria-label={`Preview the ${t.name} case study template`}>
                <ScaledCase template={key} data={t.sample} height={420} />
                <span className="ptpl__hint">Click to preview</span>
              </button>
              <div className="ptpl__info">
                <div className="ptpl__text">
                  <div className="ptpl__title"><h3>{t.name}</h3><span>{t.desc}</span></div>
                  <p>{t.blurb}</p>
                  <p className="ptpl__best"><span>Best for</span> {caseNicheLabels(t.niches).join(' · ')}</p>
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
            <h2 className="dash__h2">Your case studies</h2>
            {mine.length > 0 && <span className="ptpl__count">{mine.length} saved</span>}
          </div>
          {mine.length === 0 ? (
            <p className="dash__empty">You haven’t started a case study yet. Pick a template above to begin.</p>
          ) : (
            <div className="works">
              {mine.map((p) => (
                <div key={p.id} className="work-wrap">
                  <Link to={`/editor/${p.id}`} className="work">
                    <div className={`work__thumb ${CASE_TEMPLATES[p.template] ? 'work__thumb--site' : ''}`} data-tpl={p.template}>
                      {CASE_TEMPLATES[p.template]
                        ? <ScaledCase template={p.template} data={{ ...projectToCase(p), ghost: false }} height={200} />
                        : <div className="work__page"><p className="work__k">Case study</p><p className="work__pt">{p.title || 'Untitled case study'}</p><span className="work__line" /><span className="work__line" style={{ width: 120 }} /></div>}
                    </div>
                    <div className="work__info">
                      <div>
                        <h3 className="work__t">{p.title || 'Untitled case study'}</h3>
                        <p className="work__m">{TEMPLATES[p.template]?.name || 'Case study'} · Edited {timeAgo(p.updatedAt)}</p>
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
          info={CASE_TEMPLATES[preview]}
          render={() => <CasePreview template={preview} data={CASE_TEMPLATES[preview].sample} />}
          onClose={() => setPreview(null)}
          onStep={(dir) => {
            const keys = Object.keys(CASE_TEMPLATES);
            setPreview(keys[(keys.indexOf(preview) + dir + keys.length) % keys.length]);
          }}
          actions={<button className="app-btn app-btn--primary" onClick={() => use(preview)}><span>Use this template</span><AppArrow /></button>}
        />
      )}
    </div>
  );
}
