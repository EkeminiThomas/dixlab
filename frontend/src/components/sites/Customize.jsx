import { useRef, useState } from 'react';
import { AppSparkles15, AppSparkles13, TEMPLATES } from '../ui.jsx';
import { SITE_TEMPLATES } from './index.jsx';
import { FONT_PAIRS, ACCENTS, MOTIONS, SPEEDS, DEPTHS, TILTS, FLOATS, BG_PLACES, BG_STRENGTHS, safeBg, isBranded } from './brand.js';
import { uploadBackground, MAX_IMAGE_MB } from '../media.js';
import { interpretPrompt, PROMPT_IDEAS, CV_PROMPT_IDEAS, CASE_PROMPT_IDEAS, THREE_PROMPT_IDEAS } from './promptCustomize.js';
import { CV_SIZES } from '../cv/index.jsx';

/**
 * The "Customize" tab: branding layered over the template's defaults.
 * Nothing here changes the template itself, so "Reset" always gets you back.
 */
export default function Customize({ project, onPatch, template, kind = 'site' }) {
  const brand = project.brand || {};
  const onChange = (b) => onPatch({ brand: b });
  const isDoc = kind === 'cv';
  const t = SITE_TEMPLATES[template] || TEMPLATES[template];
  const size = CV_SIZES[brand.size] ? brand.size : 'normal';
  const set = (k, v) => onChange({ ...brand, [k]: v });
  const font = FONT_PAIRS[brand.font] ? brand.font : 'default';
  const motion = MOTIONS[brand.motion] ? brand.motion : 'none';
  const speed = SPEEDS[brand.speed] ? brand.speed : 'normal';
  const is3d = Boolean(t?.three || TEMPLATES[template]?.three);
  const depth = DEPTHS[brand.depth] ? brand.depth : 'normal';
  const tilt = brand.tilt === 'off' ? 'off' : 'pointer';
  const float = brand.float === 'off' ? 'off' : 'on';

  return (
    <>
      <div>
        <p className="section-label"><AppSparkles15 /><span>Customize</span></p>
        <h2 className="ed__h2">Make {t?.name || 'your template'} unmistakably yours.</h2>
      </div>
      <p className="ed__lead">The template’s defaults stay in place. Describe a change in your own words, or fine-tune each setting below.{isDoc ? ' Your CV stays print-ready A4.' : ''}</p>
      <PromptPanel project={project} template={template} onPatch={onPatch} kind={kind} />

      <fieldset className="ed__set">
        <legend>Fonts</legend>
        <div className="cz__fonts">
          {Object.entries(FONT_PAIRS).map(([k, f]) => (
            <button key={k} type="button" className={`cz__font ${font === k ? 'is-active' : ''}`} aria-pressed={font === k} onClick={() => set('font', k)}>
              <span className="cz__aa" style={{ fontFamily: f.head || undefined }}>Aa</span>
              <span className="cz__fname">{f.label}</span>
              <span className="cz__fmeta">{f.head ? f.head.split(',')[0].replace(/'/g, '') : 'As designed'}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="ed__set">
        <legend>Colour theme</legend>
        <div className="cz__swatches">
          <button type="button" className={`cz__swatch cz__swatch--default ${!brand.accent ? 'is-active' : ''}`} aria-pressed={!brand.accent} onClick={() => set('accent', null)} title="Template default">
            <span className="sr-only">Template default</span>
          </button>
          {ACCENTS.map(([hex, name]) => (
            <button key={hex} type="button" className={`cz__swatch ${brand.accent === hex ? 'is-active' : ''}`} style={{ '--sw': hex }} aria-pressed={brand.accent === hex} onClick={() => set('accent', hex)} title={name}>
              <span className="sr-only">{name}</span>
            </button>
          ))}
          <label className={`cz__custom ${brand.accent && !ACCENTS.some(([h]) => h === brand.accent) ? 'is-active' : ''}`} title="Pick any colour">
            <input type="color" value={brand.accent || '#5144e8'} onChange={(e) => set('accent', e.target.value)} aria-label="Custom accent colour" />
            <span>Custom</span>
          </label>
        </div>
        <small className="field__hint">Used for highlights, buttons and key blocks. Text on coloured blocks switches to black or white for contrast.</small>
      </fieldset>

      {kind === 'site' && SITE_TEMPLATES[template] && <BackgroundField brand={brand} set={set} onChange={onChange} />}

      {isDoc && (
        <fieldset className="ed__set">
          <legend>Text size</legend>
          <div className="pills">
            {Object.entries(CV_SIZES).map(([k, [label]]) => (
              <button key={k} type="button" className={`pill-btn ${size === k ? 'is-active' : ''}`} aria-pressed={size === k} onClick={() => set('size', k)}>{label}</button>
            ))}
          </div>
          <small className="field__hint">Compact helps a longer CV fit on fewer pages. Page breaks show in the full-screen preview.</small>
        </fieldset>
      )}

      {is3d && (
        <fieldset className="ed__set cz__3d">
          <legend>3D effects</legend>
          <div className="cz__depths" role="group" aria-label="Depth">
            {Object.entries(DEPTHS).map(([k, [label, amount]]) => (
              <button key={k} type="button" className={`cz__depth ${depth === k ? 'is-active' : ''}`} aria-pressed={depth === k} onClick={() => set('depth', k)}>
                <span className="cz__depth-demo" style={{ '--d': amount }} aria-hidden><i /><i /></span>
                <span>{label}</span>
              </button>
            ))}
          </div>
          <small className="field__hint">How far things tilt and how deep layers sit. Flat keeps the layout but turns the 3D off.</small>

          <div className="cz__3d-row">
            <span className="cz__3d-label">Pointer tilt</span>
            <div className="pills">
              {Object.entries(TILTS).map(([k, label]) => (
                <button key={k} type="button" className={`pill-btn ${tilt === k ? 'is-active' : ''}`} aria-pressed={tilt === k} onClick={() => set('tilt', k)} disabled={depth === 'flat'}>{label}</button>
              ))}
            </div>
          </div>
          <div className="cz__3d-row">
            <span className="cz__3d-label">Floating</span>
            <div className="pills">
              {Object.entries(FLOATS).map(([k, label]) => (
                <button key={k} type="button" className={`pill-btn ${float === k ? 'is-active' : ''}`} aria-pressed={float === k} onClick={() => set('float', k)}>{label}</button>
              ))}
            </div>
          </div>
          <small className="field__hint">The hero leans toward the visitor’s pointer, and small blocks drift gently. People who ask their device for less motion always see a still page.</small>
        </fieldset>
      )}

      {!isDoc && <>
      <fieldset className="ed__set">
        <legend>Animation direction</legend>
        <div className="cz__motions">
          {Object.entries(MOTIONS).map(([k, m]) => (
            <button key={k} type="button" className={`cz__motion ${motion === k ? 'is-active' : ''}`} aria-pressed={motion === k} onClick={() => onChange({ ...brand, motion: k, replay: (brand.replay || 0) + 1 })}>
              <span className={`cz__demo cz__demo--${k}`} aria-hidden><i /></span>
              <span>{m.label}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="ed__set" disabled={motion === 'none'}>
        <legend>Animation speed</legend>
        <div className="cz__speed">
          <div className="pills">
            {Object.entries(SPEEDS).map(([k, [label]]) => (
              <button key={k} type="button" className={`pill-btn ${speed === k ? 'is-active' : ''}`} aria-pressed={speed === k} onClick={() => onChange({ ...brand, speed: k, replay: (brand.replay || 0) + 1 })}>{label}</button>
            ))}
          </div>
          <button type="button" className="ed__add" onClick={() => set('replay', (brand.replay || 0) + 1)}>↻ Replay</button>
        </div>
        {motion === 'none' && <small className="field__hint">Pick a direction above to animate sections as they appear.</small>}
      </fieldset>
      </>}

      {(isBranded(brand) || (isDoc && size !== 'normal')) && (
        <button type="button" className="ed__browse cz__reset" onClick={() => onChange({})}>Reset to template defaults</button>
      )}
    </>
  );
}

/* ---------- Background image (portfolios) ---------- */

function BackgroundField({ brand, set, onChange }) {
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [over, setOver] = useState(false);
  const src = safeBg(brand.bgImage);
  const place = BG_PLACES[brand.bgPlace] ? brand.bgPlace : 'hero';
  const strength = BG_STRENGTHS[brand.bgStrength] ? brand.bgStrength : 'medium';

  const pick = async (files) => {
    const file = files?.[0];
    if (!file) return;
    setError(''); setBusy(true);
    try {
      set('bgImage', await uploadBackground(file));
    } catch (e) {
      setError(e.message || 'Couldn’t add that image.');
    } finally {
      setBusy(false);
    }
  };
  const remove = () => {
    const { bgImage, bgPlace, bgStrength, ...rest } = brand; // eslint-disable-line no-unused-vars
    onChange(rest);
  };

  return (
    <fieldset className="ed__set cz__bg">
      <legend>Background image</legend>
      <div className="cz__bg-row">
        <button
          type="button"
          className={`cz__bg-drop ${over ? 'is-over' : ''} ${src ? 'has-image' : ''}`}
          style={src ? { backgroundImage: `url("${src}")` } : undefined}
          onClick={() => input.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files); }}
          disabled={busy}
          aria-label={src ? 'Replace the background image' : 'Add a background image'}
        >
          {busy ? <span className="cz__spin" aria-hidden /> : !src && <span>+ Add an image<small>or drop one here</small></span>}
        </button>
        <div className="cz__bg-actions">
          <button type="button" className="ppf__btn" onClick={() => input.current?.click()} disabled={busy}>
            {busy ? 'Uploading…' : src ? 'Replace image' : 'Upload image'}
          </button>
          {src && !busy && <button type="button" className="ppf__btn ppf__btn--quiet" onClick={remove}>Remove</button>}
          <small className="field__hint">JPG, PNG or WebP up to {MAX_IMAGE_MB} MB. Wide photos or textures work best.</small>
        </div>
      </div>
      {src && <>
        <div className="cz__3d-row">
          <span className="cz__3d-label">Where</span>
          <div className="pills">
            {Object.entries(BG_PLACES).map(([k, label]) => (
              <button key={k} type="button" className={`pill-btn ${place === k ? 'is-active' : ''}`} aria-pressed={place === k} onClick={() => set('bgPlace', k)}>{label}</button>
            ))}
          </div>
        </div>
        <div className="cz__3d-row">
          <span className="cz__3d-label">Strength</span>
          <div className="pills">
            {Object.entries(BG_STRENGTHS).map(([k, [label]]) => (
              <button key={k} type="button" className={`pill-btn ${strength === k ? 'is-active' : ''}`} aria-pressed={strength === k} onClick={() => set('bgStrength', k)}>{label}</button>
            ))}
          </div>
        </div>
        <small className="field__hint">The image is blended into the template’s own background colour, so your text stays readable. Cards and panels keep their colour and sit on top.</small>
      </>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden onChange={(e) => { pick(e.target.files); e.target.value = ''; }} />
    </fieldset>
  );
}

/* ---------- Describe a change: prompt → customisation ---------- */

function PromptPanel({ project, template, onPatch, kind = 'site' }) {
  const isDoc = kind === 'cv';
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [history, setHistory] = useState([]); // newest first

  const snapshot = () => (isDoc ? {
    template: project.template, brand: project.brand || {}, role: project.role || '', notes: project.notes || '',
  } : {
    template: project.template, brand: project.brand || {}, role: project.role || '', tagline: project.tagline || '',
  });

  const run = async (text) => {
    const req = (text ?? prompt).trim();
    if (!req || busy) return;
    setBusy(true);
    setError('');
    const before = snapshot();
    try {
      const current = isDoc
        ? { template, brand: before.brand, role: before.role, summary: before.notes }
        : { template, brand: before.brand, role: before.role, tagline: before.tagline };
      const { changes = {}, summary, source } = await interpretPrompt(req, current, kind);
      const patch = { ...changes };
      if (changes.brand) patch.brand = { ...before.brand, ...changes.brand, replay: (before.brand.replay || 0) + 1 };
      const changed = Object.keys(patch).length > 0;
      if (changed) onPatch(patch);
      setHistory((h) => [{ id: Date.now(), prompt: req, summary, source, before, changed }, ...h].slice(0, 8));
      setPrompt('');
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const undo = (item) => {
    onPatch({ ...item.before, brand: { ...item.before.brand, replay: (project.brand?.replay || 0) + 1 } });
    setHistory((h) => h.filter((x) => x.id !== item.id));
  };

  return (
    <section className="cz__ai" aria-label="Describe a change">
      <div className="cz__ai-head">
        <span className="cz__ai-icon"><AppSparkles13 /></span>
        <div>
          <p className="cz__ai-t">Describe a change</p>
          <p className="cz__ai-d">{isDoc ? 'Colours, fonts, text size, template, headline or summary, in plain words.' : 'Colours, fonts, animation, template or wording, in plain words.'}</p>
        </div>
      </div>

      <form className="cz__ai-box" onSubmit={(e) => { e.preventDefault(); run(); }}>
        <textarea
          className="cz__ai-input"
          rows={2}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); run(); } }}
          placeholder={isDoc ? 'e.g. Make it look more senior with a navy accent and serif headings, and fit it on one page' : 'e.g. Make it feel premium with a deep navy accent, serif headings and a slow fade from the left'}
          aria-label={`Describe how you want to change your ${isDoc ? 'CV' : kind === 'case' ? 'case study' : 'portfolio'}`}
          maxLength={1500}
          disabled={busy}
        />
        <div className="cz__ai-bar">
          <span className="cz__ai-hint">Enter to apply · Shift+Enter for a new line</span>
          <button type="submit" className="app-btn app-btn--primary cz__ai-go" disabled={busy || !prompt.trim()}>
            {busy ? <><span className="cz__spin" aria-hidden /> Applying…</> : 'Apply'}
          </button>
        </div>
      </form>

      {error && <p className="form-error" role="alert">{error}</p>}

      {history.length === 0 ? (
        <div className="cz__ideas">
          {(isDoc ? CV_PROMPT_IDEAS : TEMPLATES[template]?.three ? THREE_PROMPT_IDEAS : kind === 'case' ? CASE_PROMPT_IDEAS : PROMPT_IDEAS).map((idea) => (
            <button key={idea} type="button" className="cz__idea" onClick={() => run(idea)} disabled={busy}>{idea}</button>
          ))}
        </div>
      ) : (
        <ol className="cz__log" aria-live="polite">
          {history.map((h, i) => (
            <li key={h.id} className={i === 0 ? 'is-latest' : ''}>
              <p className="cz__log-q">“{h.prompt}”</p>
              <p className="cz__log-a">
                <span className={`cz__src cz__src--${h.source}`}>{h.source === 'ai' ? 'AI' : 'Quick match'}</span>
                {h.summary}
              </p>
              {i === 0 && h.changed && <button type="button" className="cz__undo" onClick={() => undo(h)}>Undo</button>}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
