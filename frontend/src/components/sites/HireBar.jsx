import { useState } from 'react';
import { safeHref } from '../../safeUrl.js';

/** Availability options the editor offers (portfolio → "Hire me"). */
export const AVAILABILITY = {
  open: { label: 'Open to work', dot: 'is-open' },
  freelance: { label: 'Available for freelance', dot: 'is-open' },
  soon: { label: 'Available soon', dot: 'is-soon' },
  busy: { label: 'Not taking new work', dot: 'is-busy' },
};
export const WORK_TYPES = ['Full-time', 'Part-time', 'Contract', 'Freelance', 'Remote', 'Hybrid', 'On-site'];

/** Booking links people can trust: Calendly, Cal.com, Google Calendar, TidyCal, Zcal, SavvyCal, Microsoft Bookings. */
const BOOKING = /^https:\/\/(?:www\.)?(?:calendly\.com|cal\.com|calendar\.app\.google|calendar\.google\.com|tidycal\.com|zcal\.co|savvycal\.com|outlook\.office365\.com\/owa\/calendar|outlook\.office\.com\/bookwithme)\//i;
export const bookingLink = (url) => { const u = safeHref(url); return u && BOOKING.test(u) ? u : null; };

/**
 * The "Hire me" card on a published portfolio: availability, how they work, time zone,
 * rate, and buttons to book a call or download their CV. Shown only when they've set it up.
 */
export default function HireBar({ availability: a = {}, cvSlug, onAction }) {
  // On phones it starts as a small pill so it doesn't cover the page.
  const [open, setOpen] = useState(() => typeof window === 'undefined' || window.innerWidth > 640);
  const status = AVAILABILITY[a.status] ? a.status : null;
  const book = bookingLink(a.bookingUrl);
  if (!status && !cvSlug && !book) return null;
  const facts = [(a.types || []).filter((t) => WORK_TYPES.includes(t)).join(' · '), a.timezone, a.rate].filter(Boolean);
  if (!open) {
    return (
      <button type="button" className="hire hire--min" onClick={() => setOpen(true)} aria-label="Show availability">
        {status && <i className={`hire__dot ${AVAILABILITY[status].dot}`} aria-hidden />}{status ? AVAILABILITY[status].label : 'Hire me'}
      </button>
    );
  }
  return (
    <aside className="hire" aria-label="Availability">
      <button type="button" className="hire__x" onClick={() => setOpen(false)} aria-label="Hide">✕</button>
      {status && <p className="hire__status"><i className={`hire__dot ${AVAILABILITY[status].dot}`} aria-hidden />{AVAILABILITY[status].label}</p>}
      {facts.length > 0 && <p className="hire__facts">{facts.join(' · ')}</p>}
      {a.note && <p className="hire__note">{String(a.note).slice(0, 160)}</p>}
      <div className="hire__actions">
        {book && <a className="hire__btn hire__btn--main" href={book} target="_blank" rel="noopener noreferrer" onClick={() => onAction?.('book')}>Book a call</a>}
        {cvSlug && <a className="hire__btn" href={`/p/${encodeURIComponent(cvSlug)}?download=1`} target="_blank" rel="noopener" onClick={() => onAction?.('cv')}>Download CV</a>}
      </div>
    </aside>
  );
}
