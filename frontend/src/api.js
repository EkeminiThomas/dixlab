/* ==========================================================================
   Client for the Dixlab FastAPI backend (see /backend).
   Projects stay cached in this browser so the app keeps working offline;
   when you're signed in, every change is pushed to your account and the
   cache is reconciled with the server on start-up and after logging in.
   ========================================================================== */
import { useSyncExternalStore } from 'react';
import { loadProjects, saveProjects, saveUser, clearProjects } from './components/ui.jsx';

const TOKEN_KEY = 'dixlab.token';
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

export const getToken = () => read(TOKEN_KEY);
export const isSignedIn = () => Boolean(getToken());

/** fetch() wrapper: JSON in and out, bearer token, readable errors. */
export async function request(path, { method = 'GET', body, form } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  let res;
  try {
    res = await fetch(path, { method, headers, body: form ?? (body !== undefined ? JSON.stringify(body) : undefined) });
  } catch {
    throw new ApiError('Can’t reach the Dixlab server.', 0, true);
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    // The Vite dev proxy answers with an empty 5xx when the backend isn't running.
    const offline = !data && res.status >= 500;
    const message = typeof data?.detail === 'string' ? data.detail
      : Array.isArray(data?.detail) ? 'Check the details and try again.'
      : data?.error || (offline ? 'Can’t reach the Dixlab server.' : 'Something went wrong. Please try again.');
    if (res.status === 401 && token) signOutLocally(); // session expired or revoked
    const err = new ApiError(message, res.status, offline);
    err.body = data;
    throw err;
  }
  return data;
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

async function startSession({ token, user }) {
  // Never mix another account's cached work into this one.
  const owner = read(OWNER_KEY);
  if (owner && owner !== user.id) clearProjects();
  write(TOKEN_KEY, token);
  write(OWNER_KEY, user.id);
  saveUser(user);
  setStatus('idle');
  await syncProjects();
  return user;
}

export const signUp = ({ name, email, password }) =>
  request('/api/auth/signup', { method: 'POST', body: { name, email, password } }).then(startSession);

export const logIn = ({ email, password }) =>
  request('/api/auth/login', { method: 'POST', body: { email, password } }).then(startSession);

export async function logOut() {
  try { if (isSignedIn()) await request('/api/auth/logout', { method: 'POST' }); } catch { /* signing out locally anyway */ }
  signOutLocally();
}

function signOutLocally() {
  write(TOKEN_KEY, null);
  write(OWNER_KEY, null);
  write(TOMB_KEY, null);
  clearProjects();
  saveUser(null);
  setStatus('local');
}

/** Refresh the signed-in user's profile (name, email) from the server. */
export async function refreshUser() {
  if (!isSignedIn()) return null;
  try {
    const { user } = await request('/api/auth/me');
    saveUser(user);
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

/* ---------- Get in touch: visitors message a portfolio's owner ---------- */

export const sendContact = (slug, { name, email, message, website = '' }) =>
  request(`/api/public/${encodeURIComponent(slug)}/contact`, { method: 'POST', body: { name, email, message, website } });

let unread = 0;
const unreadSubs = new Set();
const setUnread = (n) => { if (n !== unread) { unread = n; unreadSubs.forEach((fn) => fn()); } };
/** Unread "Get in touch" messages, for the sidebar badge. */
export function useUnread() {
  return useSyncExternalStore((fn) => { unreadSubs.add(fn); return () => unreadSubs.delete(fn); }, () => unread);
}
export async function fetchMessages() {
  const data = await request('/api/messages');
  setUnread(data.unread);
  return data;
}
export async function markMessage(id, read = true) {
  await request(`/api/messages/${encodeURIComponent(id)}`, { method: 'PATCH', body: { read } });
}
export const deleteMessage = (id) => request(`/api/messages/${encodeURIComponent(id)}`, { method: 'DELETE' });
export const refreshUnread = () => (isSignedIn() ? fetchMessages().catch(() => null) : null);
export const adjustUnread = (delta) => setUnread(Math.max(0, unread + delta));

/* ---------- Interview (AI); see components/case/interview.js for the offline version ---------- */

export const interviewNext = (transcript, hint, kind = 'case') => request('/api/interview/next', { method: 'POST', body: { transcript, hint, kind } });
export const interviewDraft = (transcript, kind = 'case') => request('/api/interview/draft', { method: 'POST', body: { transcript, kind } });

/**
 * Upload a file as-is (videos, GIFs) with progress. Resolves to the server's
 * { url, type, size }. Needs an account.
 */
export function uploadFile(file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/uploads');
    const token = getToken();
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
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
