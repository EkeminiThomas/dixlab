import { useRef, useState } from 'react';
import { uploadMedia, ACCEPT, MAX_VIDEO_MB } from './media.js';
import { isSignedIn } from '../api.js';

/**
 * Images and videos for one portfolio project. The first item is the
 * project's thumbnail in every template; "Use as cover" moves one to the front.
 */
export default function MediaField({ value = [], onChange, max = 6, label = 'project', mode = 'cover', hint }) {
  const [uploads, setUploads] = useState([]); // [{ id, name, progress }]
  const [error, setError] = useState('');
  const [over, setOver] = useState(false);
  const latest = useRef(value);
  latest.current = value;

  const add = async (files) => {
    setError('');
    const list = [...files];
    const room = max - latest.current.length - uploads.length;
    if (room <= 0) { setError(`You can add up to ${max} images or videos to each ${label}.`); return; }
    const batch = list.slice(0, room).map((f) => ({ id: `${f.name}-${f.size}-${Math.random()}`, file: f, name: f.name, progress: 0 }));
    if (list.length > room) setError(`Only ${room} more fit, so the rest were skipped.`);
    setUploads((u) => [...u, ...batch]);
    await Promise.all(batch.map(async (b) => {
      try {
        const media = await uploadMedia(b.file, (p) => setUploads((u) => u.map((x) => (x.id === b.id ? { ...x, progress: p } : x))));
        onChange([...latest.current, { ...media, caption: '' }]);
      } catch (e) {
        setError(e.message || `Couldn’t upload “${b.name}”.`);
      } finally {
        setUploads((u) => u.filter((x) => x.id !== b.id));
      }
    }));
  };

  const set = (i, patch) => onChange(value.map((m, j) => (j === i ? { ...m, ...patch } : m)));
  const remove = (i) => onChange(value.filter((_, j) => j !== i));
  const cover = (i) => onChange([value[i], ...value.filter((_, j) => j !== i)]);
  const move = (i, dir) => {
    const next = [...value];
    [next[i], next[i + dir]] = [next[i + dir], next[i]];
    onChange(next);
  };

  return (
    <div className="mf">
      {(value.length > 0 || uploads.length > 0) && (
        <ul className="mf__grid">
          {value.map((m, i) => (
            <li key={`${m.src.slice(-24)}-${i}`} className={`mf__item ${mode === 'cover' && i === 0 ? 'is-cover' : ''}`}>
              <div className="mf__thumb">
                {m.type === 'video'
                  ? <video src={`${m.src}#t=0.1`} muted playsInline preload="metadata" />
                  : <img src={m.src} alt="" />}
                {mode === 'cover' && i === 0 && <span className="mf__badge">Cover</span>}
                {m.type === 'video' && <span className="mf__kind" aria-label="Video">▶</span>}
              </div>
              <input className="field__input" value={m.caption || ''} onChange={(e) => set(i, { caption: e.target.value })} placeholder="Caption (optional)" aria-label={`Caption for item ${i + 1}`} />
              <div className="up__tools">
                {mode === 'cover' && i > 0 && <button type="button" onClick={() => cover(i)}>Use as cover</button>}
                {mode === 'order' && <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move earlier">←</button>}
                {mode === 'order' && <button type="button" onClick={() => move(i, 1)} disabled={i === value.length - 1} aria-label="Move later">→</button>}
                <button type="button" onClick={() => remove(i)} aria-label={`Remove item ${i + 1}`}>Remove</button>
              </div>
            </li>
          ))}
          {uploads.map((u) => (
            <li key={u.id} className="mf__item is-loading" aria-live="polite">
              <div className="mf__thumb"><span className="mf__name">{u.name}</span></div>
              <div className="mf__bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(u.progress * 100)}><i style={{ width: `${Math.max(4, u.progress * 100)}%` }} /></div>
            </li>
          ))}
        </ul>
      )}
      {value.length + uploads.length < max && (
        <label
          className={`up__drop up__drop--sm ${over ? 'is-over' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); add(e.dataTransfer.files); }}
        >
          <input type="file" accept={ACCEPT} multiple hidden onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
          <span className="up__icon" aria-hidden>+</span>
          <b>{mode === 'single' ? 'Drop an image or video, or click to browse' : 'Add images or videos'}</b>
          <small>{hint || 'Screens, photos, GIFs or clips. The first one is the thumbnail.'} {isSignedIn() ? `Videos: MP4, WebM or MOV up to ${MAX_VIDEO_MB} MB.` : 'Images are kept in this browser; log in to upload videos.'}</small>
        </label>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  );
}
