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
    setName('');
    load();
  }

  async function remove(id) {
    await api.delete(`/groups/${id}`);
    load();
  }

  return (
    <>
      <h2>Groups</h2>
      <p>Groups are dashboard segments, not WhatsApp groups. Campaigns send to every opted-in contact in a segment individually.</p>
      <div className="card">
        <form onSubmit={create} style={{ display: 'flex', gap: 10 }}>
          <input placeholder="New group name" value={name} onChange={(e) => setName(e.target.value)} required />
          <button type="submit">Create</button>
        </form>
      </div>
      <div className="card">
        <table>
          <thead><tr><th>Name</th><th>Contacts</th><th></th></tr></thead>
          <tbody>
            {groups.map((g) => (
              <tr key={g._id}>
                <td>{g.name}</td>
                <td>{g.contactCount}</td>
                <td><button className="secondary" onClick={() => remove(g._id)}>Delete</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
