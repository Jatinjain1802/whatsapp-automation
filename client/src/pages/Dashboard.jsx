import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';

export default function Dashboard() {
  const [campaigns, setCampaigns] = useState([]);

  useEffect(() => {
    api.get('/campaigns').then((res) => setCampaigns(res.data)).catch(() => {});
  }, []);

  return (
    <>
      <h2>Campaigns</h2>
      <div className="card">
        <table>
          <thead>
            <tr><th>Name</th><th>Template</th><th>Status</th><th>Sent</th><th>Delivered</th><th>Read</th><th>Failed</th><th></th></tr>
          </thead>
          <tbody>
            {campaigns.map((c) => (
              <tr key={c._id}>
                <td>{c.name}</td>
                <td>{c.template?.name}</td>
                <td><StatusBadge status={c.status} /></td>
                <td>{c.stats?.sent ?? 0}</td>
                <td>{c.stats?.delivered ?? 0}</td>
                <td>{c.stats?.read ?? 0}</td>
                <td>{c.stats?.failed ?? 0}</td>
                <td><Link to={`/campaigns/${c._id}`}>Report</Link></td>
              </tr>
            ))}
            {!campaigns.length && <tr><td colSpan="8">No campaigns yet. Import contacts, get a template approved, then create one.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function StatusBadge({ status }) {
  const color = {
    APPROVED: 'green', completed: 'green', opted_in: 'green',
    PENDING: 'yellow', sending: 'yellow', scheduled: 'yellow', unknown: 'yellow',
    REJECTED: 'red', failed: 'red', opted_out: 'red', PAUSED: 'red',
  }[status] || 'gray';
  return <span className={`badge ${color}`}>{status}</span>;
}
