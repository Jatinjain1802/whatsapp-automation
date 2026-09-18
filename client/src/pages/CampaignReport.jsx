/*
  CampaignReport.jsx — Live campaign status & message-level details
  -----------------------------------------------------------------------
  KEY CONCEPTS:
  
  1. useParams — React Router hook that extracts URL parameters.
     For route "/campaigns/:id", useParams() returns { id: "abc123" }.
     The colon (:) in the route definition marks it as a dynamic segment.
     
  2. setInterval — Calls a function repeatedly at a fixed time interval.
     Here we poll every 5 seconds for live status updates while campaign sends.
     The cleanup function `return () => clearInterval(timer)` prevents
     memory leaks when the component unmounts or dependencies change.
     
  3. Blob + URL.createObjectURL — To export a CSV file without a server:
     - Create a Blob (binary large object) from a CSV string
     - Generate a temporary URL pointing to that Blob
     - Create an invisible <a> tag, set its href, and click it
     - Revoke the URL to free memory
     This is called "client-side file generation" — no server needed!
     
  4. useEffect CLEANUP — The function returned from useEffect is called
     when the component unmounts OR before the effect re-runs. This is
     where you clean up timers, event listeners, or subscriptions.
*/

import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api.js';
import { StatusBadge } from './Dashboard.jsx';

export default function CampaignReport() {
  const { id } = useParams();
  const [campaign, setCampaign] = useState(null);
  const [messages, setMessages] = useState([]);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    const load = () => {
      api.get(`/campaigns/${id}`).then((res) => setCampaign(res.data)).catch(() => {});
      api.get(`/campaigns/${id}/messages`, { params: filter ? { status: filter } : {} })
        .then((res) => setMessages(res.data)).catch(() => {});
    };
    load();
    // Poll every 5 seconds for live status updates
    const timer = setInterval(load, 5000);
    // Cleanup — runs when component unmounts or when id/filter changes
    return () => clearInterval(timer);
  }, [id, filter]);

  // Show loading state while campaign data is being fetched
  if (!campaign) {
    return (
      <div className="page">
        <div className="page-header">
          <h2>Loading campaign...</h2>
        </div>
      </div>
    );
  }

  const s = campaign.stats || {};

  function exportFailedCsv() {
    // Build CSV rows — header row first, then data rows
    const rows = [['name', 'phone', 'error_code', 'error_message']];
    messages
      .filter((m) => m.status === 'failed')
      .forEach((m) => rows.push([
        m.contact?.name || '',
        m.phone,
        m.errorCode,
        (m.errorMessage || '').replaceAll(',', ' ')  // Remove commas to prevent CSV column splits
      ]));
    const csv = rows.map((r) => r.join(',')).join('\n');
    // Create a downloadable file from the CSV string
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `campaign-${id}-failed.csv`;
    a.click();
    URL.revokeObjectURL(url);  // Free the memory
  }

  return (
    <div className="page">
      <div className="page-header">
        <h2>{campaign.name}</h2>
        <p>Live campaign report — auto-refreshes every 5 seconds while sending.</p>
      </div>

      {/* ── STATS OVERVIEW ─────────────────────────────────────────── */}
      <div className="stats" style={{ marginBottom: 24 }}>
        <div className="stat stat-info">
          <div className="num">{s.total ?? 0}</div>
          <div className="label">Recipients</div>
        </div>
        <div className="stat" style={{ borderTopColor: 'var(--color-primary)' }}>
          <div className="num">{s.sent ?? 0}</div>
          <div className="label">Sent</div>
        </div>
        <div className="stat stat-success">
          <div className="num">{s.delivered ?? 0}</div>
          <div className="label">Delivered</div>
        </div>
        <div className="stat" style={{ borderTopColor: '#818cf8' }}>
          <div className="num">{s.read ?? 0}</div>
          <div className="label">Read</div>
        </div>
        <div className="stat stat-error">
          <div className="num">{s.failed ?? 0}</div>
          <div className="label">Failed</div>
        </div>
        <div className="stat stat-warning">
          <div className="num">{s.skippedNoConsent ?? 0}</div>
          <div className="label">No opt-in</div>
        </div>
      </div>

      {/* ── MESSAGE TABLE ──────────────────────────────────────────── */}
      <div className="card">
        {/* Filter bar */}
        <div className="filter-bar">
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">All statuses</option>
            {['queued', 'sent', 'delivered', 'read', 'failed', 'skipped'].map((st) => (
              <option key={st} value={st}>{st}</option>
            ))}
          </select>
          <button className="secondary" onClick={exportFailedCsv}>
            Export failed CSV
          </button>
        </div>

        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Phone</th>
              <th>Status</th>
              <th>Error</th>
            </tr>
          </thead>
          <tbody>
            {messages.map((m) => (
              <tr key={m._id}>
                <td style={{ color: 'var(--color-text)', fontWeight: 500 }}>{m.contact?.name}</td>
                <td>{m.phone}</td>
                <td><StatusBadge status={m.status} /></td>
                <td style={{ color: 'var(--color-error)', fontSize: 13 }}>
                  {m.errorCode} {m.errorMessage}
                </td>
              </tr>
            ))}
            {messages.length === 0 && (
              <tr>
                <td colSpan="4" style={{ textAlign: 'center', padding: 32, color: 'var(--color-text-muted)' }}>
                  {filter ? `No messages with status "${filter}"` : 'No messages yet'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
