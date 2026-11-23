/* ==========================================================================
   Client for the Dixlab FastAPI backend (see /backend).
   Projects stay cached in this browser so the app keeps working offline;
   when you're signed in, every change is pushed to your account and the
   cache is reconciled with the server on start-up and after logging in.

   The login itself lives in an HttpOnly cookie set by the server: page
   scripts can't read it, so an injected script can't steal a session. The
   page only remembers *that* someone is signed in. Every request carries
   X-Dixlab-Request, which the server requires for changes (other sites
   can't add it, so they can't act in your name).
   ========================================================================== */
import { useSyncExternalStore } from 'react';
import { loadProjects, saveProjects, saveUser, loadUser, clearProjects, DEMO_NAME } from './components/ui.jsx';

const LEGACY_TOKEN_KEY = 'dixlab.token'; // old sessions kept the token here; moved to the cookie on load
const SIGNED_IN_KEY = 'dixlab.session'; // just a flag: the real session is the HttpOnly cookie
const OWNER_KEY = 'dixlab.owner';     // whose account the cached projects belong to
const TOMB_KEY = 'dixlab.deleted';    // deletions made while offline

const read = (k, fallback = null) => { try { return localStorage.getItem(k) ?? fallback; } catch { return fallback; } };
const write = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* storage blocked */ } };

export class ApiError extends Error {
  constructor(message, status, offline = false) {
    super(message);
    this.status = status;
    this.offline = offline;
  }
}

export const isSignedIn = () => Boolean(read(SIGNED_IN_KEY) || read(LEGACY_TOKEN_KEY));
const BASE_HEADERS = { 'X-Dixlab-Request': '1' };

/** fetch() wrapper: JSON in and out, the session cookie, readable errors. */
const AI_PATHS = ['/api/customize', '/api/interview/draft', '/api/assist/'];

export async function request(path, { method = 'GET', body, form } = {}) {
  const headers = { ...BASE_HEADERS };
  const legacy = read(LEGACY_TOKEN_KEY);
  if (legacy) headers.Authorization = `Bearer ${legacy}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  let res;
  try {
    res = await fetch(path, { method, headers, credentials: 'same-origin', body: form ?? (body !== undefined ? JSON.stringify(body) : undefined) });
  } catch {
    throw new ApiError('Can’t reach the Dixlab server.', 0, true);
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    // The Vite dev proxy answers with an empty 5xx when the backend isn't running.
    const offline = !data && res.status >= 500;
    // A gateway timeout (the server was reached but took too long, e.g. a slow payment provider) isn't "unreachable".
    const slow = !data && [504, 524].includes(res.status);
    const message = typeof data?.detail === 'string' ? data.detail
      : Array.isArray(data?.detail) ? 'Check the details and try again.'
      : data?.detail?.message || data?.error
        || (slow ? 'That took too long to answer. Please try again in a moment.' : offline ? 'Can’t reach the Dixlab server.' : 'Something went wrong. Please try again.');
    if (res.status === 401 && isSignedIn() && !path.startsWith('/api/auth/login') && !path.startsWith('/api/public/')) signOutLocally(); // session expired or revoked
    // The account must confirm its email first: the app's pages send it to "Confirm your email".
    if (res.status === 403 && data?.detail?.code === 'email_unverified' && !loadUser().mustVerify) saveUser({ ...loadUser(), mustVerify: true });
    const err = new ApiError(message, res.status, offline);
    err.body = data;
    // Something to unlock with credits (a premium template, room for another project...), or not
    // enough credits: offer the unlock, or a credit pack.
    if (res.status === 402 && data?.detail?.code) openUpgrade(data.detail);
    // Out of credits for an AI action: the app still falls back to its built-in helper, but says why.
    if (res.status === 402 && data?.code === 'ai_credits') openUpgrade({ code: 'ai_credits', message: data.error });
    throw err;
  }
  if (method === 'POST' && AI_PATHS.some((p) => path.startsWith(p))) refreshPlan(); // credits used: update the balance
  return data;
}

/* ---------- Plans and billing ---------- */

/** Ask the app to show its credits dialog ({ code, message, feature?, credits? }). */
export function openUpgrade(detail = {}) {
  try { window.dispatchEvent(new CustomEvent('dixlab:upgrade', { detail })); } catch { /* no window (tests) */ }
}

let catalog = null;          // GET /api/billing/plans (public)
let catalogLoad = null;
let plan = null;             // GET /api/billing/me (signed in): credits, features, limits
const planSubs = new Set();
let planVersion = 0;
const notifyPlan = () => { planVersion += 1; planSubs.forEach((fn) => fn()); };

export function loadCatalog() {
  catalogLoad ??= request('/api/billing/plans').then((c) => { catalog = c; notifyPlan(); return c; }).catch(() => { catalogLoad = null; return null; });
  return catalogLoad;
}
export async function refreshPlan() {
  if (!isSignedIn()) { plan = null; notifyPlan(); return null; }
  try { plan = await request('/api/billing/me'); } catch { /* keep what we had */ }
  notifyPlan();
  return plan;
}
const setPlan = (next) => { plan = next; notifyPlan(); return next; };
/** { catalog, plan } kept fresh across the app. plan (the account's credits and unlocks) is null when signed out. */
export function usePlan() {
  useSyncExternalStore((fn) => { planSubs.add(fn); return () => planSubs.delete(fn); }, () => planVersion);
  return { catalog, plan };
}

/** PDF export is for everyone. */
export const pdfAllowed = () => true;

/** Has the account unlocked this feature (templates, insights, domain, password, branding)? True when limits are off. */
export function hasFeature(feature, p = plan) {
  return !p?.enforced || Boolean(p.features?.[feature]);
}
/** A template that needs the premium templates unlock. */
export const isPremiumTemplate = (key, cat = catalog) => Boolean(cat) && !cat.freeTemplates.includes(key);
/** The unlock's details from the catalog ({ id, name, credits, desc, stack }). */
export const unlockInfo = (feature, cat = catalog) => cat?.unlocks.find((u) => u.id === feature) || null;

/** Price as text, e.g. "$3.99" or "₦3,000". Amounts are in the smallest unit (cents, kobo). */
export function formatPrice(amount, currency = 'USD') {
  const value = amount / 100;
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, currencyDisplay: 'narrowSymbol', maximumFractionDigits: Number.isInteger(value) ? 0 : 2 }).format(value);
  } catch { return `${currency} ${value.toFixed(2)}`; }
}

/* Billing currency: Nigeria pays in naira, everyone else in dollars. The first
   guess comes from the time zone and language; people can switch before paying. */
const CURRENCY_KEY = 'dixlab.currency';
function guessCurrency() {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    const langs = navigator.languages || [navigator.language || ''];
    if (tz === 'Africa/Lagos' || langs.some((l) => /-NG$/i.test(l))) return 'NGN';
  } catch { /* fall through */ }
  return 'USD';
}
export function getCurrency() {
  const saved = read(CURRENCY_KEY);
  return saved === 'NGN' || saved === 'USD' ? saved : guessCurrency();
}
export function setCurrency(currency) { write(CURRENCY_KEY, currency); notifyPlan(); }

/**
 * Is there room for another project? Returns null when there is (or it isn't known),
 * else the credits dialog's details. Same rule as the server, checked first so
 * nobody starts work they can't save.
 */
export function projectRoom(type, projects) {
  if (!isSignedIn() || !plan?.enforced) return null;
  const total = plan.limits.projects;
  if (total != null && projects.filter((p) => !p.sample).length >= total) {
    return { code: 'unlock_needed', feature: 'project', credits: unlockInfo('project')?.credits,
      message: `You have room for ${total === 1 ? 'one project' : `${total} projects`}. Add room for another with credits (it’s yours for good), or delete one you no longer need.` };
  }
  return null;
}

/** Buy a credit pack: goes to Bachs's checkout page (resolves only if the redirect couldn't happen). */
export async function buyCredits(pack, currency = getCurrency()) {
  const res = await request('/api/billing/checkout', { method: 'POST', body: { pack, currency } });
  if (res.url) window.location.assign(res.url);
  return res;
}
/** Spend credits on a feature, for good. Resolves to the updated account. */
export const unlockFeature = (feature) => request('/api/billing/unlock', { method: 'POST', body: { feature } }).then(setPlan);
/** After Bachs's checkout (?checkout_id=...): confirm it and add the credits. */
export const verifyPayment = (checkoutId, ref = '') =>
  request(`/api/billing/verify?checkout_id=${encodeURIComponent(checkoutId || '')}&ref=${encodeURIComponent(ref || '')}`).then((r) => { setPlan(r.billing); return r; });
export const cancelPlan = () => request('/api/billing/cancel', { method: 'POST' }).then(setPlan);
export const requestRefund = (reference) => request('/api/billing/refund', { method: 'POST', body: { reference } }).then(setPlan);
export async function manageCard() {
  const { url } = await request('/api/billing/manage');
  if (url) window.location.assign(url);
}

/* ---------- Sync status (for "Saved to your account" etc.) ---------- */

let status = isSignedIn() ? 'idle' : 'local'; // local | idle | syncing | saved | offline | error
const statusSubs = new Set();
function setStatus(next) {
  if (next === status) return;
  status = next;
  statusSubs.forEach((fn) => fn());
}
export function useSyncStatus() {
  return useSyncExternalStore((fn) => { statusSubs.add(fn); return () => statusSubs.delete(fn); }, () => status);
}

/* ---------- Accounts ---------- */

/**
 * Projects made before signing up (or before a rename) can still carry the sample
 * name "Alex Morgan" or the person's old name: give them the account's name.
 */
function adoptName(user, old = []) {
  const name = (user?.name || '').trim();
  if (!name) return;
  const from = new Set(['', DEMO_NAME.toLowerCase(), ...old.map((n) => String(n || '').trim().toLowerCase())]);
  const changed = [];
  const next = loadProjects().map((p) => {
    if (p.sample || !from.has(String(p.name ?? '').trim().toLowerCase()) || p.name === name) return p;
    const q = { ...p, name, updatedAt: Date.now() };
    changed.push(q);
    return q;
  });
  if (!changed.length) return;
  saveProjects(next);
  changed.forEach((p) => pushProject(p));
}

async function startSession({ user }) {
  // Never mix another account's cached work into this one.
  const owner = read(OWNER_KEY);
  if (owner && owner !== user.id) clearProjects();
  write(LEGACY_TOKEN_KEY, null);
  write(SIGNED_IN_KEY, '1');
  write(OWNER_KEY, user.id);
  saveUser(user);
  setStatus('idle');
  await syncProjects();
  adoptName(user);
  refreshPlan();
  return user;
}

export const signUp = ({ name, email, password }) =>
  request('/api/auth/signup', { method: 'POST', body: { name, email, password } }).then(startSession);

/** Log in. With two-step login on, the first try (no code) fails with
    err.body.code === 'two_factor_required'; send it again with `code`. */
export const logIn = ({ email, password, code }) =>
  request('/api/auth/login', { method: 'POST', body: { email, password, ...(code ? { code } : {}) } }).then(startSession);

/* ---------- Two-step login ---------- */

export const twoFactorStatus = () => request('/api/auth/2fa');
export const twoFactorSetup = (password) => request('/api/auth/2fa/setup', { method: 'POST', body: { password } });
export async function twoFactorEnable(code) {
  const res = await request('/api/auth/2fa/enable', { method: 'POST', body: { code } });
  await refreshUser();
  return res;
}
export async function twoFactorDisable(password, code) {
  const res = await request('/api/auth/2fa/disable', { method: 'POST', body: { password, code } });
  await refreshUser();
  return res;
}
export const twoFactorNewCodes = (password, code) => request('/api/auth/2fa/recovery-codes', { method: 'POST', body: { password, code } });

/* ---------- Account self-service ---------- */

export const resendVerification = () => request('/api/auth/verify/send', { method: 'POST' });
/** The 6-digit code from the confirmation email. */
export async function verifyCode(code) {
  const res = await request('/api/auth/verify/code', { method: 'POST', body: { code } });
  await refreshUser();
  return res;
}
/** Fix a mistyped address before it's confirmed (a new code is sent there). */
export async function changeUnverifiedEmail(email, password) {
  const res = await request('/api/auth/email', { method: 'POST', body: { email, password } });
  await refreshUser();
  return res;
}
export async function verifyEmail(token) {
  const res = await request('/api/auth/verify', { method: 'POST', body: { token } });
  if (isSignedIn()) await refreshUser();
  return res;
}
export const forgotPassword = (email) => request('/api/auth/password/forgot', { method: 'POST', body: { email } });
export const resetPassword = (token, password) => request('/api/auth/password/reset', { method: 'POST', body: { token, password } });
export const changePassword = (current, password) => request('/api/auth/password/change', { method: 'POST', body: { current, password } });
export async function updateName(name) {
  const before = loadUser().name;
  const { user } = await request('/api/auth/me', { method: 'PATCH', body: { name } });
  saveUser(user);
  adoptName(user, [before]); // projects still showing the old name follow the new one
  return user;
}
/** Permanently delete the signed-in account, then forget it in this browser. */
export async function deleteAccount(password) {
  await request('/api/auth/me', { method: 'DELETE', body: { password } });
  signOutLocally();
}

/** Where someone lands after logging in: admins go to the admin dashboard. */
export const homeFor = (user) => (user?.mustVerify ? '/confirm-email' : user?.isAdmin ? '/admin' : '/dashboard');

/** A ?next= page to return to after logging in, only if it's a page on Dixlab itself. */
export function nextPage(search = window.location.search) {
  const next = new URLSearchParams(search).get('next') || '';
  return /^\/(?![/\\])/.test(next) ? next : null;
}

export async function logOut() {
  try { if (isSignedIn()) await request('/api/auth/logout', { method: 'POST' }); } catch { /* signing out locally anyway */ }
  signOutLocally();
}

function signOutLocally() {
  write(LEGACY_TOKEN_KEY, null);
  write(SIGNED_IN_KEY, null);
  write(OWNER_KEY, null);
  write(TOMB_KEY, null);
  clearProjects();
  saveUser(null);
  setStatus('local');
  plan = null;
  notifyPlan();
}

/** Refresh the signed-in user's profile (name, email) from the server. */
export async function refreshUser() {
  if (!isSignedIn()) return null;
  try {
    // Sessions from before the cookie change: move the token into the cookie, then forget it here.
    if (read(LEGACY_TOKEN_KEY)) {
      const { user } = await request('/api/auth/adopt', { method: 'POST' });
      write(LEGACY_TOKEN_KEY, null);
      write(SIGNED_IN_KEY, '1');
      saveUser(user);
      return user;
    }
    const { user } = await request('/api/auth/me');
    saveUser(user);
    adoptName(user);
    return user;
  } catch { return null; }
}

/* ---------- Projects ---------- */

const timers = new Map();

/** Save one project to the account (debounced, so typing doesn't flood the API). */
export function pushProject(project) {
  if (!isSignedIn() || project.sample) return;
  clearTimeout(timers.get(project.id));
  setStatus('syncing');
  timers.set(project.id, setTimeout(async () => {
    timers.delete(project.id);
    try {
      await request(`/api/projects/${encodeURIComponent(project.id)}`, { method: 'PUT', body: project });
      if (!timers.size) setStatus('saved');
    } catch (e) {
      setStatus(e.offline ? 'offline' : 'error');
    }
  }, 700));
}

/** Delete one project from the account; remembered and retried if offline. */
export async function removeProject(id) {
  if (!isSignedIn()) return;
  clearTimeout(timers.get(id));
  timers.delete(id);
  try {
    await request(`/api/projects/${encodeURIComponent(id)}`, { method: 'DELETE' });
  } catch (e) {
    if (e.offline) {
      const tomb = new Set(JSON.parse(read(TOMB_KEY, '[]')));
      tomb.add(id);
      write(TOMB_KEY, JSON.stringify([...tomb]));
      setStatus('offline');
    }
  }
}

/** Fetch one project (e.g. when opening /editor/:id on a new device). */
export async function fetchProject(id) {
  if (!isSignedIn()) return null;
  try { return (await request(`/api/projects/${encodeURIComponent(id)}`)).project; } catch { return null; }
}

let syncing = null;

/**
 * Reconcile this browser with the account: replay offline deletions, upload
 * anything newer here, then take the server's list as the source of truth.
 * Sample projects (the demo content) are never uploaded.
 */
export function syncProjects() {
  if (!isSignedIn()) return Promise.resolve();
  syncing ??= (async () => {
    setStatus('syncing');
    try {
      for (const id of JSON.parse(read(TOMB_KEY, '[]'))) {
        await request(`/api/projects/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch((e) => { if (e.offline) throw e; });
      }
      write(TOMB_KEY, null);
      const { projects: remote } = await request('/api/projects');
      const merged = new Map(remote.map((p) => [p.id, p]));
      for (const p of loadProjects().filter((x) => !x.sample)) {
        const r = merged.get(p.id);
        if (r && (r.updatedAt || 0) >= (p.updatedAt || 0)) continue;
        try {
          await request(`/api/projects/${encodeURIComponent(p.id)}`, { method: 'PUT', body: p });
          merged.set(p.id, p);
        } catch (e) {
          if (e.offline) throw e; // otherwise skip this one and keep going
        }
      }
      saveProjects([...merged.values()].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)));
      setStatus('saved');
    } catch (e) {
      setStatus(e.offline ? 'offline' : 'error');
    } finally {
      syncing = null;
    }
  })();
  return syncing;
}

/* ---------- Uploads ---------- */

/**
 * Upload an image (a data: URL from the browser's resize step) and return its
 * URL on the server. Signed out or offline, the data URL itself is kept.
 */
export async function uploadImage(dataUrl) {
  if (!isSignedIn()) return dataUrl;
  try {
    const blob = await (await fetch(dataUrl)).blob();
    const form = new FormData();
    form.append('file', blob, 'image.jpg');
    const { url } = await request('/api/uploads', { method: 'POST', form });
    return url;
  } catch {
    return dataUrl;
  }
}

/** Save a project right away (skipping the autosave delay), e.g. before publishing. */
export async function saveProjectNow(project) {
  clearTimeout(timers.get(project.id));
  timers.delete(project.id);
  const { project: saved } = await request(`/api/projects/${encodeURIComponent(project.id)}`, { method: 'PUT', body: project });
  setStatus('saved');
  return saved;
}

/* ---------- Publishing ---------- */

export const publishUrl = (slug) => `${window.location.origin}/p/${slug}`;
export const getPublishStatus = (id) => request(`/api/projects/${encodeURIComponent(id)}/publish`);
export async function publishProject(project) {
  await saveProjectNow(project);
  return request(`/api/projects/${encodeURIComponent(project.id)}/publish`, { method: 'POST' });
}
export const unpublishProject = (id) => request(`/api/projects/${encodeURIComponent(id)}/publish`, { method: 'DELETE' });
export const fetchPublic = (slug) => request(`/api/public/${encodeURIComponent(slug)}`);
export const unlockPublic = (slug, password) => request(`/api/public/${encodeURIComponent(slug)}/unlock`, { method: 'POST', body: { password } });
export const setGalleryListing = (id, listed) => request(`/api/projects/${encodeURIComponent(id)}/publish/gallery`, { method: 'PUT', body: { listed } });
export const fetchGallery = (kind = 'all') => request(`/api/gallery?kind=${encodeURIComponent(kind)}`);
export const getDomain = (id) => request(`/api/projects/${encodeURIComponent(id)}/domain`);
export const setDomain = (id, domain) => request(`/api/projects/${encodeURIComponent(id)}/domain`, { method: 'PUT', body: { domain } });
export const checkDomain = (id) => request(`/api/projects/${encodeURIComponent(id)}/domain/check`, { method: 'POST' });
export const removeDomain = (id) => request(`/api/projects/${encodeURIComponent(id)}/domain`, { method: 'DELETE' });
export const setSubdomain = (id, name) => request(`/api/projects/${encodeURIComponent(id)}/subdomain`, { method: 'PUT', body: { name } });
export const removeSubdomain = (id) => request(`/api/projects/${encodeURIComponent(id)}/subdomain`, { method: 'DELETE' });
export const setPagePassword = (id, password) => request(`/api/projects/${encodeURIComponent(id)}/publish/password`, { method: 'PUT', body: { password } });

/* ---------- Testimonials and feedback links ---------- */
const pid = (id) => encodeURIComponent(id);
export const getInvite = (id, kind) => request(`/api/projects/${pid(id)}/invites/${kind}`);
export async function makeInvite(project, kind) {
  await saveProjectNow(project);
  return request(`/api/projects/${pid(project.id)}/invites/${kind}`, { method: 'POST' });
}
export const stopInvite = (id, kind) => request(`/api/projects/${pid(id)}/invites/${kind}`, { method: 'DELETE' });
export const openInvite = (token) => request(`/api/invites/${encodeURIComponent(token)}`);
export const sendTestimonial = (token, body) => request(`/api/invites/${encodeURIComponent(token)}/testimonial`, { method: 'POST', body });
export const sendFeedback = (token, body) => request(`/api/invites/${encodeURIComponent(token)}/feedback`, { method: 'POST', body });
export const listTestimonials = (id) => request(`/api/projects/${pid(id)}/testimonials`);
export const setTestimonial = (tid, status) => request(`/api/testimonials/${encodeURIComponent(tid)}`, { method: 'PATCH', body: { status } });
export const deleteTestimonial = (tid) => request(`/api/testimonials/${encodeURIComponent(tid)}`, { method: 'DELETE' });
export const listFeedback = (id) => request(`/api/projects/${pid(id)}/feedback`);
export const resolveFeedback = (fid, resolved) => request(`/api/feedback/${encodeURIComponent(fid)}`, { method: 'PATCH', body: { resolved } });
export const deleteFeedback = (fid) => request(`/api/feedback/${encodeURIComponent(fid)}`, { method: 'DELETE' });

/** A visitor did something on a published page (where they came from, what they opened, how far
    they scrolled). Fire-and-forget: it never slows the page or shows an error. */
export function pageEvent(slug, kind, key = '') {
  try {
    fetch(`/api/public/${encodeURIComponent(slug)}/event`, {
      method: 'POST', keepalive: true, credentials: 'same-origin',
      headers: { ...BASE_HEADERS, 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, key: String(key).slice(0, 300) }),
    }).catch(() => {});
  } catch { /* old browsers: skip */ }
}
export const projectAnalytics = (projectId, days = 30) => request(`/api/projects/${encodeURIComponent(projectId)}/analytics?days=${days}`);

/* ---------- Get in touch: visitors message a portfolio's owner ---------- */

export const sendContact = (slug, { name, email, message, website = '' }) =>
  request(`/api/public/${encodeURIComponent(slug)}/contact`, { method: 'POST', body: { name, email, message, website } });


/* ---------- Interview (AI); see components/case/interview.js for the offline version ---------- */

export const interviewNext = (transcript, hint, kind = 'case') => request('/api/interview/next', { method: 'POST', body: { transcript, hint, kind } });
export const assistCaseLinks = (body) => request('/api/assist/case-from-links', { method: 'POST', body });
export const caseProjects = (body) => request('/api/assist/case-projects', { method: 'POST', body });
export const caseCheck = (c) => request('/api/assist/case-check', { method: 'POST', body: { case: c } });
export const cvCheck = (cv) => request('/api/assist/cv-check', { method: 'POST', body: { cv } });
export const assistTailorCv = (body) => request('/api/assist/tailor-cv', { method: 'POST', body });
export const assistProfiles = (body) => request('/api/assist/profiles', { method: 'POST', body });
export const interviewDraft = (transcript, kind = 'case') => request('/api/interview/draft', { method: 'POST', body: { transcript, kind } });

/**
 * Upload a file as-is (videos, GIFs) with progress. Resolves to the server's
 * { url, type, size }. Needs an account.
 */
export function uploadFile(file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/uploads');
    xhr.withCredentials = true;
    xhr.setRequestHeader('X-Dixlab-Request', '1');
    const legacy = read(LEGACY_TOKEN_KEY);
    if (legacy) xhr.setRequestHeader('Authorization', `Bearer ${legacy}`);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress?.(e.loaded / e.total); };
    xhr.onload = () => {
      let data = null;
      try { data = JSON.parse(xhr.responseText); } catch { /* not JSON */ }
      if (xhr.status >= 200 && xhr.status < 300) return resolve(data);
      reject(new ApiError(typeof data?.detail === 'string' ? data.detail : 'Upload failed. Please try again.', xhr.status, !data && xhr.status >= 500));
    };
    xhr.onerror = () => reject(new ApiError('Can’t reach the Dixlab server.', 0, true));
    const form = new FormData();
    form.append('file', file);
    xhr.send(form);
  });
}

/* ---------- Admin dashboard (admins only; the server checks every call) ---------- */

const qs = (params = {}) => {
  const p = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== '' && v != null && v !== 'all'));
  const s = p.toString();
  return s ? `?${s}` : '';
};
const enc = encodeURIComponent;
export const admin = {
  overview: (days = 30) => request(`/api/admin/overview?days=${days}`),
  users: (params) => request(`/api/admin/users${qs(params)}`),
  user: (id) => request(`/api/admin/users/${enc(id)}`),
  suspend: (id, reason = '') => request(`/api/admin/users/${enc(id)}/suspend`, { method: 'POST', body: { reason } }),
  unsuspend: (id) => request(`/api/admin/users/${enc(id)}/unsuspend`, { method: 'POST' }),
  signOutUser: (id) => request(`/api/admin/users/${enc(id)}/signout`, { method: 'POST' }),
  setAdmin: (id, isAdmin) => request(`/api/admin/users/${enc(id)}/admin`, { method: 'PATCH', body: { isAdmin } }),
  setPlan: (id, plan) => request(`/api/admin/users/${enc(id)}/plan`, { method: 'PATCH', body: { plan } }),
  giveCredits: (id, amount, note = '') => request(`/api/admin/users/${enc(id)}/credits`, { method: 'POST', body: { amount, note } }),
  deleteUser: (id, email) => request(`/api/admin/users/${enc(id)}`, { method: 'DELETE', body: { email } }),
  pages: (params) => request(`/api/admin/pages${qs(params)}`),
  takedown: (slug, reason = '') => request(`/api/admin/pages/${enc(slug)}/takedown`, { method: 'POST', body: { reason } }),
  gallery: (slug, status) => request(`/api/admin/pages/${enc(slug)}/gallery`, { method: 'POST', body: { status } }),
  messages: (page = 1) => request(`/api/admin/messages?page=${page}`),
  deleteMessage: (id) => request(`/api/admin/messages/${enc(id)}`, { method: 'DELETE' }),
  storage: () => request('/api/admin/storage'),
  cleanup: () => request('/api/admin/storage/cleanup', { method: 'POST' }),
  activity: (params) => request(`/api/admin/activity${qs(params)}`),
  system: () => request('/api/admin/system'),
  /** Download the users CSV as a file. */
  async exportUsers(params) {
    const res = await fetch(`/api/admin/users.csv${qs(params)}`, { headers: BASE_HEADERS, credentials: 'same-origin' });
    if (!res.ok) throw new ApiError('Couldn’t export users.', res.status);
    const url = URL.createObjectURL(await res.blob());
    const a = Object.assign(document.createElement('a'), { href: url, download: `dixlab-users-${new Date().toISOString().slice(0, 10)}.csv` });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
};
