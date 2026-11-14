import { createContext, useContext, useState } from 'react';
import { StaticSite } from './shared.jsx';
import { sendContact } from '../../api.js';

/** The published page's slug, so the form knows whose inbox to send to. */
export const ContactTarget = createContext(null);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * "Get in touch": visitors write a message that's delivered to the
 * portfolio owner's inbox (and email). Their address is never shown.
 */
export function GetInTouch({ s, title = 'Get in touch', lead }) {
  const isStatic = useContext(StaticSite);
  const slug = useContext(ContactTarget);
  const [form, setForm] = useState({ name: '', email: '', message: '', website: '' });
  const [state, setState] = useState({ status: 'idle' }); // idle | sending | sent | error
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const intro = lead || `Have a project, a role or a question? Send ${s.first === 'Your' ? 'me' : s.first} a message and ${s.first === 'Your' ? 'I’ll' : 'they’ll'} reply by email.`;

  // Thumbnails: the same look, but nothing to type into.
  if (isStatic) {
    return (
      <section className="git" aria-hidden>
        <div className="git__intro"><h2 className="git__title">{title}</h2><p className="git__lead">{intro}</p></div>
        <div className="git__form">
          <div className="git__row"><span className="git__input">Your name</span><span className="git__input">Your email</span></div>
          <span className="git__input git__input--area">Your message</span>
          <span className="git__send">Send message</span>
        </div>
      </section>
    );
  }

  const submit = async (e) => {
    e.preventDefault();
    const name = form.name.trim(); const email = form.email.trim(); const message = form.message.trim();
    if (!name || !message) return setState({ status: 'error', error: 'Add your name and a message.' });
    if (!EMAIL_RE.test(email)) return setState({ status: 'error', error: 'Check your email address, so they can reply.' });
    if (!slug) return setState({ status: 'error', error: 'This is a preview. The form sends messages once your portfolio is published.' });
    setState({ status: 'sending' });
    try {
      await sendContact(slug, { name, email, message, website: form.website });
      setState({ status: 'sent', name: name.split(/\s+/)[0], email });
      setForm({ name: '', email: '', message: '', website: '' });
    } catch (err) {
      setState({ status: 'error', error: err.offline ? 'Couldn’t send right now. Please try again in a moment.' : err.message });
    }
  };

  return (
    <section className="git" id="contact">
      <div className="git__intro">
        <h2 className="git__title">{title}</h2>
        <p className="git__lead">{intro}</p>
      </div>
      {state.status === 'sent' ? (
        <div className="git__done" role="status">
          <b>Thanks, {state.name}. Your message is on its way.</b>
          <span>{s.first === 'Your' ? 'I’ll' : `${s.first} will`} reply to {state.email}.</span>
          <button type="button" className="git__again" onClick={() => setState({ status: 'idle' })}>Send another message</button>
        </div>
      ) : (
        <form className="git__form" onSubmit={submit} noValidate>
          <div className="git__row">
            <label className="git__field"><span>Name</span>
              <input className="git__input" value={form.name} onChange={set('name')} autoComplete="name" maxLength={100} required placeholder="Your name" />
            </label>
            <label className="git__field"><span>Email</span>
              <input className="git__input" type="email" value={form.email} onChange={set('email')} autoComplete="email" maxLength={254} required placeholder="you@company.com" />
            </label>
          </div>
          <label className="git__field"><span>Message</span>
            <textarea className="git__input git__input--area" rows={5} value={form.message} onChange={set('message')} maxLength={5000} required placeholder="Tell them about your project, role or question." />
          </label>
          {/* Hidden from people; bots fill it in and their message is dropped. */}
          <input className="git__hp" tabIndex={-1} autoComplete="off" value={form.website} onChange={set('website')} aria-hidden name="website" />
          {state.status === 'error' && <p className="git__error" role="alert">{state.error}</p>}
          <button className="git__send" type="submit" disabled={state.status === 'sending'}>
            {state.status === 'sending' ? 'Sending…' : 'Send message'}
          </button>
        </form>
      )}
    </section>
  );
}
