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

// Bring this browser up to date with the account, and again whenever we come back online.
refreshUser();
syncProjects();
loadCatalog();
refreshPlan();
window.addEventListener('online', () => syncProjects());

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <UpgradeHost />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/billing/callback" element={<BillingCallback />} />
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
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
