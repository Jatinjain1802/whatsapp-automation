/*
  Groups.jsx — Manage contact segments (groups) & member contents
  -----------------------------------------------------------------------
  KEY LEARNING CONCEPTS:
  
  1. REAL-TIME SEARCH FILTERING — `contacts.filter(c => ...)` dynamically filters
     contacts based on user input without calling the backend API repeatedly.
     
  2. MODAL STATE & CONDITIONAL RENDERING — `activeGroupModal` state controls when
     the "Manage Members" modal pops up over the UI.
     
  3. API MUTATION & RE-FETCHING — Calling `api.post` or `api.delete` then refreshing
     state with `loadGroupMembers()` keeps UI and database in 100% sync.
*/

import { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function Groups() {
  const [groups, setGroups] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  
  // Group creation selection modes: 'count' | 'all' | 'manual' | 'none'
  const [selectionMode, setSelectionMode] = useState('manual');
  const [contactCount, setContactCount] = useState('5');
  const [selectedContactIds, setSelectedContactIds] = useState([]);
  const [createSearchTerm, setCreateSearchTerm] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Modal State for managing members of an existing group
  const [activeGroupModal, setActiveGroupModal] = useState(null); // { _id, name } or null
  const [modalTab, setModalTab] = useState('current'); // 'current' | 'add'
  const [groupMembers, setGroupMembers] = useState([]);
  const [modalSearchTerm, setModalSearchTerm] = useState('');
  const [addMemberSelectedIds, setAddMemberSelectedIds] = useState([]);
  const [modalLoading, setModalLoading] = useState(false);

  // Fetch groups and contacts together
  const loadData = async () => {
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
    loadData();
  }, []);

  // Fetch contacts belonging to the active modal group
  const loadGroupMembers = async (groupId) => {
    setModalLoading(true);
    try {
      const res = await api.get(`/groups/${groupId}/contacts`);
      setGroupMembers(res.data);
    } catch (err) {
      console.error('Failed to load group contacts:', err);
    } finally {
      setModalLoading(false);
    }
  };

  // Open Manage Members Modal
  const openManageModal = (group) => {
    setActiveGroupModal(group);
    setModalTab('current');
    setModalSearchTerm('');
    setAddMemberSelectedIds([]);
    loadGroupMembers(group._id);
  };

  const closeManageModal = () => {
    setActiveGroupModal(null);
    setGroupMembers([]);
    loadData(); // refresh group contact counts
  };

  // Filtered contacts during group creation
  const filteredCreateContacts = contacts.filter((c) => {
    const term = createSearchTerm.toLowerCase().trim();
    if (!term) return true;
    return (
      (c.name && c.name.toLowerCase().includes(term)) ||
      (c.phone && c.phone.includes(term))
    );
  });

  // Toggle contact selection in creation form
  const toggleContactSelection = (contactId) => {
    setSelectedContactIds((prev) =>
      prev.includes(contactId)
        ? prev.filter((id) => id !== contactId)
        : [...prev, contactId]
    );
  };

  const selectAllOptedIn = () => {
    const optedInIds = contacts.filter((c) => c.optIn?.status === 'opted_in').map((c) => c._id);
    setSelectedContactIds(optedInIds);
  };

  async function createGroup(e) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const payload = {
        name,
        description,
        contactCount: selectionMode === 'count' || selectionMode === 'all' ? Number(contactCount) : 0,
        contactIds: selectionMode === 'manual' ? selectedContactIds : []
      };

      await api.post('/groups', payload);
      setName('');
      setDescription('');
      setSelectedContactIds([]);
      setContactCount('5');
      setSelectionMode('manual');
      setCreateSearchTerm('');
      loadData();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create group');
    } finally {
      setLoading(false);
    }
  }

  async function removeGroup(id) {
    if (!window.confirm('Are you sure you want to delete this group segment? Contacts will remain.')) return;
    await api.delete(`/groups/${id}`);
    loadData();
  }

  // Remove a single contact from an existing group in modal
  async function removeContactFromGroup(contactId) {
    if (!activeGroupModal) return;
    try {
      await api.delete(`/groups/${activeGroupModal._id}/contacts/${contactId}`);
      setGroupMembers((prev) => prev.filter((c) => c._id !== contactId));
    } catch (err) {
      alert('Failed to remove contact from group');
    }
  }

  // Add selected contacts to the active group in modal
  async function addSelectedContactsToGroup() {
    if (!activeGroupModal || addMemberSelectedIds.length === 0) return;
    try {
      await api.post(`/groups/${activeGroupModal._id}/contacts`, {
        contactIds: addMemberSelectedIds,
      });
      setAddMemberSelectedIds([]);
      setModalTab('current');
      loadGroupMembers(activeGroupModal._id);
    } catch (err) {
      alert('Failed to add contacts to group');
    }
  }

  // Contacts available to be added (not currently members of active group)
  const currentMemberIds = groupMembers.map((m) => m._id);
  const availableToAdd = contacts.filter((c) => !currentMemberIds.includes(c._id));

  const filteredCurrentMembers = groupMembers.filter((c) => {
    const term = modalSearchTerm.toLowerCase().trim();
    if (!term) return true;
    return (c.name && c.name.toLowerCase().includes(term)) || (c.phone && c.phone.includes(term));
  });

  const filteredAvailableToAdd = availableToAdd.filter((c) => {
    const term = modalSearchTerm.toLowerCase().trim();
    if (!term) return true;
    return (c.name && c.name.toLowerCase().includes(term)) || (c.phone && c.phone.includes(term));
  });

  return (
    <div className="page">
      <div className="page-header">
        <h2>Groups & Segments</h2>
        <p>
          Organize your customers into target groups. Select contacts during group creation or manage group content anytime.
        </p>
      </div>

      {/* Create new group card */}
      <div className="card">
        <h3>Create a New Group</h3>
        
        <form onSubmit={createGroup}>
          <div className="form-row" style={{ marginBottom: 14 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontWeight: 600 }}>Group Name *</label>
              <input
                placeholder="e.g. VIP Customers, Festival Sales 2026..."
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontWeight: 600 }}>Description (Optional)</label>
              <input
                placeholder="e.g. High value buyers with consent"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>

          {/* Contact selection section */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <label style={{ fontWeight: 600, margin: 0 }}>
                Select Contacts to Include
              </label>
              <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
                {contacts.length} contact{contacts.length === 1 ? '' : 's'} available in database
              </span>
            </div>

            {/* Quick Mode Selector Buttons */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
              <button
                type="button"
                className={selectionMode === 'manual' ? '' : 'secondary'}
                style={{ fontSize: 13, padding: '6px 14px' }}
                onClick={() => setSelectionMode('manual')}
              >
                ☑ Pick Specific Contacts ({selectedContactIds.length})
              </button>
              <button
                type="button"
                className={selectionMode === 'all' ? '' : 'secondary'}
                style={{ fontSize: 13, padding: '6px 14px' }}
                onClick={() => {
                  setSelectionMode('all');
                  setContactCount(contacts.length.toString());
                }}
              >
                👥 Add All Contacts ({contacts.length})
              </button>
              <button
                type="button"
                className={selectionMode === 'count' ? '' : 'secondary'}
                style={{ fontSize: 13, padding: '6px 14px' }}
                onClick={() => setSelectionMode('count')}
              >
                🔢 Specify Count
              </button>
              <button
                type="button"
                className={selectionMode === 'none' ? '' : 'secondary'}
                style={{ fontSize: 13, padding: '6px 14px' }}
                onClick={() => {
                  setSelectionMode('none');
                  setSelectedContactIds([]);
                }}
              >
                ⚪ Empty Group (0)
              </button>
            </div>

            {/* Mode A: Manual Search & Checkbox Picker */}
            {selectionMode === 'manual' && (
              <div style={{ background: 'rgba(0,0,0,0.2)', padding: 16, borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
                {/* Search & Action bar */}
                <div style={{ display: 'flex', gap: 10, marginBottom: 12, alignItems: 'center' }}>
                  <div className="search-filter-box" style={{ flex: 1, marginBottom: 0 }}>
                    <svg viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
                    <input
                      type="text"
                      placeholder="Search contacts by name or phone..."
                      value={createSearchTerm}
                      onChange={(e) => setCreateSearchTerm(e.target.value)}
                    />
                  </div>
                  <button type="button" className="secondary" onClick={selectAllOptedIn} style={{ fontSize: 12, padding: '8px 12px', whiteSpace: 'nowrap' }}>
                    Select All Opted-In
                  </button>
                  <button type="button" className="secondary" onClick={() => setSelectedContactIds([])} style={{ fontSize: 12, padding: '8px 12px', whiteSpace: 'nowrap' }}>
                    Clear
                  </button>
                </div>

                {/* Contact list with scroll */}
                {filteredCreateContacts.length > 0 ? (
                  <div style={{ maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {filteredCreateContacts.map((c) => {
                      const isSelected = selectedContactIds.includes(c._id);
                      const isOptedIn = c.optIn?.status === 'opted_in';
                      return (
                        <div
                          key={c._id}
                          className={`contact-picker-item ${isSelected ? 'selected' : ''}`}
                          onClick={() => toggleContactSelection(c._id)}
                          style={{ cursor: 'pointer' }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {}} // handled by parent div onClick
                              style={{ width: 'auto', margin: 0 }}
                            />
                            <div>
                              <div style={{ fontWeight: 600, color: 'var(--color-text)', fontSize: 14 }}>
                                {c.name || 'Unnamed Contact'}
                              </div>
                              <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                                {c.phone}
                              </div>
                            </div>
                          </div>
                          <span className={`badge ${isOptedIn ? 'green' : 'red'}`} style={{ fontSize: 11 }}>
                            {isOptedIn ? 'Opted In' : 'No Consent'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: '10px 0' }}>
                    No contacts found matching search filter.
                  </p>
                )}
              </div>
            )}

            {/* Mode B & C: Numerical count input */}
            {(selectionMode === 'count' || selectionMode === 'all') && (
              <div style={{ background: 'rgba(0,0,0,0.2)', padding: 14, borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
                <label>Number of recent contacts to include:</label>
                <div className="form-row" style={{ marginTop: 6, marginBottom: 0 }}>
                  <input
                    type="number"
                    min="1"
                    max={contacts.length}
                    value={contactCount}
                    onChange={(e) => setContactCount(e.target.value)}
                    required
                  />
                  <div style={{ alignSelf: 'center', fontSize: 13, color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                    out of {contacts.length} available
                  </div>
                </div>
              </div>
            )}
          </div>

          {error && <p className="error" style={{ marginBottom: 14 }}>{error}</p>}

          <button type="submit" disabled={loading || !name.trim()}>
            {loading ? 'Creating Group...' : 'Create Group'}
          </button>
        </form>
      </div>

      {/* Existing Groups Table */}
      <div className="card">
        <h3>Existing Groups</h3>
        {groups.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>Group Name</th>
                <th>Description</th>
                <th>Contacts Included</th>
                <th>Created Date</th>
                <th style={{ width: 220, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g._id}>
                  <td style={{ color: 'var(--color-text)', fontWeight: 600 }}>{g.name}</td>
                  <td style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
                    {g.description || '—'}
                  </td>
                  <td>
                    <span className="badge green">{g.contactCount} contact{g.contactCount === 1 ? '' : 's'}</span>
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                    {new Date(g.createdAt).toLocaleDateString()}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      <button
                        className="secondary"
                        onClick={() => openManageModal(g)}
                        style={{ fontSize: 12, padding: '6px 12px' }}
                      >
                        ⚙ Manage Contacts
                      </button>
                      <button
                        className="danger"
                        onClick={() => removeGroup(g._id)}
                        style={{ fontSize: 12, padding: '6px 12px' }}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty-state" style={{ textAlign: 'center', padding: '40px 0' }}>
            <p style={{ color: 'var(--color-text-muted)' }}>No groups created yet. Use the form above to organize contacts into target segments.</p>
          </div>
        )}
      </div>

      {/* ==========================================================================
          MANAGE MEMBERS MODAL DIALOG
          ========================================================================== */}
      {activeGroupModal && (
        <div className="modal-backdrop" onClick={closeManageModal}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="modal-header">
              <div>
                <h3>Manage Contacts in "{activeGroupModal.name}"</h3>
                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 2 }}>
                  Add or remove contacts from this target group segment
                </div>
              </div>
              <button className="modal-close-btn" onClick={closeManageModal}>✕</button>
            </div>

            {/* Modal Tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--color-border)', background: 'rgba(0,0,0,0.1)' }}>
              <button
                type="button"
                className="secondary"
                style={{
                  flex: 1,
                  borderRadius: 0,
                  border: 'none',
                  borderBottom: modalTab === 'current' ? '2px solid var(--color-primary)' : '2px solid transparent',
                  background: modalTab === 'current' ? 'rgba(37,211,102,0.08)' : 'transparent',
                  color: modalTab === 'current' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                  fontWeight: 600,
                  padding: '12px',
                }}
                onClick={() => setModalTab('current')}
              >
                👥 Current Members ({groupMembers.length})
              </button>
              <button
                type="button"
                className="secondary"
                style={{
                  flex: 1,
                  borderRadius: 0,
                  border: 'none',
                  borderBottom: modalTab === 'add' ? '2px solid var(--color-primary)' : '2px solid transparent',
                  background: modalTab === 'add' ? 'rgba(37,211,102,0.08)' : 'transparent',
                  color: modalTab === 'add' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                  fontWeight: 600,
                  padding: '12px',
                }}
                onClick={() => setModalTab('add')}
              >
                ➕ Add New Members ({availableToAdd.length})
              </button>
            </div>

            {/* Modal Body */}
            <div className="modal-body">
              {/* Search filter inside modal */}
              <div className="search-filter-box">
                <svg viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
                <input
                  type="text"
                  placeholder="Filter members by name or phone..."
                  value={modalSearchTerm}
                  onChange={(e) => setModalSearchTerm(e.target.value)}
                />
              </div>

              {/* Tab 1: Current Members */}
              {modalTab === 'current' && (
                <div>
                  {modalLoading ? (
                    <p style={{ color: 'var(--color-text-muted)', textAlign: 'center', padding: 20 }}>Loading group members...</p>
                  ) : filteredCurrentMembers.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {filteredCurrentMembers.map((member) => (
                        <div key={member._id} className="contact-picker-item">
                          <div>
                            <div style={{ fontWeight: 600, color: 'var(--color-text)' }}>
                              {member.name || 'Unnamed Contact'}
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                              {member.phone}
                            </div>
                          </div>
                          <button
                            className="danger"
                            onClick={() => removeContactFromGroup(member._id)}
                            style={{ fontSize: 11, padding: '4px 10px' }}
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p style={{ color: 'var(--color-text-muted)', textAlign: 'center', padding: '20px 0' }}>
                      No contacts are currently in this group. Click "Add New Members" above to assign contacts.
                    </p>
                  )}
                </div>
              )}

              {/* Tab 2: Add New Members */}
              {modalTab === 'add' && (
                <div>
                  {filteredAvailableToAdd.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {filteredAvailableToAdd.map((contact) => {
                        const isSelected = addMemberSelectedIds.includes(contact._id);
                        return (
                          <div
                            key={contact._id}
                            className={`contact-picker-item ${isSelected ? 'selected' : ''}`}
                            onClick={() => {
                              setAddMemberSelectedIds((prev) =>
                                prev.includes(contact._id)
                                  ? prev.filter((id) => id !== contact._id)
                                  : [...prev, contact._id]
                              );
                            }}
                            style={{ cursor: 'pointer' }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => {}}
                                style={{ width: 'auto', margin: 0 }}
                              />
                              <div>
                                <div style={{ fontWeight: 600, color: 'var(--color-text)' }}>
                                  {contact.name || 'Unnamed Contact'}
                                </div>
                                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                                  {contact.phone}
                                </div>
                              </div>
                            </div>
                            <span className={`badge ${contact.optIn?.status === 'opted_in' ? 'green' : 'red'}`} style={{ fontSize: 11 }}>
                              {contact.optIn?.status === 'opted_in' ? 'Opted In' : 'No Consent'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p style={{ color: 'var(--color-text-muted)', textAlign: 'center', padding: '20px 0' }}>
                      All contacts in your database are already members of this group!
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="modal-footer">
              {modalTab === 'add' ? (
                <button
                  type="button"
                  onClick={addSelectedContactsToGroup}
                  disabled={addMemberSelectedIds.length === 0}
                >
                  Add Selected ({addMemberSelectedIds.length}) to Group
                </button>
              ) : (
                <button type="button" className="secondary" onClick={closeManageModal}>
                  Close
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
