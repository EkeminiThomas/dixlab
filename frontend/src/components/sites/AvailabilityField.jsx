import { AVAILABILITY, WORK_TYPES, bookingLink } from './HireBar.jsx';

/**
 * Editor fieldset for a portfolio's "Hire me" card: availability, how they work,
 * time zone, rate, a booking link and which of their CVs visitors can download.
 */
export default function AvailabilityField({ value = {}, cvProjectId = '', cvs = [], onChange, onCv }) {
  const a = value || {};
  const set = (k, v) => onChange({ ...a, [k]: v });
  const types = a.types || [];
  const toggle = (t) => set('types', types.includes(t) ? types.filter((x) => x !== t) : [...types, t]);
  const badBooking = a.bookingUrl && !bookingLink(a.bookingUrl);
  return (
    <fieldset className="ed__set">
      <legend>Hire me <em className="field__opt">optional</em></legend>
      <small className="field__hint">A small card on your portfolio with your availability and quick ways to hire you. Leave it empty to hide it.</small>
      <label className="field">
        <span className="field__label">Availability</span>
        <select className="field__input" value={a.status || ''} onChange={(e) => set('status', e.target.value)}>
          <option value="">Don’t show</option>
          {Object.entries(AVAILABILITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </label>
      <div className="field">
        <span className="field__label">How you like to work</span>
        <div className="pills">
          {WORK_TYPES.map((t) => (
            <button key={t} type="button" className={`pill-btn ${types.includes(t) ? 'is-active' : ''}`} aria-pressed={types.includes(t)} onClick={() => toggle(t)}>{t}</button>
          ))}
        </div>
      </div>
      <div className="ed__pair">
        <label className="field">
          <span className="field__label">Time zone</span>
          <input className="field__input" value={a.timezone || ''} maxLength={40} onChange={(e) => set('timezone', e.target.value)} placeholder="WAT (UTC+1)" />
        </label>
        <label className="field">
          <span className="field__label">Rate <em className="field__opt">optional</em></span>
          <input className="field__input" value={a.rate || ''} maxLength={40} onChange={(e) => set('rate', e.target.value)} placeholder="From $40/hour" />
        </label>
      </div>
      <label className="field">
        <span className="field__label">Booking link <em className="field__opt">optional</em></span>
        <input className="field__input" type="url" value={a.bookingUrl || ''} onChange={(e) => set('bookingUrl', e.target.value.trim())} placeholder="https://calendly.com/you/intro" />
        <small className={`field__hint ${badBooking ? 'is-error' : ''}`}>{badBooking
          ? 'Use a Calendly, Cal.com, Google Calendar, TidyCal, Zcal, SavvyCal or Microsoft Bookings link.'
          : 'Adds a “Book a call” button. Calendly, Cal.com, Google Calendar, TidyCal, Zcal, SavvyCal or Microsoft Bookings.'}</small>
      </label>
      <label className="field">
        <span className="field__label">Short note <em className="field__opt">optional</em></span>
        <input className="field__input" value={a.note || ''} maxLength={160} onChange={(e) => set('note', e.target.value)} placeholder="Booking projects from March." />
      </label>
      <label className="field">
        <span className="field__label">CV to download</span>
        <select className="field__input" value={cvProjectId || ''} onChange={(e) => onCv(e.target.value)}>
          <option value="">No download button</option>
          {cvs.map((c) => <option key={c.id} value={c.id}>{c.title || c.name || 'Untitled CV'}{c.status === 'Published' ? '' : ' (publish it to enable)'}</option>)}
        </select>
        <small className="field__hint">{cvs.length ? 'Visitors get your latest published version as a PDF.' : 'Make a CV in Dixlab and publish it, then pick it here.'}</small>
      </label>
    </fieldset>
  );
}
