import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';

// Wizard: pick group -> pick approved template -> map variables -> preview -> confirm & send.
export default function NewCampaign() {
  const navigate = useNavigate();
  const [groups, setGroups] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [name, setName] = useState('');
  const [groupId, setGroupId] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [mapping, setMapping] = useState({});
  const [campaignId, setCampaignId] = useState('');
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/groups').then((res) => setGroups(res.data)).catch(() => {});
    api.get('/templates').then((res) => setTemplates(res.data.filter((t) => t.status === 'APPROVED'))).catch(() => {});
  }, []);

  const template = useMemo(() => templates.find((t) => t._id === templateId), [templates, templateId]);
  const variables = useMemo(() => {
    if (!template) return [];
    return [...new Set([...template.bodyText.matchAll(/\{\{(\d+)\}\}/g)].map((m) => m[1]))].sort();
  }, [template]);

  async function createDraft(e) {
    e.preventDefault();
    setError('');
    try {
      const { data } = await api.post('/campaigns', { name, groupId, templateId, variableMapping: mapping });
      setCampaignId(data._id);
      const pv = await api.get(`/campaigns/${data._id}/preview`);
      setPreview(pv.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not create campaign');
    }
  }

  async function send() {
    setError('');
    try {
      await api.post(`/campaigns/${campaignId}/send`);
      navigate(`/campaigns/${campaignId}`);
    } catch (err) {
      setError(err.response?.data?.error || 'Send failed');
    }
  }

  return (
    <>
      <h2>New campaign</h2>
      {!preview && (
        <div className="card">
          <form onSubmit={createDraft}>
            <input placeholder="Campaign name" value={name} onChange={(e) => setName(e.target.value)} required />
            <label>Group
              <select value={groupId} onChange={(e) => setGroupId(e.target.value)} required>
                <option value="">Select group</option>
                {groups.map((g) => <option key={g._id} value={g._id}>{g.name} ({g.contactCount})</option>)}
              </select>
            </label>
            <label>Approved template
              <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} required>
                <option value="">Select template</option>
                {templates.map((t) => <option key={t._id} value={t._id}>{t.name} ({t.category})</option>)}
              </select>
            </label>
            {variables.length > 0 && (
              <>
                <h4>Map variables</h4>
                {variables.map((v) => (
                  <label key={v} style={{ display: 'block', marginBottom: 8 }}>
                    {'{{'}{v}{'}}'}
                    <select value={mapping[v] || ''} onChange={(e) => setMapping({ ...mapping, [v]: e.target.value })} required>
                      <option value="">Select field</option>
                      <option value="name">Customer name</option>
                      <option value="phone">Phone</option>
                      <option value="customFields.orderId">Custom: orderId</option>
                      <option value="customFields.amount">Custom: amount</option>
                      <option value="customFields.date">Custom: date</option>
                    </select>
                  </label>
                ))}
              </>
            )}
            {error && <p className="error">{error}</p>}
            <button type="submit">Preview campaign</button>
          </form>
        </div>
      )}

      {preview && (
        <div className="card">
          <h3>Confirm send</h3>
          <div className="stats">
            <div className="stat"><div className="num">{preview.recipients}</div><div className="label">Will receive</div></div>
            <div className="stat"><div className="num">{preview.skippedNoConsent}</div><div className="label">Skipped (no opt-in)</div></div>
            <div className="stat"><div className="num">{preview.totalInGroup}</div><div className="label">In group</div></div>
          </div>
          <h4 style={{ marginTop: 16 }}>Sample message</h4>
          <div className="preview">{preview.sampleBody}</div>
          <p style={{ marginTop: 12 }}>
            Template: <b>{preview.template.name}</b> ({preview.template.category}). Messages send individually via the Meta Cloud API queue.
          </p>
          {error && <p className="error">{error}</p>}
          <button onClick={send}>Send to {preview.recipients} customers</button>
          <button className="secondary" style={{ marginLeft: 8 }} onClick={() => setPreview(null)}>Back</button>
        </div>
      )}
    </>
  );
}
