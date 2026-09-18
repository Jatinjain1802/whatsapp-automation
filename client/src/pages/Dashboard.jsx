/*
  Dashboard.jsx — Main landing page showing campaign list
  -----------------------------------------------------------------------
  KEY CONCEPTS:
  
  1. useEffect — Runs side effects (API calls, timers, etc.) after render.
     The empty array [] as the second argument means "run ONCE on mount".
     Without [], it would re-run after EVERY render — causing infinite loops!
     
  2. .then() CHAIN — `api.get().then(res => ...)` is Promise-based.
     When the HTTP request completes, .then() receives the response.
     .catch(() => {}) silently handles errors (not ideal in production,
     but keeps the UI from crashing on network failures).
     
  3. COMPONENT EXPORT — StatusBadge is exported as a NAMED export
     (not default). Other files import it with: import { StatusBadge } from './Dashboard.jsx'
     A file can have ONE default export and MANY named exports.
*/

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';

export default function Dashboard() {
  const [campaigns, setCampaigns] = useState([]);

  useEffect(() => {
    api.get('/campaigns').then((res) => setCampaigns(res.data)).catch(() => {});
  }, []);  // ← empty dependency array = run once on mount

  return (
    <div className="page">
      {/* Page header with title and description */}
      <div className="page-header">
        <h2>Campaigns</h2>
        <p>Track all your WhatsApp broadcast campaigns, monitor delivery rates, and view detailed reports.</p>
      </div>

      <div className="card">
        {campaigns.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Template</th>
                <th>Status</th>
                <th>Sent</th>
                <th>Delivered</th>
                <th>Read</th>
                <th>Failed</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {/* 
                .map() transforms each campaign object into a <tr> element.
                The `key` prop helps React identify which rows changed/added/removed.
                Always use a unique ID — never use array index as key if list can reorder.
              */}
              {campaigns.map((c) => (
                <tr key={c._id}>
                  <td style={{ color: 'var(--color-text)', fontWeight: 500 }}>{c.name}</td>
                  <td>{c.template?.name}</td>
                  <td><StatusBadge status={c.status} /></td>
                  <td>{c.stats?.sent ?? 0}</td>
                  <td>{c.stats?.delivered ?? 0}</td>
                  <td>{c.stats?.read ?? 0}</td>
                  <td>{c.stats?.failed ?? 0}</td>
                  <td><Link to={`/campaigns/${c._id}`}>Report →</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          /* Empty state — shown when there are no campaigns yet */
          <div className="empty-state">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12zM11 5h2v6h-2zm0 8h2v2h-2z"/>
            </svg>
            <p>No campaigns yet. Import contacts, get a template approved, then create your first campaign.</p>
          </div>
        )}
      </div>
    </div>
  );
}

/*
  StatusBadge — Reusable component for showing colored status pills.
  -----------------------------------------------------------------------
  This pattern is called a "lookup object" — faster and cleaner than
  a big if/else or switch statement. The [status] at the end uses
  bracket notation to look up the color for the given status string.
  The || 'gray' is a fallback if the status doesn't match any key.
*/
export function StatusBadge({ status }) {
  const color = {
    APPROVED: 'green', completed: 'green', opted_in: 'green',
    PENDING: 'yellow', sending: 'yellow', queuing: 'yellow', scheduled: 'yellow', unknown: 'yellow',
    REJECTED: 'red', failed: 'red', opted_out: 'red', PAUSED: 'red',
  }[status] || 'gray';
  return <span className={`badge ${color}`}>{status}</span>;
}
