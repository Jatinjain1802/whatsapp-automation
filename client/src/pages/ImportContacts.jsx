/*
  ImportContacts.jsx — 3-step wizard: Upload → Map Columns → Preview → Confirm
  -----------------------------------------------------------------------
  KEY CONCEPTS:
  
  1. FormData — The Web API for sending files via HTTP. Unlike JSON,
     FormData can carry binary files (like .xlsx). We use fd.append()
     to add fields. Axios automatically sets Content-Type to multipart/form-data.
     
  2. MULTI-STEP WIZARD — We use state to track which "step" the user is on.
     Instead of separate pages, we conditionally render different sections.
     The step indicator at the top is purely visual CSS.
     
  3. JSON.stringify() — Converts a JS object to a JSON string.
     We need this because FormData only accepts strings and files.
     The server will JSON.parse() it back to an object.
*/

import { useState } from 'react';
import { api } from '../api.js';

export default function ImportContacts() {
  const [file, setFile] = useState(null);
  const [headers, setHeaders] = useState([]);
  const [mapping, setMapping] = useState({
    name: '', phone: '', group: '',
    consentStatus: '', consentAt: '', consentSource: ''
  });
  const [preview, setPreview] = useState(null);
  const [done, setDone] = useState(null);
  const [error, setError] = useState('');

  // Determine current step for the visual indicator
  const currentStep = done ? 3 : preview ? 2 : headers.length > 0 ? 1 : 0;

  async function uploadHeaders() {
    setError('');
    const fd = new FormData();
    fd.append('file', file);
    const { data } = await api.post('/imports/headers', fd);
    setHeaders(data.headers);
  }

  async function buildPreview() {
    setError('');
    const fd = new FormData();
    fd.append('file', file);
    fd.append('mapping', JSON.stringify(mapping));
    try {
      const { data } = await api.post('/imports/preview', fd);
      setPreview(data);
    } catch (err) {
      setError(err.response?.data?.error || 'Preview failed');
    }
  }

  async function confirm() {
    const { data } = await api.post(`/imports/${preview.importJobId}/confirm`);
    setDone(data);
  }

  /*
    mapSelect — Returns a JSX label+select element for column mapping.
    This is a function that returns JSX, not a component (no capital letter).
    It's useful for reducing repetition when you have many similar fields.
  */
  const mapSelect = (key, label) => (
    <label key={key} style={{ display: 'block', marginBottom: 12 }}>
      {label}
      <select value={mapping[key]} onChange={(e) => setMapping({ ...mapping, [key]: e.target.value })}>
        <option value="">(not mapped)</option>
        {/* .map() turns each header string into an <option> element */}
        {headers.map((h) => <option key={h} value={h}>{h}</option>)}
      </select>
    </label>
  );

  return (
    <div className="page">
      <div className="page-header">
        <h2>Import customers from Excel</h2>
        <p>Upload an .xlsx or .csv file to import contacts. Include a consent column — only customers with opt-in can receive broadcasts.</p>
      </div>

      {/* ── STEP INDICATOR ─────────────────────────────────────────── */}
      <div className="steps">
        <div className={`step ${currentStep === 0 ? 'active' : currentStep > 0 ? 'done' : ''}`}>
          <div className="step-number">{currentStep > 0 ? '✓' : '1'}</div>
          <span>Upload</span>
        </div>
        <div className={`step-connector ${currentStep > 0 ? 'done' : ''}`} />
        <div className={`step ${currentStep === 1 ? 'active' : currentStep > 1 ? 'done' : ''}`}>
          <div className="step-number">{currentStep > 1 ? '✓' : '2'}</div>
          <span>Map columns</span>
        </div>
        <div className={`step-connector ${currentStep > 1 ? 'done' : ''}`} />
        <div className={`step ${currentStep === 2 ? 'active' : currentStep > 2 ? 'done' : ''}`}>
          <div className="step-number">{currentStep > 2 ? '✓' : '3'}</div>
          <span>Confirm</span>
        </div>
      </div>

      {/* ── STEP 1: UPLOAD ─────────────────────────────────────────── */}
      <div className="card">
        <div
          className={`drop-zone ${file ? 'has-file' : ''}`}
          onClick={() => document.getElementById('file-input').click()}
        >
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M19.35 10.04A7.49 7.49 0 0012 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 000 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z"/>
          </svg>
          {file ? (
            <p className="file-name">{file.name}</p>
          ) : (
            <p>Click to select an .xlsx or .csv file</p>
          )}
          {/* Hidden file input — we trigger it via the drop-zone click */}
          <input
            id="file-input"
            type="file"
            accept=".xlsx,.xls,.csv"
            style={{ display: 'none' }}
            onChange={(e) => setFile(e.target.files[0])}
          />
        </div>
        <div style={{ marginTop: 16, textAlign: 'right' }}>
          <button disabled={!file} onClick={uploadHeaders}>Upload & Read Headers</button>
        </div>
      </div>

      {/* ── STEP 2: MAP COLUMNS ────────────────────────────────────── */}
      {headers.length > 0 && !preview && (
        <div className="card">
          <h3>Map your columns</h3>
          {mapSelect('name', 'Customer name')}
          {mapSelect('phone', 'Phone (required) *')}
          {mapSelect('group', 'Group / segment')}
          {mapSelect('consentStatus', 'Opt-in consent (yes/no)')}
          {mapSelect('consentAt', 'Consent date')}
          {mapSelect('consentSource', 'Consent source')}
          <div style={{ marginTop: 8 }}>
            <button disabled={!mapping.phone} onClick={buildPreview}>Validate & preview</button>
          </div>
          {error && <p className="error">{error}</p>}
        </div>
      )}

      {/* ── STEP 3: PREVIEW & CONFIRM ──────────────────────────────── */}
      {preview && !done && (
        <div className="card">
          <h3>Import Preview</h3>
          <div className="stats">
            <div className="stat stat-info">
              <div className="num">{preview.stats.totalRows}</div>
              <div className="label">Total Rows</div>
            </div>
            <div className="stat stat-success">
              <div className="num">{preview.stats.valid}</div>
              <div className="label">Valid</div>
            </div>
            <div className="stat stat-warning">
              <div className="num">{preview.stats.duplicates}</div>
              <div className="label">Duplicates</div>
            </div>
            <div className="stat stat-error">
              <div className="num">{preview.stats.invalid}</div>
              <div className="label">Invalid</div>
            </div>
          </div>
          {preview.errors?.length > 0 && (
            <details style={{ marginTop: 16 }}>
              <summary>Problems ({preview.errors.length} shown)</summary>
              <ul>{preview.errors.map((e, i) => <li key={i}>Row {e.row}: {e.phone} — {e.reason}</li>)}</ul>
            </details>
          )}
          <div style={{ marginTop: 20 }}>
            <button onClick={confirm}>Confirm import of {preview.stats.valid} contacts</button>
          </div>
        </div>
      )}

      {/* ── DONE ───────────────────────────────────────────────────── */}
      {done && (
        <div className="card">
          <h3>✅ Imported {done.imported} contacts</h3>
          <p style={{ color: 'var(--color-text-secondary)' }}>They are now available in Groups and Contacts.</p>
        </div>
      )}
    </div>
  );
}
