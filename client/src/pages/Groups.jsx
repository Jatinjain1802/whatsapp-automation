/*
  Groups.jsx — Manage contact segments (groups)
  -----------------------------------------------------------------------
  KEY CONCEPTS:
  
  1. LIFTING STATE UP — `load()` is called after create/delete to
     re-fetch the latest data from the server. This keeps the UI in sync
     with the database without manual state manipulation.
     
  2. FORM onSubmit — Using onSubmit on the <form> (not onClick on button)
     lets the user submit by pressing Enter, not just clicking.
     
  3. INLINE FORM LAYOUT — The form-row CSS class uses flexbox to put
     the input and button side by side. `flex: 1` on the input makes it
     take all available space, while the button stays its natural width.
*/

import { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function Groups() {
  const [groups, setGroups] = useState([]);
  const [name, setName] = useState('');

  const load = () => api.get('/groups').then((res) => setGroups(res.data));
  useEffect(() => { load().catch(() => {}); }, []);

  async function create(e) {
    e.preventDefault();
    await api.post('/groups', { name });
    setName('');  // Clear input after successful creation
    load();       // Re-fetch the list to show the new group
  }

  async function remove(id) {
    await api.delete(`/groups/${id}`);
    load();
  }

  return (
    <div className="page">
      <div className="page-header">
        <h2>Groups</h2>
        <p>Groups are dashboard segments, not WhatsApp groups. Campaigns send to every opted-in contact in a segment individually.</p>
      </div>

      {/* Create new group — inline form with input + button side by side */}
      <div className="card">
        <h3>Create a new group</h3>
        <form onSubmit={create} className="form-row">
          <input
            placeholder="Enter group name..."
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <button type="submit">Create</button>
        </form>
      </div>

      {/* Groups table */}
      <div className="card">
        {groups.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Contacts</th>
                <th style={{ width: 100 }}></th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g._id}>
                  <td style={{ color: 'var(--color-text)', fontWeight: 500 }}>{g.name}</td>
                  <td>{g.contactCount}</td>
                  <td>
                    <button className="secondary" onClick={() => remove(g._id)}
                      style={{ fontSize: 13, padding: '6px 14px' }}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty-state">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 12.75c1.63 0 3.07.39 4.24.9 1.08.48 1.76 1.56 1.76 2.73V18H6v-1.61c0-1.18.68-2.26 1.76-2.73 1.17-.52 2.61-.91 4.24-.91zM12 6c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3z"/>
            </svg>
            <p>No groups yet. Create one above to start organizing your contacts.</p>
          </div>
        )}
      </div>
    </div>
  );
}
