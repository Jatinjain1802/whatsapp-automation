/*
  App.jsx — Root layout with sidebar navigation
  -----------------------------------------------------------------------
  KEY CONCEPTS:
  
  1. INLINE SVG ICONS — We embed SVG directly in JSX instead of using an
     icon library. This means zero extra dependencies and full control
     over styling via CSS (fill, opacity, size).
     
  2. NavLink — From react-router-dom. It automatically adds an "active"
     CSS class to the link that matches the current URL path.
     The `end` prop means it only matches EXACTLY that path (not children).
     
  3. LAYOUT — The sidebar is position:fixed in CSS, so the .content
     area uses margin-left to offset itself. This keeps the sidebar
     visible while content scrolls independently.
*/

import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import ImportContacts from './pages/ImportContacts.jsx';
import Groups from './pages/Groups.jsx';
import Contacts from './pages/Contacts.jsx';
import Templates from './pages/Templates.jsx';
import NewCampaign from './pages/NewCampaign.jsx';
import CampaignReport from './pages/CampaignReport.jsx';

/* 
  authed() checks if a JWT token exists in localStorage.
  localStorage persists even after closing the browser tab.
  This is a simple auth check — the real validation happens server-side.
*/
function authed() {
  return Boolean(localStorage.getItem('token'));
}

export default function App() {
  // If user is NOT logged in, only show Login/Register page
  if (!authed()) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        {/* 
          Navigate component redirects any unknown URL to /login.
          `replace` means it replaces the current history entry
          instead of adding a new one (so Back button doesn't loop).
        */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  // If user IS logged in, show the full dashboard layout
  return (
    <div className="layout">
      {/* ── SIDEBAR ────────────────────────────────────────────────── */}
      <nav className="sidebar">
        {/* Brand header with WhatsApp icon */}
        <div className="sidebar-brand">
          <div className="brand-icon">
            {/* WhatsApp phone icon SVG */}
            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
              <path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.832-1.438A9.955 9.955 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2zm0 18a8 8 0 01-4.107-1.134l-.293-.175-2.868.852.852-2.868-.175-.293A8 8 0 1112 20z" />
            </svg>
          </div>
          <h1>WA Automation</h1>
        </div>

        {/* 
          Navigation links — each has an inline SVG icon + text.
          `end` prop on "/" link prevents it from being active on every page.
        */}
        <NavLink to="/" end>
          {/* Dashboard icon — grid of squares */}
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 13h6a1 1 0 001-1V4a1 1 0 00-1-1H4a1 1 0 00-1 1v8a1 1 0 001 1zm0 8h6a1 1 0 001-1v-4a1 1 0 00-1-1H4a1 1 0 00-1 1v4a1 1 0 001 1zm10 0h6a1 1 0 001-1v-8a1 1 0 00-1-1h-6a1 1 0 00-1 1v8a1 1 0 001 1zm0-18v4a1 1 0 001 1h6a1 1 0 001-1V4a1 1 0 00-1-1h-6a1 1 0 00-1 1z"/></svg>
          <span>Dashboard</span>
        </NavLink>

        <NavLink to="/import">
          {/* Import icon — upload arrow */}
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19.35 10.04A7.49 7.49 0 0012 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 000 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z"/></svg>
          <span>Import Excel</span>
        </NavLink>

        <NavLink to="/groups">
          {/* Groups icon — people */}
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 12.75c1.63 0 3.07.39 4.24.9 1.08.48 1.76 1.56 1.76 2.73V18H6v-1.61c0-1.18.68-2.26 1.76-2.73 1.17-.52 2.61-.91 4.24-.91zM4 13c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm1.13 1.1c-.37-.06-.74-.1-1.13-.1-.99 0-1.93.21-2.78.58A2.01 2.01 0 000 16.43V18h4.5v-1.61c0-.83.23-1.61.63-2.29zM20 13c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm4 3.43c0-.81-.48-1.53-1.22-1.85A6.95 6.95 0 0020 14c-.39 0-.76.04-1.13.1.4.68.63 1.46.63 2.29V18H24v-1.57zM12 6c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3z"/></svg>
          <span>Groups</span>
        </NavLink>

        <NavLink to="/contacts">
          {/* Contacts icon — person with card */}
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H4V6h16v12zM4 0h16v2H4zm0 22h16v2H4zM12 12c1.38 0 2.5-1.12 2.5-2.5S13.38 7 12 7s-2.5 1.12-2.5 2.5S10.62 12 12 12zm0 1c-1.67 0-5 .84-5 2.5V17h10v-1.5c0-1.66-3.33-2.5-5-2.5z"/></svg>
          <span>Contacts</span>
        </NavLink>

        <NavLink to="/templates">
          {/* Templates icon — document */}
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm4 18H6V4h7v5h5v11zm-3-7H9v-2h6v2zm0 4H9v-2h6v2z"/></svg>
          <span>Templates</span>
        </NavLink>

        <NavLink to="/campaigns/new">
          {/* Campaign icon — megaphone / send */}
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
          <span>New Campaign</span>
        </NavLink>

        {/* Spacer pushes logout to bottom — uses flex:1 in CSS */}
        <div className="sidebar-spacer" />
        <div className="sidebar-divider" />

        <button
          className="link logout-btn"
          onClick={() => {
            localStorage.removeItem('token');
            location.href = '/login';
          }}
        >
          {/* Logout icon — exit door */}
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z"/></svg>
          <span>Log out</span>
        </button>
      </nav>

      {/* ── MAIN CONTENT ───────────────────────────────────────────── */}
      <main className="content">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/import" element={<ImportContacts />} />
          <Route path="/groups" element={<Groups />} />
          <Route path="/contacts" element={<Contacts />} />
          <Route path="/templates" element={<Templates />} />
          <Route path="/campaigns/new" element={<NewCampaign />} />
          <Route path="/campaigns/:id" element={<CampaignReport />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
