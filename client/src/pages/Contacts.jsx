import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { StatusBadge } from './Dashboard.jsx';

export default function Contacts() {
  const [contacts, setContacts] = useState([]);

  const load = () => api.get('/contacts').then((res) => setContacts(res.data));
  useEffect(() => { load().catch(() => {}); }, []);

  async function toggle(c) {
    await api.post(`/contacts/${c._id}/${c.optIn?.status === 'opted_in' ? 'opt-out' : 'opt-in'}`);
    load();
  }

  return (
    <>
      <h2>Contacts</h2>
      <div className="card">
        <table>
          <thead><tr><th>Name</th><th>Phone</th><th>Consent</th><th></th></tr></thead>
          <tbody>
            {contacts.map((c) => (
              <tr key={c._id}>
                <td>{c.name}</td>
                <td>{c.phone}</td>
                <td><StatusBadge status={c.optIn?.status || 'unknown'} /></td>
                <td>
                  <button className="secondary" onClick={() => toggle(c)}>
                    {c.optIn?.status === 'opted_in' ? 'Opt out' : 'Opt in'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
