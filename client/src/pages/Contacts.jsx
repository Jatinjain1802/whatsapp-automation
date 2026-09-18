/*
  Contacts.jsx — View and manage individual contacts
  -----------------------------------------------------------------------
  KEY CONCEPTS:
  
  1. TERNARY OPERATOR — `condition ? valueIfTrue : valueIfFalse`
     Used here to toggle the button text between "Opt out" / "Opt in"
     and to construct the correct API endpoint dynamically.
     
  2. OPTIONAL CHAINING (?.) — `c.optIn?.status` safely accesses
     nested properties. If `c.optIn` is null/undefined, it returns
     undefined instead of throwing a TypeError.
     
  3. IMPORTING NAMED EXPORTS — `{ StatusBadge }` uses curly braces
     because StatusBadge is a named export from Dashboard.jsx.
     Default exports don't need curly braces: `import Dashboard from '...'`
*/

import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { StatusBadge } from './Dashboard.jsx';

export default function Contacts() {
  const [contacts, setContacts] = useState([]);

  const load = () => api.get('/contacts').then((res) => setContacts(res.data));
  useEffect(() => { load().catch(() => {}); }, []);

  async function toggle(c) {
    // Dynamic endpoint: /contacts/:id/opt-in OR /contacts/:id/opt-out
    await api.post(`/contacts/${c._id}/${c.optIn?.status === 'opted_in' ? 'opt-out' : 'opt-in'}`);
    load();
  }

  return (
    <div className="page">
      <div className="page-header">
        <h2>Contacts</h2>
        <p>View all imported contacts and manage their opt-in consent status for WhatsApp broadcasts.</p>
      </div>

      <div className="card">
        {contacts.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Phone</th>
                <th>Consent</th>
                <th style={{ width: 110 }}></th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((c) => (
                <tr key={c._id}>
                  <td style={{ color: 'var(--color-text)', fontWeight: 500 }}>{c.name}</td>
                  <td>{c.phone}</td>
                  <td><StatusBadge status={c.optIn?.status || 'unknown'} /></td>
                  <td>
                    <button
                      className="secondary"
                      onClick={() => toggle(c)}
                      style={{ fontSize: 13, padding: '6px 14px' }}
                    >
                      {c.optIn?.status === 'opted_in' ? 'Opt out' : 'Opt in'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty-state">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H4V6h16v12zM12 12c1.38 0 2.5-1.12 2.5-2.5S13.38 7 12 7s-2.5 1.12-2.5 2.5S10.62 12 12 12zm0 1c-1.67 0-5 .84-5 2.5V17h10v-1.5c0-1.66-3.33-2.5-5-2.5z"/>
            </svg>
            <p>No contacts yet. Import contacts from an Excel file to get started.</p>
          </div>
        )}
      </div>
    </div>
  );
}
