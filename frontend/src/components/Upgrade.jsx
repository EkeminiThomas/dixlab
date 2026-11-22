import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  usePlan, loadCatalog, refreshPlan, buyCredits, unlockFeature, formatPrice, isPremiumTemplate, hasFeature, unlockInfo,
  isSignedIn, getCurrency,
} from '../api.js';

const TITLES = {
  ai_credits: 'You need a few more credits',
  credits_low: 'You need a few more credits',
  unlock_needed: 'Unlock this for good',
};

/**
 * The credits dialog. Anything in the app can open it with openUpgrade(detail)
 * (api.js does when the server answers 402: a feature to unlock, or not enough
 * credits). Mounted once.
 */
export function UpgradeHost() {
  const [detail, setDetail] = useState(null);
  useEffect(() => {
    const open = (e) => { loadCatalog(); if (isSignedIn()) refreshPlan(); setDetail(e.detail || {}); };
    window.addEventListener('dixlab:upgrade', open);
    return () => window.removeEventListener('dixlab:upgrade', open);
  }, []);
  if (!detail) return null;
  return <CreditsDialog detail={detail} onClose={() => setDetail(null)} />;
}

/** Credit packs to choose from: the one that covers `need`, and the one after it. */
export function PackPicker({ need = 0, onError }) {
  const nav = useNavigate();
  const { catalog, plan } = usePlan();
  const [busy, setBusy] = useState('');
  const currency = getCurrency();
  const short = Math.max(0, need - (plan?.credits ?? 0));
  const packs = catalog?.packs || [];
  const first = Math.max(0, packs.findIndex((p) => p.credits >= short));
  const shown = packs.slice(first, first + 2);
  const buy = async (id) => {
    if (!isSignedIn()) { nav(`/signup?next=${encodeURIComponent('/pricing')}`); return; }
    setBusy(id);
    try { await buyCredits(id, currency); } catch (e) {
      onError?.(e.body?.unavailable ? 'Payments aren’t set up yet. Check back soon.' : e.message);
    }
    setBusy('');
  };
  if (!catalog) return <p className="upg__lead">Loading…</p>;
  return (
    <div className={`upg__opts ${shown.length === 1 ? 'is-one' : ''}`}>
      {shown.map((p, i) => (
        <div key={p.id} className={`upg__opt ${i === 1 ? 'upg__opt--pro' : ''}`}>
          <div className="upg__opt-head"><b>{p.credits.toLocaleString()} credits</b><span>{formatPrice(p.prices[currency], currency)}</span></div>
          <ul><li>Never expire</li><li>{formatPrice(Math.round(p.prices[currency] / p.credits) * 100, currency)} per 100 credits</li></ul>
          <button type="button" className="app-btn app-btn--primary upg__btn" disabled={!!busy} onClick={() => buy(p.id)}>
            {busy === p.id ? 'Opening checkout…' : `Buy ${p.credits.toLocaleString()} credits`}
          </button>
        </div>
      ))}
    </div>
  );
}

function CreditsDialog({ detail, onClose }) {
  const nav = useNavigate();
  const { catalog, plan } = usePlan();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const unlock = detail.feature ? (unlockInfo(detail.feature, catalog) || { id: detail.feature, name: detail.name, credits: detail.credits }) : null;
  const balance = plan?.credits ?? detail.balance ?? 0;
  const cost = unlock?.credits ?? detail.needed ?? 0;
  const canAfford = unlock && balance >= cost;

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const doUnlock = async () => {
    setBusy(true); setError('');
    try { await unlockFeature(unlock.id); setDone(`${unlock.name} is unlocked for good. Try again now.`); } catch (e) { setError(e.message); }
    setBusy(false);
  };

  return (
    <div className="upg" role="dialog" aria-modal="true" aria-labelledby="upg-title" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="upg__card">
        <button type="button" className="upg__x" onClick={onClose} aria-label="Close">✕</button>
        {plan && <p className="upg__k"><span>{balance.toLocaleString()} credits</span></p>}
        <h2 id="upg-title" className="upg__title">{done ? 'Unlocked' : unlock ? `Unlock ${unlock.name}` : TITLES[detail.code] || 'Buy credits'}</h2>
        {done ? <p className="upg__lead">{done}</p> : (
          <>
            <p className="upg__lead">
              {detail.message || (unlock ? 'Pay once with credits and it stays on your account for good.' : 'Credits pay for AI help and unlock features. They never expire.')}
              {' '}Your work is safe: nothing is deleted.
            </p>
            {unlock && (
              <div className="upg__unlock">
                <div><b>{unlock.name}</b>{unlock.desc && <span>{unlock.desc}</span>}</div>
                <div className="upg__unlock-cost"><b>{cost} credits</b><span>once, yours for good</span></div>
                {canAfford && (
                  <button type="button" className="app-btn app-btn--primary" disabled={busy} onClick={doUnlock}>
                    {busy ? 'Unlocking…' : `Unlock for ${cost} credits`}
                  </button>
                )}
              </div>
            )}
            {!canAfford && (
              <>
                <p className="upg__short">{isSignedIn() ? `You have ${balance} credits${cost ? `; this needs ${cost}` : ''}. Top up:` : 'Create a free account to get started, then top up:'}</p>
                <PackPicker need={cost} onError={setError} />
              </>
            )}
          </>
        )}
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="upg__foot">
          <button type="button" className="upg__link" onClick={onClose}>{done ? 'Close' : 'Not now'}</button>
          <button type="button" className="upg__link" onClick={() => { onClose(); nav('/pricing'); }}>See all prices →</button>
        </div>
      </div>
    </div>
  );
}

/** "Premium" next to a template that needs the premium templates unlock. */
export function PlanBadge({ template }) {
  const { catalog, plan } = usePlan();
  if (!catalog || !catalog.enforced || !isPremiumTemplate(template, catalog)) return null;
  const included = hasFeature('templates', plan);
  return (
    <span className={`plan-badge plan-badge--starter ${included ? 'is-included' : ''}`}
      title={included ? 'Premium templates are unlocked on your account' : `Publishing with it needs the premium templates unlock (${unlockInfo('templates', catalog)?.credits ?? 300} credits, once)`}>
      {!included && (
        <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden><path d="M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3" /></svg>
      )}
      Premium
    </span>
  );
}
