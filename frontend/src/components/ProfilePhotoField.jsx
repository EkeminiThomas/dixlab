import { useRef, useState } from 'react';
import { uploadProfilePhoto, MAX_IMAGE_MB } from './media.js';
import { initials } from './ui.jsx';
import { isSignedIn } from '../api.js';

/** The portfolio's profile photo: shown in the hero of every template. */
export default function ProfilePhotoField({ value, onChange, name, siteTemplate = true }) {
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [over, setOver] = useState(false);

  const pick = async (files) => {
    const file = files?.[0];
    if (!file) return;
    setError(''); setBusy(true);
    try {
      onChange(await uploadProfilePhoto(file));
    } catch (e) {
      setError(e.message || 'Couldn’t add that photo.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ppf">
      <button
        type="button"
        className={`ppf__ring ${over ? 'is-over' : ''} ${value ? 'has-photo' : ''}`}
        onClick={() => input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files); }}
        aria-label={value ? 'Change profile photo' : 'Add a profile photo'}
        disabled={busy}
      >
        {value ? <img src={value} alt="" /> : <span className="ppf__mono">{initials(name || 'You')}</span>}
        <span className="ppf__cam" aria-hidden>{busy ? <i className="cz__spin" /> : '+'}</span>
      </button>
      <div className="ppf__text">
        <span className="field__label">Profile photo <em className="field__opt">optional</em></span>
        <small className="field__hint">
          A clear, friendly headshot works best. It’s cropped to a square and shown on your portfolio.
          {' '}JPG, PNG or WebP up to {MAX_IMAGE_MB} MB.{!isSignedIn() && ' Log in to save it to your account.'}
          {!siteTemplate && ' It shows on the portfolio templates (Folio, Bento, Casebook and the rest), so pick one in “Make it yours”.'}
        </small>
        <div className="ppf__actions">
          <button type="button" className="ppf__btn" onClick={() => input.current?.click()} disabled={busy}>
            {busy ? 'Uploading…' : value ? 'Replace photo' : 'Upload photo'}
          </button>
          {value && !busy && <button type="button" className="ppf__btn ppf__btn--quiet" onClick={() => onChange('')}>Remove</button>}
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
      </div>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden onChange={(e) => { pick(e.target.files); e.target.value = ''; }} />
    </div>
  );
}
