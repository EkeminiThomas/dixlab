import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePlan, loadCatalog, startTrial, checkout, formatPrice, templateTier, PLAN_RANK, PLAN_NAMES, isSignedIn, getCurrency } from '../api.js';

const PERKS = {
  starter: ['CVs, portfolios and case studies', 'Premium templates', '100 AI units a month'],
  pro: ['Unlimited CVs, 5 portfolios, 15 case studies', 'Advanced and 3D templates, your own domain', '300 AI units, analytics, no branding'],
  premium: ['Unlimited portfolios and case studies', 'Multiple profiles and domains', '800 AI units, priority support'],
};

const TITLES = {
  plan_limit: 'You’ve reached your plan’s limit',
  template_locked: 'This template isn’t on your plan',
  ai_quota: 'You’ve used this period’s AI units',
  ai_plan: 'Tailoring your CV to a job is part of Pro',
};

/**
 * The upgrade dialog. Anything in the app can open it with openUpgrade(detail)
 * (api.js does when the server answers 402 for a plan limit). Mounted once.
 */
export function UpgradeHost() {
  const [detail, setDetail] = useState(null);
  useEffect(() => {
    const open = (e) => { loadCatalog(); setDetail(e.detail || {}); };
    window.addEventListener('dixlab:upgrade', open);
    return () => window.removeEventListener('dixlab:upgrade', open);
  }, []);
  if (!detail) return null;
  return <UpgradeDialog detail={detail} onClose={() => setDetail(null)} />;
}

function UpgradeDialog({ detail, onClose }) {
  const nav = useNavigate();
  const { catalog, plan } = usePlan();
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const needed = PLAN_RANK[detail.needed] ? detail.needed : 'starter';
  const options = ['starter', 'pro', 'premium'].filter((id) => PLAN_RANK[id] >= PLAN_RANK[needed] && (!plan || PLAN_RANK[id] > PLAN_RANK[plan.plan])).slice(0, 2);
  const trial = plan?.trialAvailable && PLAN_RANK[needed] <= PLAN_RANK.pro && plan.plan === 'free';
  const currency = getCurrency();

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const run = async (key, fn) => {
    setBusy(key); setError('');
    try { await fn(); } catch (e) { setError(e.body?.unavailable ? 'Payments aren’t set up yet. Try the free trial, or check back soon.' : e.message); }
    setBusy('');
  };
  const buy = (id) => {
    if (!isSignedIn()) { onClose(); nav(`/signup?next=${encodeURIComponent('/pricing')}`); return; }
    // Already paying: the plan is switched in place (no redirect), so just close.
    run(id, async () => { const res = await checkout(id, 'monthly', currency); if (res?.changed) onClose(); });
  };

  return (
    <div className="upg" role="dialog" aria-modal="true" aria-labelledby="upg-title" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="upg__card">
        <button type="button" className="upg__x" onClick={onClose} aria-label="Close">✕</button>
        {plan && <p className="upg__k"><span>{plan.name} plan</span></p>}
        <h2 id="upg-title" className="upg__title">{TITLES[detail.code] || 'Upgrade your plan'}</h2>
        <p className="upg__lead">{detail.message || 'Pick a plan to unlock more.'} Your work is safe: nothing is deleted.</p>
        <div className={`upg__opts ${options.length === 1 ? 'is-one' : ''}`}>
          {options.map((id) => {
            const p = catalog?.plans.find((x) => x.id === id);
            return (
              <div key={id} className={`upg__opt upg__opt--${id}`}>
                <div className="upg__opt-head"><b>{PLAN_NAMES[id]}</b>{p?.prices?.[currency] && <span>{formatPrice(p.prices[currency].monthly, currency)} / month</span>}</div>
                <ul>{PERKS[id].map((t) => <li key={t}>{t}</li>)}</ul>
                {id === 'pro' && trial ? (
                  <button type="button" className="app-btn app-btn--primary upg__btn" disabled={!!busy} onClick={() => run('trial', async () => { await startTrial(); onClose(); })}>
                    {busy === 'trial' ? 'Starting…' : `Try Pro free for ${catalog?.trialDays || 14} days`}
                  </button>
                ) : (
                  <button type="button" className={`app-btn ${id === 'premium' ? 'upg__btn--gold' : 'app-btn--primary'} upg__btn`} disabled={!!busy} onClick={() => buy(id)}>
                    {busy === id ? 'Opening checkout…' : `Get ${PLAN_NAMES[id]}`}
                  </button>
                )}
              </div>
            );
          })}
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="upg__foot">
          <button type="button" className="upg__link" onClick={onClose}>Not now</button>
          <button type="button" className="upg__link" onClick={() => { onClose(); nav('/pricing'); }}>Compare plans →</button>
        </div>
      </div>
    </div>
  );
}

/** "Starter" or "Pro" next to a template the account's plan doesn't include. */
export function PlanBadge({ template }) {
  const { catalog, plan } = usePlan();
  if (!catalog || !catalog.enforced) return null;
  const tier = templateTier(template, catalog);
  if (tier === 'free') return null;
  const mine = plan?.plan || 'free';
  const included = PLAN_RANK[mine] >= PLAN_RANK[tier];
  return (
    <span className={`plan-badge plan-badge--${tier} ${included ? 'is-included' : ''}`} title={included ? `Included in your ${plan?.name} plan` : `Publishing with it needs ${PLAN_NAMES[tier]}`}>
      {!included && (
        <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden><path d="M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3" /></svg>
      )}
      {PLAN_NAMES[tier]}
    </span>
  );
}
