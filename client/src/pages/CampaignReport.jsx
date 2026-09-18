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
    const timer = setInterval(load, 5000); // live-ish status while sending
    return () => clearInterval(timer);
  }, [id, filter]);

  if (!campaign) return <p>Loading...</p>;
  const s = campaign.stats || {};

  function exportFailedCsv() {
    const rows = [['name', 'phone', 'error_code', 'error_message']];
    messages.filter((m) => m.status === 'failed')
      .forEach((m) => rows.push([m.contact?.name || '', m.phone, m.errorCode, (m.errorMessage || '').replaceAll(',', ' ')]));
    const csv = rows.map((r) => r.join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `campaign-${id}-failed.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <h2>{campaign.name}</h2>
      <div className="stats">
        <div className="stat"><div className="num">{s.total ?? 0}</div><div className="label">Recipients</div></div>
        <div className="stat"><div className="num">{s.sent ?? 0}</div><div className="label">Sent</div></div>
        <div className="stat"><div className="num">{s.delivered ?? 0}</div><div className="label">Delivered</div></div>
        <div className="stat"><div className="num">{s.read ?? 0}</div><div className="label">Read</div></div>
        <div className="stat"><div className="num">{s.failed ?? 0}</div><div className="label">Failed</div></div>
        <div className="stat"><div className="num">{s.skippedNoConsent ?? 0}</div><div className="label">No opt-in</div></div>
      </div>
      <div className="card" style={{ marginTop: 18 }}>
        <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
          <select style={{ maxWidth: 200 }} value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">All statuses</option>
            {['queued', 'sent', 'delivered', 'read', 'failed', 'skipped'].map((st) => <option key={st} value={st}>{st}</option>)}
          </select>
          <button className="secondary" onClick={exportFailedCsv}>Export failed CSV</button>
        </div>
        <table>
          <thead><tr><th>Name</th><th>Phone</th><th>Status</th><th>Error</th></tr></thead>
          <tbody>
            {messages.map((m) => (
              <tr key={m._id}>
                <td>{m.contact?.name}</td>
                <td>{m.phone}</td>
                <td><StatusBadge status={m.status} /></td>
                <td>{m.errorCode} {m.errorMessage}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
