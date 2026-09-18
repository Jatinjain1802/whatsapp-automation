import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { StatusBadge } from './Dashboard.jsx';

export default function Templates() {
  const [templates, setTemplates] = useState([]);
  const [form, setForm] = useState({ name: '', category: 'UTILITY', language: 'en', bodyText: '', headerText: '', footerText: '' });
  const [error, setError] = useState('');

  const load = () => api.get('/templates').then((res) => setTemplates(res.data));
  useEffect(() => { load().catch(() => {}); }, []);

  async function create(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/templates', form);
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
      setError(err.response?.data?.error || 'Submit failed - check Meta credentials in .env');
    }
  }

  async function sync() {
    await api.post('/templates/sync');
    load();
  }

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <>
      <h2>Message templates</h2>
      <p>Broadcasts outside the 24-hour customer window must use Meta-approved templates. Create here, submit for approval, then use in a campaign. Variables look like {'{{1}}'}, {'{{2}}'}.</p>
      <div className="card">
        <form onSubmit={create}>
          <input placeholder="template_name (lowercase_with_underscores)" value={form.name} onChange={set('name')} required />
          <select value={form.category} onChange={set('category')}>
            <option value="UTILITY">Utility (order/payment/delivery updates)</option>
            <option value="MARKETING">Marketing (offers/promotions)</option>
            <option value="AUTHENTICATION">Authentication (OTP)</option>
          </select>
          <input placeholder="Language code (e.g. en, hi)" value={form.language} onChange={set('language')} />
          <input placeholder="Header (optional)" value={form.headerText} onChange={set('headerText')} />
          <textarea rows="4" placeholder={'Body, e.g. Hi {{1}}, your order {{2}} has been dispatched.'} value={form.bodyText} onChange={set('bodyText')} required />
          <input placeholder="Footer (optional)" value={form.footerText} onChange={set('footerText')} />
          {error && <p className="error">{error}</p>}
          <button type="submit">Save draft</button>
          <button type="button" className="secondary" style={{ marginLeft: 8 }} onClick={sync}>Sync statuses from Meta</button>
        </form>
      </div>
      <div className="card">
        <table>
          <thead><tr><th>Name</th><th>Category</th><th>Language</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {templates.map((t) => (
              <tr key={t._id}>
                <td>{t.name}</td>
                <td>{t.category}</td>
                <td>{t.language}</td>
                <td><StatusBadge status={t.status} /></td>
                <td>
                  {['DRAFT', 'REJECTED'].includes(t.status) && (
                    <button className="secondary" onClick={() => submit(t._id)}>Submit to Meta</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
