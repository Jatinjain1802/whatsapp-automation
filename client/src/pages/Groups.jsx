/*
  Groups.jsx — Manage contact segments (groups)
  -----------------------------------------------------------------------
  KEY LEARNING CONCEPTS:
  
  1. LIFTING STATE UP & API FETCHING — `load()` fetches both groups and contacts
     from the server using Promise.all() to keep state in sync.
     
  2. CONTROLLED INPUTS — Input elements are linked to React state (`name`, `contactCount`,
     `selectedContactIds`). Any user typing updates state, which triggers a re-render.
     
  3. CONDITIONAL RENDERING — `{selectionMode === 'manual' && ...}` conditionally renders
     the contact selection checkbox list only when manual mode is active.
     
  4. ARRAY MUTATION vs IMMUTABILITY — When toggling contact checkboxes, we use filter/spread:
     `setSelectedContactIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id])`
     This creates a NEW array reference, which React requires to trigger a UI re-render.
*/

import { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function Groups() {
  const [groups, setGroups] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [name, setName] = useState('');
  
  // Selection mode: 'count' | 'all' | 'manual' | 'none'
  const [selectionMode, setSelectionMode] = useState('count');
  const [contactCount, setContactCount] = useState('5');
  const [selectedContactIds, setSelectedContactIds] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Fetch groups and contacts together
  const load = async () => {
    try {
      const [groupsRes, contactsRes] = await Promise.all([
        api.get('/groups'),
        api.get('/contacts')
      ]);
      setGroups(groupsRes.data);
      setContacts(contactsRes.data);
    } catch (err) {
      console.error('Failed to load groups data:', err);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // Handle contact selection mode changes
  const handleModeChange = (mode) => {
    setSelectionMode(mode);
    if (mode === 'all') {
      setContactCount(contacts.length.toString());
      setSelectedContactIds([]);
    } else if (mode === 'none') {
      setContactCount('0');
      setSelectedContactIds([]);
    } else if (mode === 'manual') {
      setContactCount('');
    } else if (mode === 'count' && !contactCount) {
      setContactCount('5');
    }
  };

  // Toggle individual contact check state
  const toggleContactSelection = (contactId) => {
    setSelectedContactIds((prev) =>
      prev.includes(contactId)
        ? prev.filter((id) => id !== contactId)
        : [...prev, contactId]
    );
  };

  // Toggle select all contacts in manual mode
  const toggleSelectAllManual = () => {
    if (selectedContactIds.length === contacts.length) {
      setSelectedContactIds([]);
    } else {
      setSelectedContactIds(contacts.map((c) => c._id));
    }
  };

  async function create(e) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const payload = {
        name,
        contactCount: selectionMode === 'count' || selectionMode === 'all' ? Number(contactCount) : 0,
        contactIds: selectionMode === 'manual' ? selectedContactIds : []
      };

      await api.post('/groups', payload);
      setName('');
      setSelectedContactIds([]);
      setContactCount('5');
      setSelectionMode('count');
      load(); // Re-fetch the list to show the new group and updated counts
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create group');
    } finally {
      setLoading(false);
    }
  }

  async function remove(id) {
    if (!window.confirm('Are you sure you want to delete this group? Contacts will remain.')) return;
    await api.delete(`/groups/${id}`);
    load();
  }

  return (
    <div className="page">
      <div className="page-header">
        <h2>Groups</h2>
        <p>
          Organize your customers into target segments. When creating a group, you can select how many contacts to include.
        </p>
      </div>

      {/* Create new group card */}
      <div className="card">
        <h3>Create a new group</h3>
        
        <form onSubmit={create}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontWeight: 600, color: 'var(--color-text)' }}>Group Name *</label>
            <input
              placeholder="e.g. VIP Customers, High Priority Leads..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          {/* Contact selection section */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <label style={{ fontWeight: 600, color: 'var(--color-text)', margin: 0 }}>
                Select Contacts to Include
              </label>
              <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                {contacts.length} total contact{contacts.length === 1 ? '' : 's'} available
              </span>
            </div>

            {/* Quick Mode Selector Pills */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
              <button
                type="button"
                className={selectionMode === 'count' ? '' : 'secondary'}
                style={{ fontSize: 13, padding: '6px 14px' }}
                onClick={() => handleModeChange('count')}
              >
                🔢 Specify Number
              </button>
              <button
                type="button"
                className={selectionMode === 'all' ? '' : 'secondary'}
                style={{ fontSize: 13, padding: '6px 14px' }}
                onClick={() => handleModeChange('all')}
              >
                👥 All Contacts ({contacts.length})
              </button>
              <button
                type="button"
                className={selectionMode === 'manual' ? '' : 'secondary'}
                style={{ fontSize: 13, padding: '6px 14px' }}
                onClick={() => handleModeChange('manual')}
              >
                ☑ Pick Contacts ({selectedContactIds.length})
              </button>
              <button
                type="button"
                className={selectionMode === 'none' ? '' : 'secondary'}
                style={{ fontSize: 13, padding: '6px 14px' }}
                onClick={() => handleModeChange('none')}
              >
                ⚪ Empty Group (0)
              </button>
            </div>

            {/* Mode A & B: Specify numerical count */}
            {(selectionMode === 'count' || selectionMode === 'all') && (
              <div style={{ background: 'rgba(255,255,255,0.02)', padding: 14, borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}>
                <label>Number of contacts to add:</label>
                <div className="form-row" style={{ marginTop: 4 }}>
                  <input
                    type="number"
                    min="0"
                    max={contacts.length}
                    value={contactCount}
                    onChange={(e) => setContactCount(e.target.value)}
                    placeholder={`Enter count (max ${contacts.length})`}
                    required
                  />
                  <div style={{ alignSelf: 'center', fontSize: 13, color: 'var(--color-text-muted)', whiteSpace: 'nowrap', paddingBottom: 12 }}>
                    out of {contacts.length} total
                  </div>
                </div>
              </div>
            )}

            {/* Mode C: Manual Checkbox Picker */}
            {selectionMode === 'manual' && (
              <div style={{ background: 'rgba(255,255,255,0.02)', padding: 14, borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <span style={{ fontSize: 13, fontWeight: 500 }}>
                    Select specific contacts ({selectedContactIds.length} chosen):
                  </span>
                  <button
                    type="button"
                    className="secondary"
                    onClick={toggleSelectAllManual}
                    style={{ fontSize: 11, padding: '3px 8px' }}
                  >
                    {selectedContactIds.length === contacts.length ? 'Deselect All' : 'Select All'}
                  </button>
                </div>

                {contacts.length > 0 ? (
                  <div style={{ maxHeight: 180, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {contacts.map((c) => (
                      <label
                        key={c._id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          padding: '6px 10px',
                          background: selectedContactIds.includes(c._id) ? 'rgba(37, 211, 102, 0.08)' : 'transparent',
                          borderRadius: 6,
                          cursor: 'pointer',
                          margin: 0
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={selectedContactIds.includes(c._id)}
                          onChange={() => toggleContactSelection(c._id)}
                          style={{ width: 'auto', margin: 0 }}
                        />
                        <span style={{ flex: 1, color: 'var(--color-text)', fontSize: 13 }}>
                          {c.name || 'Unnamed Contact'} ({c.phone})
                        </span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>No contacts available to select.</p>
                )}
              </div>
            )}
          </div>

          {error && <p className="error" style={{ marginBottom: 12 }}>{error}</p>}

          <button type="submit" disabled={loading || !name.trim()}>
            {loading ? 'Creating Group...' : 'Create Group'}
          </button>
        </form>
      </div>

      {/* Groups table */}
      <div className="card">
        <h3>Existing Groups</h3>
        {groups.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Contacts Included</th>
                <th>Created At</th>
                <th style={{ width: 100 }}></th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g._id}>
                  <td style={{ color: 'var(--color-text)', fontWeight: 500 }}>{g.name}</td>
                  <td>
                    <span className="badge green">{g.contactCount} contact{g.contactCount === 1 ? '' : 's'}</span>
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                    {new Date(g.createdAt).toLocaleDateString()}
                  </td>
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
