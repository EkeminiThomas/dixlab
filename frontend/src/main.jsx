import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './styles.css';
import './sites.css';
import './cv.css';
import './case.css';
import './theme-pro.css'; // Resend-inspired dark theme (swap back to './theme.css' for the original look)
import './product.css';
import { syncProjects, refreshUser } from './api.js';
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
import Messages from './pages/Messages.jsx';

// Bring this browser up to date with the account, and again whenever we come back online.
refreshUser();
syncProjects();
window.addEventListener('online', () => syncProjects());

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/signup" element={<SignUp />} />
        <Route path="/login" element={<LogIn />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/portfolio" element={<Portfolios />} />
        <Route path="/cv" element={<Cvs />} />
        <Route path="/case" element={<CaseStudies />} />
        <Route path="/interview/:id" element={<Interview />} />
        <Route path="/messages" element={<Messages />} />
        <Route path="/p/:slug/*" element={<PublicPage />} />
        <Route path="/editor" element={<Editor />} />
        <Route path="/editor/:id" element={<Editor />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
