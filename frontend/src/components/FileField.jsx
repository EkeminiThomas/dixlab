import { useRef, useState } from 'react';
import { uploadAttachment, FILE_ACCEPT, FILE_TYPES, MAX_FILE_MB, fileExt, fileSize } from './media.js';
import { isSignedIn } from '../api.js';

/** Case study attachments: PDFs, Word, PowerPoint and Excel files. */
export default function FileField({ value = [], onChange, max = 8 }) {
  const [uploads, setUploads] = useState([]); // [{ id, name, progress }]
  const [error, setError] = useState('');
  const [over, setOver] = useState(false);
  const latest = useRef(value);
  latest.current = value;
  const signedIn = isSignedIn();

  const add = async (files) => {
    setError('');
    const list = [...files];
    const room = max - latest.current.length - uploads.length;
    if (room <= 0) { setError(`You can attach up to ${max} files.`); return; }
    if (list.length > room) setError(`Only ${room} more fit, so the rest were skipped.`);
    const batch = list.slice(0, room).map((f) => ({ id: `${f.name}-${f.size}-${Math.random()}`, file: f, name: f.name, progress: 0 }));
    setUploads((u) => [...u, ...batch]);
    await Promise.all(batch.map(async (b) => {
      try {
        const item = await uploadAttachment(b.file, (p) => setUploads((u) => u.map((x) => (x.id === b.id ? { ...x, progress: p } : x))));
        onChange([...latest.current, item]);
      } catch (e) {
        setError(e.message || `Couldn’t upload “${b.name}”.`);
      } finally {
        setUploads((u) => u.filter((x) => x.id !== b.id));
      }
    }));
  };

  const rename = (i, name) => onChange(value.map((f, j) => (j === i ? { ...f, name } : f)));
  const remove = (i) => onChange(value.filter((_, j) => j !== i));

  return (
    <div className="ff">
      {(value.length > 0 || uploads.length > 0) && (
        <ul className="ff__list">
          {value.map((f, i) => {
            const ext = fileExt(f.src);
            return (
              <li key={`${f.src}-${i}`} className="ff__row">
                <span className={`ff__ext ff__ext--${ext}`}>{FILE_TYPES[ext] || ext.toUpperCase()}</span>
                <input className="field__input ff__name" value={f.name || ''} onChange={(e) => rename(i, e.target.value)} aria-label={`Name shown for file ${i + 1}`} />
                <span className="ff__size">{fileSize(f.size)}</span>
                <a className="ff__open" href={f.src} target="_blank" rel="noreferrer">Open</a>
                <button type="button" className="ed__remove" onClick={() => remove(i)} aria-label={`Remove ${f.name || 'file'}`}>Remove</button>
              </li>
            );
          })}
          {uploads.map((u) => (
            <li key={u.id} className="ff__row is-loading" aria-live="polite">
              <span className="ff__ext">…</span>
              <span className="ff__name ff__name--static">{u.name}</span>
              <div className="mf__bar ff__bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(u.progress * 100)}><i style={{ width: `${Math.max(4, u.progress * 100)}%` }} /></div>
            </li>
          ))}
        </ul>
      )}
      {value.length + uploads.length < max && (
        signedIn ? (
          <label
            className={`up__drop up__drop--sm ${over ? 'is-over' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setOver(true); }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); add(e.dataTransfer.files); }}
          >
            <input type="file" accept={FILE_ACCEPT} multiple hidden onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
            <span className="up__icon" aria-hidden>+</span>
            <b>Attach files</b>
            <small>PDF, Word, PowerPoint or Excel, up to {MAX_FILE_MB} MB each.</small>
          </label>
        ) : (
          <p className="ff__login">Log in to attach files. They’re stored in your account, not in this browser.</p>
        )
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  );
}
