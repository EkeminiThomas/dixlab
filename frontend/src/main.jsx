import React, { lazy, Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import './styles.css';
import './sites.css';
import './cv.css';
import './case.css';
import './three.css'; // 3D templates: Blocks (portfolio) and Depth (case study)
import './theme-pro.css'; // Resend-inspired dark theme (swap back to './theme.css' for the original look)
import './product.css';
import './pricing.css';
import { syncProjects, refreshUser, refreshPlan, loadCatalog, isSignedIn } from './api.js';
import { useUser } from './components/ui.jsx';
import { UpgradeHost } from './components/Upgrade.jsx';
import Pricing from './pages/Pricing.jsx';
import BillingCallback from './pages/BillingCallback.jsx';
import Landing from './pages/Landing.jsx';
import SignUp from './pages/SignUp.jsx';
import LogIn from './pages/LogIn.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Editor from './pages/Editor.jsx';
import Portfolios from './pages/Portfolios.jsx';
import Cvs from './pages/Cvs.jsx';
import CaseStudies from './pages/CaseStudies.jsx';
import Interview from './pages/Interview.jsx';
import PublicPage from './pages/PublicPage.jsx';
import Account from './pages/Account.jsx';
import ForgotPassword from './pages/ForgotPassword.jsx';
import ResetPassword from './pages/ResetPassword.jsx';
import VerifyEmail from './pages/VerifyEmail.jsx';
import ConfirmEmail from './pages/ConfirmEmail.jsx';
import Recommend from './pages/Recommend.jsx';
import Review from './pages/Review.jsx';
import Gallery from './pages/Gallery.jsx';
// The admin dashboard loads only when an admin opens it.
const AdminLayout = lazy(() => import('./admin/AdminLayout.jsx'));
const AdminOverview = lazy(() => import('./admin/Overview.jsx'));
const AdminUsers = lazy(() => import('./admin/Users.jsx'));
const AdminUserDetail = lazy(() => import('./admin/UserDetail.jsx'));
const AdminPages = lazy(() => import('./admin/Pages.jsx'));
const AdminMessages = lazy(() => import('./admin/AdminMessages.jsx'));
const AdminStorage = lazy(() => import('./admin/Storage.jsx'));
const AdminActivity = lazy(() => import('./admin/Activity.jsx'));
const AdminSystem = lazy(() => import('./admin/System.jsx'));

/** The app's own pages: an account that still has to confirm its email goes to "Confirm your email" first. */
function RequireVerified() {
  const user = useUser();
  const loc = useLocation();
  if (isSignedIn() && user?.mustVerify) {
    return <Navigate to={`/confirm-email?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  }
  return <Outlet />;
}

// Custom domains: someone's published page on their own address (alexmorgan.com).
// Dixlab's own hosts skip the lookup; set VITE_APP_HOSTS (comma-separated) if the app has its own domain.
// Dixlab addresses live under SUB_BASE (ada.dixlab.click); the base itself and www are the app.
const SUB_BASE = String(import.meta.env.VITE_SUBDOMAIN_BASE || 'dixlab.click').toLowerCase();
const APP_HOSTS = ['localhost', '127.0.0.1', SUB_BASE, `www.${SUB_BASE}`, ...String(import.meta.env.VITE_APP_HOSTS || '').split(',').map((h) => h.trim()).filter(Boolean)];
const host = window.location.hostname.toLowerCase();
const appHost = APP_HOSTS.includes(host) || host.endsWith('.vercel.app');

async function domainSlug() {
  if (appHost) return null;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    const r = await fetch(`/api/domains/resolve?host=${encodeURIComponent(host)}`, { signal: ctrl.signal, headers: { 'X-Dixlab-Request': '1' } });
    clearTimeout(t);
    return r.ok ? (await r.json()).slug : null;
  } catch {
    return null;
  }
}

const root = ReactDOM.createRoot(document.getElementById('root'));
domainSlug().then((slug) => {
  if (slug) {
    root.render(
      <React.StrictMode>
        <BrowserRouter>
          <Routes>
            <Route path="/p/:slug/*" element={<PublicPage />} />
            <Route path="/*" element={<PublicPage domainSlug={slug} />} />
          </Routes>
        </BrowserRouter>
      </React.StrictMode>,
    );
    return;
  }
  // Bring this browser up to date with the account, and again whenever we come back online.
  refreshUser();
  syncProjects();
  loadCatalog();
  refreshPlan();
  window.addEventListener('online', () => syncProjects());
  renderApp();
});

function renderApp() {
root.render(
  <React.StrictMode>
    <BrowserRouter>
      <UpgradeHost />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/gallery" element={<Gallery />} />
        <Route path="/billing/callback" element={<BillingCallback />} />
        <Route path="/billing/callback/:ref" element={<BillingCallback />} />
        <Route path="/signup" element={<SignUp />} />
        <Route path="/login" element={<LogIn />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/verify-email" element={<VerifyEmail />} />
        <Route path="/confirm-email" element={<ConfirmEmail />} />
        <Route element={<RequireVerified />}>
        <Route path="/account" element={<Account />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/portfolio" element={<Portfolios />} />
        <Route path="/cv" element={<Cvs />} />
        <Route path="/case" element={<CaseStudies />} />
        <Route path="/interview/:id" element={<Interview />} />
        <Route path="/admin" element={<Suspense fallback={<div className="adm-denied"><span className="cz__spin" aria-label="Loading" /></div>}><AdminLayout /></Suspense>}>
          <Route index element={<AdminOverview />} />
          <Route path="users" element={<AdminUsers />} />
          <Route path="users/:id" element={<AdminUserDetail />} />
          <Route path="pages" element={<AdminPages />} />
          <Route path="messages" element={<AdminMessages />} />
          <Route path="storage" element={<AdminStorage />} />
          <Route path="activity" element={<AdminActivity />} />
          <Route path="system" element={<AdminSystem />} />
        </Route>
        <Route path="/editor" element={<Editor />} />
        <Route path="/editor/:id" element={<Editor />} />
        </Route>
        <Route path="/p/:slug/*" element={<PublicPage />} />
        <Route path="/recommend/:token" element={<Recommend />} />
        <Route path="/review/:token" element={<Review />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
}
