import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import QRCode from 'qrcode';
import { img } from '../assets.js';
import { Icon, useUser, useAmbient } from '../components/ui.jsx';
import DashSide from '../components/DashSide.jsx';
import {
  isSignedIn, updateName, changePassword, deleteAccount, resendVerification,
  twoFactorStatus, twoFactorSetup, twoFactorEnable, twoFactorDisable, twoFactorNewCodes,
  usePlan, refreshPlan, loadCatalog, cancelPlan, manageCard, requestRefund, formatPrice,
} from '../api.js';

/** Your account: name, email confirmation, password, and deleting the account. */
export default function Account() {
  const user = useUser();
  useAmbient();
  if (!isSignedIn()) return <Navigate to="/login" replace />;
  return (
    <div className="dash">
      <DashSide active="account" />
      <main className="dash__main">
        <header className="dash__head">
          <div>
            <p className="section-label"><Icon src={img.markerApp} size={6} /><span>Account</span></p>
            <h1 className="dash__title">Your account</h1>
            <p className="dash__lead">Your details, your password, and your data.</p>
          </div>
        </header>
        <div className="acct">
          <PlanCard />
          <NameCard user={user} />
          <EmailCard user={user} />
          <PasswordCard />
          <TwoFactorCard user={user} />
          <DeleteCard user={user} />
        </div>
      </main>
    </div>
  );
}

function Card({ title, lead, danger, children }) {
  return (
    <section className={`acct__card ${danger ? 'is-danger' : ''}`}>
      <div className="acct__head"><h2>{title}</h2>{lead && <p>{lead}</p>}</div>
      <div className="acct__body">{children}</div>
    </section>
  );
}

function useAction() {
  const [state, setState] = useState({});
  const run = async (fn, ok) => {
    setState({ busy: true });
    try { await fn(); setState({ ok }); } catch (e) { setState({ error: e.offline ? 'Can’t reach the Dixlab server.' : e.message }); }
  };
  const note = state.error ? <p className="form-error" role="alert">{state.error}</p> : state.ok ? <p className="acct__ok" role="status">{state.ok}</p> : null;
  return [state, run, note];
}

const dateText = (ms) => new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
const mb = (bytes) => (bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(1)} GB` : `${Math.max(0, Math.round(bytes / 1024 ** 2))} MB`);

function Meter({ label, used, max, format = (n) => n }) {
  const pct = max == null ? 0 : Math.min(100, Math.round((used / Math.max(1, max)) * 100));
  return (
    <div className="plan-meter">
      <div className="plan-meter__row"><span>{label}</span><b>{format(used)}{max == null ? ' · unlimited' : ` of ${format(max)}`}</b></div>
      {max != null && <div className={`plan-meter__bar ${pct >= 100 ? 'is-full' : ''}`}><i style={{ width: `${pct}%` }} /></div>}
    </div>
  );
}

/** Your plan, what you've used, renewals, cancelling, card updates and refunds. */
function PlanCard() {
  const { plan, catalog } = usePlan();
  const [state, run, note] = useAction();
  const [confirm, setConfirm] = useState(null); // 'cancel' | reference
  useEffect(() => { refreshPlan(); loadCatalog(); }, []);
  if (!plan) return <Card title="Plan & billing" lead="Loading your plan…" />;

  const status = plan.source === 'trial' ? `Free trial · ends ${dateText(plan.trialEndsAt)}`
    : plan.source === 'override' ? 'Given by Dixlab'
    : plan.source === 'subscription'
      ? plan.status === 'prepaid' ? `Paid until ${dateText(plan.periodEnd)} · renew by paying again`
        : plan.status === 'past_due' ? 'Payment failed · Bachs will retry. Update your card to keep your plan.'
        : plan.cancelAtPeriodEnd ? `Cancelled · ends ${dateText(plan.periodEnd)}` : `${plan.interval === 'yearly' ? 'Yearly' : 'Monthly'} · renews ${dateText(plan.periodEnd)}`
      : 'Free forever';
  const L = plan.limits;
  const used = plan.usage;
  const cur = (p) => (p.currency ? formatPrice(p.amount, p.currency) : '');

  return (
    <Card title="Plan & billing" lead="Your plan, what you’ve used this month, and your payments.">
      <div className="plan-now">
        <div>
          <p className={`plan-now__name plan-now__name--${plan.plan}`}>{plan.name}</p>
          <p className="plan-now__status">{status}</p>
        </div>
        <div className="acct__row">
          <Link className="app-btn app-btn--primary" to="/pricing">{plan.status === 'prepaid' ? 'Renew or change' : plan.plan === 'premium' ? 'See plans' : 'Upgrade'}</Link>
          {plan.canManageCard && <button className="app-btn app-btn--ghost" disabled={state.busy} onClick={() => run(manageCard)}>Manage billing</button>}
          {((plan.source === 'subscription' && plan.renews) || plan.source === 'trial') && (
            <button className="app-btn app-btn--ghost" onClick={() => setConfirm('cancel')}>{plan.source === 'trial' ? 'End trial' : 'Cancel plan'}</button>
          )}
        </div>
      </div>
      {confirm === 'cancel' && (
        <div className="plan-confirm" role="alert">
          <p>{plan.source === 'trial' ? 'End your Pro trial now? You’ll go back to Free, and you can’t start another trial.'
            : `Cancel ${plan.name}? You keep it until ${dateText(plan.periodEnd)}, then move to Free. Nothing is deleted.`}</p>
          <div className="acct__row">
            <button className="app-btn app-btn--primary" disabled={state.busy} onClick={() => run(async () => { await cancelPlan(); setConfirm(null); }, plan.source === 'trial' ? 'Your trial has ended.' : 'Your plan won’t renew.')}>Yes, {plan.source === 'trial' ? 'end it' : 'cancel'}</button>
            <button className="app-btn app-btn--ghost" onClick={() => setConfirm(null)}>Keep my plan</button>
          </div>
        </div>
      )}
      {plan.enforced && (
        <div className="plan-meters">
          {L.perType
            ? [['cv', 'CVs'], ['portfolio', 'Portfolios'], ['case', 'Case studies']].map(([k, label]) => (
              <Meter key={k} label={label} used={used.projects[k] || 0} max={L.perType[k]} />))
            : <Meter label={L.projects === 1 ? 'Projects (one category on Free)' : 'Projects'} used={used.projects.total} max={L.projects} />}
          <Meter label="Storage" used={used.storageBytes} max={L.storageMb * 1024 * 1024} format={mb} />
          <Meter label={plan.source === 'subscription' ? 'AI units this billing period' : 'AI units this month'} used={used.ai.units} max={used.ai.allowance} />
        </div>
      )}
      {plan.payments.length > 0 && (
        <div className="plan-pay">
          <p className="plan-pay__k">Payments</p>
          <ul>
            {plan.payments.map((p) => (
              <li key={p.reference}>
                <span>{p.paidAt ? dateText(p.paidAt) : '—'}</span>
                <span>{(catalog?.plans.find((x) => x.id === p.plan)?.name || p.plan)} · {p.interval}</span>
                <b>{cur(p)}</b>
                <span className="plan-pay__state">
                  {p.refundStatus ? (p.refundStatus === 'processed' ? 'Refunded' : 'Refund on its way')
                    : p.status === 'failed' ? 'Failed'
                    : p.refundable ? (confirm === p.reference
                      ? <><button className="acct__link-btn" disabled={state.busy} onClick={() => run(async () => { await requestRefund(p.reference); setConfirm(null); }, 'Refund requested. It reaches your card in 5–10 working days.')}>Confirm refund</button> · <button className="acct__link-btn" onClick={() => setConfirm(null)}>Keep</button></>
                      : <button className="acct__link-btn" onClick={() => setConfirm(p.reference)}>Request refund</button>)
                    : 'Paid'}
                </span>
              </li>
            ))}
          </ul>
          {confirm && confirm !== 'cancel' && <p className="acct__note">A refund ends your plan straight away and moves you to Free.</p>}
        </div>
      )}
      {note}
    </Card>
  );
}

function NameCard({ user }) {
  const [name, setName] = useState(user.name || '');
  const [state, run, note] = useAction();
  return (
    <Card title="Name" lead="Shown in the app and used as the default on your portfolios.">
      <form className="acct__row" onSubmit={(e) => { e.preventDefault(); if (name.trim()) run(() => updateName(name.trim()), 'Saved.'); }}>
        <input className="field__input" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} aria-label="Your name" autoComplete="name" />
        <button className="app-btn app-btn--ghost" disabled={state.busy || !name.trim() || name.trim() === user.name}>Save</button>
      </form>
      {note}
    </Card>
  );
}

function EmailCard({ user }) {
  const [state, run, note] = useAction();
  return (
    <Card title="Email" lead={user.email}>
      {user.emailVerified ? (
        <p className="acct__status"><span className="acct__pill is-good"><span aria-hidden>✓</span>Confirmed</span>Visitors’ Get in touch messages are sent here.</p>
      ) : (
        <>
          <p className="acct__status"><span className="acct__pill is-warn"><span aria-hidden>!</span>Not confirmed</span>Confirm your email to publish your work and receive messages.</p>
          <button className="app-btn app-btn--ghost" onClick={() => run(resendVerification, 'Sent. Check your inbox (and spam) for the link.')} disabled={state.busy}>
            {state.busy ? 'Sending…' : 'Send the confirmation link again'}
          </button>
        </>
      )}
      {note}
    </Card>
  );
}

function PasswordCard() {
  const [f, setF] = useState({ current: '', password: '', confirm: '' });
  const [state, run, note] = useAction();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = (e) => {
    e.preventDefault();
    if (f.password.length < 8) return run(() => Promise.reject(new Error('Use at least 8 characters.')));
    if (f.password !== f.confirm) return run(() => Promise.reject(new Error('The two new passwords don’t match.')));
    run(() => changePassword(f.current, f.password).then(() => setF({ current: '', password: '', confirm: '' })),
      'Password changed. Any other devices you were logged in on have been signed out.');
  };
  return (
    <Card title="Password" lead="Changing it signs you out on every other device.">
      <form className="acct__form" onSubmit={submit} noValidate>
        <label className="field"><span className="field__label">Current password</span><input className="field__input" type="password" value={f.current} onChange={set('current')} autoComplete="current-password" /></label>
        <label className="field"><span className="field__label">New password</span><input className="field__input" type="password" value={f.password} onChange={set('password')} autoComplete="new-password" /></label>
        <label className="field"><span className="field__label">New password again</span><input className="field__input" type="password" value={f.confirm} onChange={set('confirm')} autoComplete="new-password" /></label>
        <div><button className="app-btn app-btn--ghost" disabled={state.busy || !f.current || !f.password}>{state.busy ? 'Saving…' : 'Change password'}</button></div>
      </form>
      {note}
    </Card>
  );
}

/** Recovery codes, shown once right after they're made. */
function RecoveryCodes({ codes, onDone }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => { try { await navigator.clipboard.writeText(codes.join('\n')); setCopied(true); } catch { /* clipboard blocked */ } };
  return (
    <>
      <p className="acct__note"><b>Save these recovery codes</b> somewhere safe, like a password manager. Each one logs you in once if you lose your phone. They won’t be shown again.</p>
      <ul className="acct__codes">{codes.map((c) => <li key={c}>{c}</li>)}</ul>
      <div className="acct__actions">
        <button type="button" className="app-btn app-btn--ghost" onClick={copy}>{copied ? 'Copied' : 'Copy codes'}</button>
        <button type="button" className="app-btn app-btn--ghost" onClick={onDone}>I’ve saved them</button>
      </div>
    </>
  );
}

function TwoFactorCard({ user }) {
  const on = Boolean(user.twoFactor);
  const [mode, setMode] = useState('idle'); // idle | password | scan | codes | disable | regenerate
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [setup, setSetup] = useState(null);  // { secret, otpauthUrl }
  const [qr, setQr] = useState('');
  const [codes, setCodes] = useState([]);
  const [left, setLeft] = useState(null);
  const [state, run, note] = useAction();

  useEffect(() => { if (on) twoFactorStatus().then((s) => setLeft(s.recoveryCodesLeft)).catch(() => {}); }, [on, mode]);
  useEffect(() => {
    if (!setup) return setQr('');
    QRCode.toDataURL(setup.otpauthUrl, { margin: 0, width: 320 }).then(setQr).catch(() => setQr(''));
  }, [setup]);

  const reset = () => { setMode('idle'); setPassword(''); setCode(''); setSetup(null); };
  const lead = on
    ? 'On. Logging in needs your password and a code from your authenticator app.'
    : 'Add a second step to logging in: a code from an authenticator app (Google Authenticator, 1Password, Authy…), so a stolen password isn’t enough.';

  return (
    <Card title="Two-step login" lead={lead}>
      {mode === 'idle' && (on ? (
        <>
          <p className="acct__status"><span className="acct__pill is-good"><span aria-hidden>✓</span>On</span>
            {left != null && `${left} recovery code${left === 1 ? '' : 's'} left.`}</p>
          <div className="acct__actions">
            <button className="app-btn app-btn--ghost" onClick={() => setMode('regenerate')}>New recovery codes…</button>
            <button className="app-btn app-btn--ghost" onClick={() => setMode('disable')}>Turn off…</button>
          </div>
        </>
      ) : (
        <div><button className="app-btn app-btn--ghost" onClick={() => setMode('password')}>Turn on two-step login</button></div>
      ))}

      {mode === 'password' && (
        <form className="acct__form" onSubmit={(e) => { e.preventDefault(); if (password) run(async () => { setSetup(await twoFactorSetup(password)); setPassword(''); setMode('scan'); }); }}>
          <label className="field"><span className="field__label">Confirm your password</span>
            <input className="field__input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" autoFocus /></label>
          <div className="acct__actions">
            <button type="button" className="app-btn app-btn--ghost" onClick={reset}>Cancel</button>
            <button className="app-btn app-btn--ghost" disabled={!password || state.busy}>{state.busy ? 'Checking…' : 'Continue'}</button>
          </div>
        </form>
      )}

      {mode === 'scan' && setup && (
        <form className="acct__form" onSubmit={(e) => { e.preventDefault(); if (code.trim()) run(async () => { const r = await twoFactorEnable(code.trim()); setCodes(r.recoveryCodes); setCode(''); setMode('codes'); }, 'Two-step login is on. Other devices have been signed out.'); }}>
          <ol className="acct__steps">
            <li>Scan this QR code with your authenticator app.</li>
            <li>Or enter this key by hand: <span className="acct__secret">{setup.secret.match(/.{1,4}/g).join(' ')}</span></li>
            <li>Type the 6-digit code the app shows.</li>
          </ol>
          {qr && <img className="acct__qr" src={qr} alt="QR code for your authenticator app" />}
          <label className="field"><span className="field__label">Code from the app</span>
            <input className="field__input" value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" maxLength={12} placeholder="123 456" autoFocus /></label>
          <div className="acct__actions">
            <button type="button" className="app-btn app-btn--ghost" onClick={reset}>Cancel</button>
            <button className="app-btn app-btn--ghost" disabled={!code.trim() || state.busy}>{state.busy ? 'Checking…' : 'Turn on'}</button>
          </div>
        </form>
      )}

      {mode === 'codes' && <RecoveryCodes codes={codes} onDone={() => { setCodes([]); reset(); }} />}

      {(mode === 'disable' || mode === 'regenerate') && (
        <form className="acct__form" onSubmit={(e) => {
          e.preventDefault();
          if (!password || !code.trim()) return;
          if (mode === 'disable') run(async () => { await twoFactorDisable(password, code.trim()); reset(); }, 'Two-step login is off.');
          else run(async () => { const r = await twoFactorNewCodes(password, code.trim()); setCodes(r.recoveryCodes); setPassword(''); setCode(''); setMode('codes'); }, 'New codes made. The old ones no longer work.');
        }}>
          <label className="field"><span className="field__label">Your password</span>
            <input className="field__input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" autoFocus /></label>
          <label className="field"><span className="field__label">Code from your app (or a recovery code)</span>
            <input className="field__input" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="one-time-code" maxLength={32} /></label>
          <div className="acct__actions">
            <button type="button" className="app-btn app-btn--ghost" onClick={reset}>Cancel</button>
            <button className={`app-btn ${mode === 'disable' ? 'acct__danger' : 'app-btn--ghost'}`} disabled={!password || !code.trim() || state.busy}>
              {state.busy ? 'Checking…' : mode === 'disable' ? 'Turn off two-step login' : 'Make new codes'}
            </button>
          </div>
        </form>
      )}
      {note}
    </Card>
  );
}

function DeleteCard({ user }) {
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [password, setPassword] = useState('');
  const [state, run, note] = useAction();
  const ready = typed.trim().toUpperCase() === 'DELETE' && password;
  return (
    <Card danger title="Delete your account" lead="Permanently removes your account, every portfolio, CV and case study, your published pages and links, your messages, and every file you uploaded. This can’t be undone.">
      {!open ? (
        <button className="app-btn acct__danger" onClick={() => setOpen(true)}>Delete my account…</button>
      ) : (
        <form className="acct__form" onSubmit={(e) => { e.preventDefault(); if (ready) run(async () => { await deleteAccount(password); nav('/', { replace: true }); }); }}>
          <label className="field"><span className="field__label">Type <b>DELETE</b> to confirm</span><input className="field__input" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" autoFocus /></label>
          <label className="field"><span className="field__label">Your password</span><input className="field__input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /></label>
          <div className="acct__actions">
            <button type="button" className="app-btn app-btn--ghost" onClick={() => { setOpen(false); setTyped(''); setPassword(''); }}>Cancel</button>
            <button className="app-btn acct__danger" disabled={!ready || state.busy}>{state.busy ? 'Deleting…' : `Delete ${user.email}`}</button>
          </div>
        </form>
      )}
      {note}
    </Card>
  );
}
