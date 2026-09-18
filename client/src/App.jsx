import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import ImportContacts from './pages/ImportContacts.jsx';
import Groups from './pages/Groups.jsx';
import Contacts from './pages/Contacts.jsx';
import Templates from './pages/Templates.jsx';
import NewCampaign from './pages/NewCampaign.jsx';
import CampaignReport from './pages/CampaignReport.jsx';

function authed() {
  return Boolean(localStorage.getItem('token'));
}

export default function App() {
  if (!authed()) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }
  return (
    <div className="layout">
      <nav className="sidebar">
        <h1>WA Automation</h1>
        <NavLink to="/">Dashboard</NavLink>
        <NavLink to="/import">Import Excel</NavLink>
        <NavLink to="/groups">Groups</NavLink>
        <NavLink to="/contacts">Contacts</NavLink>
        <NavLink to="/templates">Templates</NavLink>
        <NavLink to="/campaigns/new">New Campaign</NavLink>
        <button
          className="link"
          onClick={() => {
            localStorage.removeItem('token');
            location.href = '/login';
          }}
        >
          Log out
        </button>
      </nav>
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
