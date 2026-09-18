/*
  NewCampaign.jsx — Wizard to create and send a broadcast campaign
  -----------------------------------------------------------------------
  KEY CONCEPTS:
  
  1. useMemo — Memoizes (caches) a computed value. It only recalculates
     when one of its dependencies changes. Without useMemo, `variables`
     would be recalculated on EVERY render — wasteful for expensive operations.
     The dependency array [template] means: recalculate when `template` changes.
     
  2. REGEX with matchAll — `template.bodyText.matchAll(/\{\{(\d+)\}\}/g)`
     finds all {{1}}, {{2}} etc. in the template body.
     - \{\{ matches literal {{
     - (\d+) captures one or more digits into group 1
     - \}\} matches literal }}
     - g flag means "find ALL matches, not just the first"
     
  3. Set — `new Set([...])` removes duplicates from an array.
     If the template has {{1}} twice, we only want one mapping field.
     
  4. useNavigate — React Router hook that returns a function to
     programmatically navigate to a different route (instead of <Link>).
*/

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';

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
    // Only show APPROVED templates — you can't send unapproved ones
    api.get('/templates')
      .then((res) => setTemplates(res.data.filter((t) => t.status === 'APPROVED')))
      .catch(() => {});
  }, []);

  // Find the selected template object from the array
  const template = useMemo(
    () => templates.find((t) => t._id === templateId),
    [templates, templateId]
  );

  // Extract unique variable numbers from the template body
  const variables = useMemo(() => {
    if (!template) return [];
    // Spread matchAll iterator into array, extract group 1, deduplicate with Set, sort
    return [...new Set(
      [...template.bodyText.matchAll(/\{\{(\d+)\}\}/g)].map((m) => m[1])
    )].sort();
  }, [template]);

  async function createDraft(e) {
    e.preventDefault();
    setError('');
    try {
      // Step 1: Create the campaign as a draft
      const { data } = await api.post('/campaigns', {
        name, groupId, templateId, variableMapping: mapping
      });
      setCampaignId(data._id);
      // Step 2: Fetch preview data (recipient count, sample message)
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
      // navigate() changes the URL without a full page reload
      navigate(`/campaigns/${campaignId}`);
    } catch (err) {
      setError(err.response?.data?.error || 'Send failed');
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <h2>New Campaign</h2>
        <p>Select a group and an approved template, map variables to contact fields, then preview and send.</p>
      </div>

      {/* ── SETUP FORM (before preview) ────────────────────────────── */}
      {!preview && (
        <div className="card">
          <h3>Campaign setup</h3>
          <form onSubmit={createDraft}>
            <input
              placeholder="Campaign name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label>Target group</label>
                <select value={groupId} onChange={(e) => setGroupId(e.target.value)} required>
                  <option value="">Select group</option>
                  {groups.map((g) => (
                    <option key={g._id} value={g._id}>{g.name} ({g.contactCount})</option>
                  ))}
                </select>
              </div>
              <div>
                <label>Approved template</label>
                <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} required>
                  <option value="">Select template</option>
                  {templates.map((t) => (
                    <option key={t._id} value={t._id}>{t.name} ({t.category})</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Variable mapping — only shown when template has {{variables}} */}
            {variables.length > 0 && (
              <>
                <h4 style={{ marginTop: 20 }}>Map variables</h4>
                {variables.map((v) => (
                  <label key={v} style={{ display: 'block', marginBottom: 12 }}>
                    {'{{' + v + '}}'}
                    <select
                      value={mapping[v] || ''}
                      onChange={(e) => setMapping({ ...mapping, [v]: e.target.value })}
                      required
                    >
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
            <button type="submit" style={{ marginTop: 8 }}>Preview campaign</button>
          </form>
        </div>
      )}

      {/* ── PREVIEW & CONFIRM ──────────────────────────────────────── */}
      {preview && (
        <div className="card">
          <h3>Confirm & send</h3>
          <div className="stats">
            <div className="stat stat-success">
              <div className="num">{preview.recipients}</div>
              <div className="label">Will receive</div>
            </div>
            <div className="stat stat-warning">
              <div className="num">{preview.skippedNoConsent}</div>
              <div className="label">Skipped (no opt-in)</div>
            </div>
            <div className="stat stat-info">
              <div className="num">{preview.totalInGroup}</div>
              <div className="label">In group</div>
            </div>
          </div>

          <h4 style={{ marginTop: 24 }}>Sample message</h4>
          {/* Chat-bubble styled preview */}
          <div className="preview">{preview.sampleBody}</div>

          <p style={{ marginTop: 14, color: 'var(--color-text-secondary)', fontSize: 14 }}>
            Template: <strong style={{ color: 'var(--color-text)' }}>{preview.template.name}</strong>{' '}
            ({preview.template.category}). Messages send individually via the Meta Cloud API queue.
          </p>

          {error && <p className="error">{error}</p>}

          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button onClick={send}>
              Send to {preview.recipients} customers
            </button>
            <button className="secondary" onClick={() => setPreview(null)}>
              ← Back
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
