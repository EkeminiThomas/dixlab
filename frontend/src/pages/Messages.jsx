import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { img } from '../assets.js';
import { Icon, timeAgo, useAmbient } from '../components/ui.jsx';
import DashSide from '../components/DashSide.jsx';
import { isSignedIn, fetchMessages, markMessage, deleteMessage, adjustUnread } from '../api.js';

/** "Get in touch" messages sent from your published portfolios. */
export default function Messages() {
  const [state, setState] = useState({ loading: isSignedIn() });
  const [open, setOpen] = useState(null);
  useAmbient();

  const load = () => fetchMessages()
    .then((d) => setState({ items: d.messages, emailEnabled: d.emailEnabled }))
    .catch((e) => setState({ error: e.message }));
  useEffect(() => { if (isSignedIn()) load(); }, []);

  const items = state.items || [];
  const toggle = (m) => {
    setOpen(open === m.id ? null : m.id);
    if (!m.read) {
      setState((s) => ({ ...s, items: s.items.map((x) => (x.id === m.id ? { ...x, read: true } : x)) }));
      adjustUnread(-1);
      markMessage(m.id, true).catch(() => {});
    }
  };
  const remove = async (m) => {
    setState((s) => ({ ...s, items: s.items.filter((x) => x.id !== m.id) }));
    if (!m.read) adjustUnread(-1);
    await deleteMessage(m.id).catch(() => load());
  };

  return (
    <div className="dash">
      <DashSide active="messages" />
      <main className="dash__main">
        <header className="dash__head">
          <div>
            <p className="section-label"><Icon src={img.markerApp} size={6} /><span>Inbox</span></p>
            <h1 className="dash__title">Messages</h1>
            <p className="dash__lead">What people send from the Get in touch form on your published portfolios. Reply straight to their email.</p>
          </div>
        </header>

        {!isSignedIn() ? (
          <p className="msg__empty">Log in to see messages. <Link to="/login">Log in</Link></p>
        ) : state.loading ? (
          <p className="msg__empty"><span className="cz__spin" aria-label="Loading" /></p>
        ) : state.error ? (
          <p className="msg__empty" role="alert">{state.error} <button className="msg__link" onClick={load}>Try again</button></p>
        ) : (
          <>
            <p className="msg__note">
              {state.emailEnabled
                ? 'New messages are also emailed to you.'
                : 'Messages are kept here. To have them emailed to you as well, add SMTP settings to backend/.env (see .env.example).'}
            </p>
            {items.length === 0 ? (
              <div className="msg__empty">
                <b>No messages yet.</b>
                <span>Publish a portfolio and share its link. Visitors can write to you from its Get in touch section.</span>
              </div>
            ) : (
              <ul className="msg__list">
                {items.map((m) => (
                  <li key={m.id} className={`msg ${m.read ? '' : 'is-unread'} ${open === m.id ? 'is-open' : ''}`}>
                    <button className="msg__head" onClick={() => toggle(m)} aria-expanded={open === m.id}>
                      <span className="msg__dot" aria-label={m.read ? undefined : 'Unread'} />
                      <span className="msg__who"><b>{m.name}</b><small>{m.email}</small></span>
                      <span className="msg__preview">{m.body}</span>
                      <time className="msg__time" dateTime={new Date(m.createdAt).toISOString()}>{timeAgo(m.createdAt)}</time>
                    </button>
                    {open === m.id && (
                      <div className="msg__body">
                        <p>{m.body}</p>
                        <div className="msg__actions">
                          <a className="app-btn app-btn--primary" href={`mailto:${m.email}?subject=${encodeURIComponent('Re: your message')}`}>Reply by email</a>
                          <Link className="app-btn" to={`/p/${m.slug}`} target="_blank">View portfolio</Link>
                          <button className="msg__link msg__del" onClick={() => remove(m)}>Delete</button>
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </main>
    </div>
  );
}
