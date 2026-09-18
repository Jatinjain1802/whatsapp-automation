/*
  Templates.jsx — Create and manage WhatsApp message templates
  -----------------------------------------------------------------------
  KEY CONCEPTS:
  
  1. TEMPLATE VARIABLES — WhatsApp uses {{1}}, {{2}} etc. as placeholders
     in approved templates. These get replaced with real customer data
     (name, order ID, etc.) when sending the campaign.
     
  2. async/await — Modern way to handle Promises. `await` pauses execution
     until the Promise resolves. Must be inside an `async` function.
     Try/catch handles errors — if the API call fails, the catch block runs.
     
  3. ARRAY .filter() — Returns a new array with only elements that pass
     the test. `['DRAFT','REJECTED'].includes(t.status)` checks if the
     template's status is in that array — cleaner than chaining || operators.
*/

import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { StatusBadge } from './Dashboard.jsx';

export default function Templates() {
  const [templates, setTemplates] = useState([]);
  const [form, setForm] = useState({
    name: '', category: 'UTILITY', language: 'en',
    bodyText: '', headerText: '', footerText: ''
  });
  const [error, setError] = useState('');

  const load = () => api.get('/templates').then((res) => setTemplates(res.data));
  useEffect(() => { load().catch(() => {}); }, []);

  async function create(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/templates', form);
      // Reset only name and body — keep category/language for convenience
      setForm({ ...form, name: '', bodyText: '' });
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Create failed');
    }
  }

  async function submit(id) {
    setError('');
    try {
      await api.post(`/templates/${id}/submit`);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Submit failed — check Meta credentials in .env');
    }
  }

  async function sync() {
    await api.post('/templates/sync');
    load();
  }

  // Closure pattern — returns a handler function for each field key
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <div className="page">
      <div className="page-header">
        <h2>Message Templates</h2>
        <p>
          Broadcasts outside the 24-hour customer window must use Meta-approved templates.
          Create here, submit for approval, then use in a campaign.
          Variables look like {'{{1}}'}, {'{{2}}'}.
        </p>
      </div>

      {/* ── CREATE TEMPLATE FORM ───────────────────────────────────── */}
      <div className="card">
        <h3>New template</h3>
        <form onSubmit={create}>
          <input
            placeholder="template_name (lowercase_with_underscores)"
            value={form.name}
            onChange={set('name')}
            required
          />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label>Category</label>
              <select value={form.category} onChange={set('category')}>
                <option value="UTILITY">Utility (order/payment/delivery)</option>
                <option value="MARKETING">Marketing (offers/promotions)</option>
                <option value="AUTHENTICATION">Authentication (OTP)</option>
              </select>
            </div>
            <div>
              <label>Language</label>
              <input
                placeholder="e.g. en, hi"
                value={form.language}
                onChange={set('language')}
              />
            </div>
          </div>

          <input placeholder="Header (optional)" value={form.headerText} onChange={set('headerText')} />

          <textarea
            rows="4"
            placeholder={'Body, e.g. Hi {{1}}, your order {{2}} has been dispatched.'}
            value={form.bodyText}
            onChange={set('bodyText')}
            required
          />

          <input placeholder="Footer (optional)" value={form.footerText} onChange={set('footerText')} />

          {error && <p className="error">{error}</p>}

          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button type="submit">Save draft</button>
            <button type="button" className="secondary" onClick={sync}>
              Sync statuses from Meta
            </button>
          </div>
        </form>
      </div>

      {/* ── TEMPLATES TABLE ────────────────────────────────────────── */}
      <div className="card">
        <h3>Your templates</h3>
        {templates.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Category</th>
                <th>Language</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {templates.map((t) => (
                <tr key={t._id}>
                  <td style={{ color: 'var(--color-text)', fontWeight: 500 }}>{t.name}</td>
                  <td>{t.category}</td>
                  <td>{t.language}</td>
                  <td><StatusBadge status={t.status} /></td>
                  <td>
                    {['DRAFT', 'REJECTED'].includes(t.status) && (
                      <button
                        className="secondary"
                        onClick={() => submit(t._id)}
                        style={{ fontSize: 13, padding: '6px 14px' }}
                      >
                        Submit to Meta
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty-state">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm4 18H6V4h7v5h5v11zm-3-7H9v-2h6v2zm0 4H9v-2h6v2z"/>
            </svg>
            <p>No templates yet. Create one above to get started.</p>
          </div>
        )}
      </div>
    </div>
  );
}
