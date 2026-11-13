import { Link } from 'react-router-dom';
import { img } from '../assets.js';
import { Logo, Icon, AppSparkles13, AppArrow } from '../components/ui.jsx';

export function AuthLayout({ mode, title, lead, children, footer }) {
  return (
    <div className="auth">
      <main className="auth__main">
        <div className="auth__logo"><Logo /></div>
        <div className="auth__body">
          <div className="seg" role="tablist" aria-label="Account">
            <Link to="/signup" role="tab" aria-selected={mode === 'signup'} className={`seg__btn ${mode === 'signup' ? 'is-active' : ''}`}>Create account</Link>
            <Link to="/login" role="tab" aria-selected={mode === 'login'} className={`seg__btn ${mode === 'login' ? 'is-active' : ''}`}>Log in</Link>
          </div>
          <div>
            <h1 className="auth__title">{title}</h1>
            <p className="auth__lead">{lead}</p>
          </div>
          {children}
          {footer}
        </div>
        <p className="auth__fine">No perfect starting point needed. Just you and your work.</p>
      </main>
      <AuthAside />
    </div>
  );
}

export function Field({ label, hint, ...input }) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      <input className="field__input" {...input} />
      {hint && <small className="field__hint">{hint}</small>}
    </label>
  );
}

export function SubmitButton({ children, busy = false }) {
  return (
    <button type="submit" className="app-btn app-btn--primary app-btn--lg app-btn--block" disabled={busy} aria-busy={busy}>
      <span>{children}</span>
      <AppArrow />
    </button>
  );
}

export default function AuthAside() {
  return (
    <aside className="auth__aside">
      <p className="section-label section-label--light"><Icon src={img.markerAuth} size={6} /><span>Your experience. A new perspective.</span></p>
      <h2 className="auth__aside-title">Sound like you.<br />On your best day.</h2>
      <div className="focus">
        <p className="focus__head">YOUR STORY, COMING INTO FOCUS</p>
        <div className="focus__orig">
          <p className="focus__k">YOUR STARTING POINT</p>
          <p className="focus__q">“I redesigned the sign-up flow for a student project. I did interviews and made prototypes.”</p>
        </div>
        <div className="focus__draft">
          <p className="focus__k focus__k--accent"><AppSparkles13 />A CLEARER WAY TO SAY IT</p>
          <p className="focus__text">I explored where students struggled with sign-up, then translated interview insights into a simpler onboarding experience.</p>
        </div>
      </div>
      <p className="auth__aside-tag">Less second-guessing. More possibility.</p>
    </aside>
  );
}
