import { useState } from 'react';
import { api } from '../api.js';

// 3-step flow: upload -> map columns -> preview -> confirm.
export default function ImportContacts() {
  const [file, setFile] = useState(null);
  const [headers, setHeaders] = useState([]);
  const [mapping, setMapping] = useState({ name: '', phone: '', group: '', consentStatus: '', consentAt: '', consentSource: '' });
  const [preview, setPreview] = useState(null);
  const [done, setDone] = useState(null);
  const [error, setError] = useState('');

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

  const mapSelect = (key, label) => (
    <label key={key} style={{ display: 'block', marginBottom: 8 }}>
      {label}
      <select value={mapping[key]} onChange={(e) => setMapping({ ...mapping, [key]: e.target.value })}>
        <option value="">(not mapped)</option>
        {headers.map((h) => <option key={h} value={h}>{h}</option>)}
      </select>
    </label>
  );

  return (
    <>
      <h2>Import customers from Excel</h2>
      <div className="card">
        <p>Upload an .xlsx or .csv. Include a consent column - only customers with opt-in can receive broadcasts.</p>
        <input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => setFile(e.target.files[0])} />
        <button disabled={!file} onClick={uploadHeaders}>Upload</button>
      </div>

      {headers.length > 0 && !preview && (
        <div className="card">
          <h3>Map columns</h3>
          {mapSelect('name', 'Customer name')}
          {mapSelect('phone', 'Phone (required) *')}
          {mapSelect('group', 'Group / segment')}
          {mapSelect('consentStatus', 'Opt-in consent (yes/no)')}
          {mapSelect('consentAt', 'Consent date')}
          {mapSelect('consentSource', 'Consent source')}
          <button disabled={!mapping.phone} onClick={buildPreview}>Validate & preview</button>
          {error && <p className="error">{error}</p>}
        </div>
      )}

      {preview && !done && (
        <div className="card">
          <h3>Preview</h3>
          <div className="stats">
            <div className="stat"><div className="num">{preview.stats.totalRows}</div><div className="label">Rows</div></div>
            <div className="stat"><div className="num">{preview.stats.valid}</div><div className="label">Valid</div></div>
            <div className="stat"><div className="num">{preview.stats.duplicates}</div><div className="label">Duplicates</div></div>
            <div className="stat"><div className="num">{preview.stats.invalid}</div><div className="label">Invalid</div></div>
          </div>
          {preview.errors?.length > 0 && (
            <details style={{ marginTop: 12 }}>
              <summary>Problems ({preview.errors.length} shown)</summary>
              <ul>{preview.errors.map((e, i) => <li key={i}>Row {e.row}: {e.phone} - {e.reason}</li>)}</ul>
            </details>
          )}
          <button style={{ marginTop: 14 }} onClick={confirm}>Confirm import of {preview.stats.valid} contacts</button>
        </div>
      )}

      {done && (
        <div className="card">
          <h3>Imported {done.imported} contacts</h3>
          <p>They are now available in Groups and Contacts.</p>
        </div>
      )}
    </>
  );
}
