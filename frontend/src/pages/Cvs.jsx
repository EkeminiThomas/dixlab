import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { img } from '../assets.js';
import { Icon, AppArrow, TEMPLATES, useProjects, createProject, timeAgo, useAmbient, deleteProject, ConfirmDelete, TrashIcon } from '../components/ui.jsx';
import DashSide from '../components/DashSide.jsx';
import { ScaledDoc, CV_TEMPLATES, CV_NICHES, cvNicheLabels } from '../components/cv/index.jsx';
import { projectToCv } from '../components/cv/data.js';
import CvViewer from '../components/cv/CvViewer.jsx';

/* The CV "dashboard": professional CV templates to choose from, plus the CVs
   you've already started. Mirrors the portfolio templates page. */
export default function Cvs() {
  const nav = useNavigate();
  const [niche, setNiche] = useState('all');
  const [preview, setPreview] = useState(null);
  const [doomed, setDoomed] = useState(null);
  useAmbient();

  const all = useProjects();
  const mine = useMemo(
    () => all.filter((p) => p.type === 'cv').sort((a, b) => b.updatedAt - a.updatedAt),
    [all]
  );
  const list = Object.entries(CV_TEMPLATES).filter(([, t]) => niche === 'all' || t.niches.includes(niche));
  const nicheInfo = CV_NICHES.find((n) => n.id === niche);
  const remove = () => { deleteProject(doomed.id); setDoomed(null); };

  const use = (key) => {
    const p = createProject('cv', key);
    nav(`/editor/${p.id}`);
  };

  return (
    <div className="dash">
      <DashSide active="cv" />

      <main className="dash__main">
        <header className="dash__head">
          <div>
            <p className="section-label"><Icon src={img.markerApp} size={6} /><span>CV templates</span></p>
            <h1 className="dash__title">A CV that gets read.</h1>
            <p className="dash__lead">Professional, print-ready A4 layouts. Fill in your details once, then switch templates freely and export to PDF.</p>
          </div>
          <span className="ptpl__count">{Object.keys(CV_TEMPLATES).length} templates</span>
        </header>

        <div className="ptpl__filter">
          <p className="ptpl__filter-k">What do you do?</p>
          <div className="ptpl__niches" role="tablist" aria-label="Filter templates by field">
            <button role="tab" aria-selected={niche === 'all'} className={`ptpl__niche ${niche === 'all' ? 'is-active' : ''}`} onClick={() => setNiche('all')}>All fields</button>
            {CV_NICHES.map((n) => (
              <button key={n.id} role="tab" aria-selected={niche === n.id} className={`ptpl__niche ${niche === n.id ? 'is-active' : ''}`} onClick={() => setNiche(n.id)}>{n.label}</button>
            ))}
          </div>
          {nicheInfo && <p className="ptpl__careers"><span>Made for</span> {nicheInfo.careers} · {list.length} template{list.length === 1 ? '' : 's'}</p>}
        </div>

        <div className="ptpls ptpls--cv">
          {list.map(([key, t]) => (
            <article key={key} className="ptpl">
              <button className="ptpl__frame ptpl__frame--cv" onClick={() => setPreview(key)} aria-label={`Preview the ${t.name} CV template`}>
                <ScaledDoc template={key} data={t.sample} height={420} />
                <span className="ptpl__hint">Click to preview</span>
              </button>
              <div className="ptpl__info">
                <div className="ptpl__text">
                  <div className="ptpl__title"><h3>{t.name}</h3><span>{t.desc}</span></div>
                  <p>{t.blurb}</p>
                  <p className="ptpl__best"><span>Best for</span> {cvNicheLabels(t.niches).join(' · ')}</p>
                  <ul className="ptpl__tags">{t.tags.map((g) => <li key={g} className={g === 'New' ? 'is-new' : g === 'ATS-friendly' ? 'is-ats' : ''}>{g}</li>)}</ul>
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
            <h2 className="dash__h2">Your CVs</h2>
            {mine.length > 0 && <span className="ptpl__count">{mine.length} saved</span>}
          </div>
          {mine.length === 0 ? (
            <p className="dash__empty">You haven’t started a CV yet. Pick a template above to begin.</p>
          ) : (
            <div className="works">
              {mine.map((p) => (
                <div key={p.id} className="work-wrap">
                  <Link to={`/editor/${p.id}`} className="work">
                    <div className={`work__thumb ${CV_TEMPLATES[p.template] ? 'work__thumb--site work__thumb--cv' : ''}`} data-tpl={p.template}>
                      {CV_TEMPLATES[p.template]
                        ? <ScaledDoc template={p.template} data={{ ...projectToCv(p), ghost: false }} height={200} />
                        : <div className="work__page"><p className="work__k">CV</p><p className="work__pt">{p.title || 'Untitled CV'}</p><span className="work__line" /><span className="work__line" style={{ width: 120 }} /></div>}
                    </div>
                    <div className="work__info">
                      <div>
                        <h3 className="work__t">{p.title || p.name || 'Untitled CV'}</h3>
                        <p className="work__m">{TEMPLATES[p.template]?.name || 'CV'} · Edited {timeAgo(p.updatedAt)}</p>
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
        <CvViewer
          template={preview}
          data={CV_TEMPLATES[preview].sample}
          onClose={() => setPreview(null)}
          onStep={(dir) => {
            const keys = Object.keys(CV_TEMPLATES);
            setPreview(keys[(keys.indexOf(preview) + dir + keys.length) % keys.length]);
          }}
          actions={<button className="app-btn app-btn--primary" onClick={() => use(preview)}><span>Use this template</span><AppArrow /></button>}
        />
      )}
    </div>
  );
}
