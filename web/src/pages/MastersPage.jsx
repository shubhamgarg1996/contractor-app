import { useEffect, useState } from 'react';
import { Api } from '../api/client.js';
import { useAuth } from '../hooks/useAuth.js';

export default function MastersPage() {
  const { has } = useAuth();
  return (
    <div>
      <h2>Masters</h2>
      <p className="muted" style={{ marginBottom: 16 }}>
        Manage the vendor and entity dropdowns shown on the Contractor detail page.
        Deactivating an entry hides it from new dropdowns but keeps existing references intact.
      </p>

      <div className="grid cols-2">
        <MasterSection
          title="Vendors"
          singular="vendor"
          loadAll={Api.vendorsAll}
          create={Api.createVendor}
          update={Api.updateVendor}
          idField="VendorID"
          nameField="VendorName"
          payloadKey="vendorName"
          canEdit={has('Admin', 'FinanceSPOC', 'Recruiter')}
          canDeactivate={has('Admin')}
        />
        <MasterSection
          title="Entities"
          singular="entity"
          loadAll={Api.entitiesAll}
          create={Api.createEntity}
          update={Api.updateEntity}
          idField="EntityID"
          nameField="EntityName"
          payloadKey="entityName"
          canEdit={has('Admin', 'FinanceSPOC', 'Recruiter')}
          canDeactivate={has('Admin')}
        />
      </div>
    </div>
  );
}

function MasterSection({
  title, singular,
  loadAll, create, update,
  idField, nameField, payloadKey,
  canEdit, canDeactivate
}) {
  const [rows, setRows]               = useState([]);
  const [loading, setLoading]         = useState(true);
  const [newName, setNewName]         = useState('');
  const [editingId, setEditingId]     = useState(null);
  const [editingName, setEditingName] = useState('');
  const [error, setError]             = useState('');
  const [busy, setBusy]               = useState(false);

  async function load() {
    setLoading(true); setError('');
    try { setRows(await loadAll() || []); }
    catch (e) { setError(parseErr(e)); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  async function add() {
    const name = newName.trim();
    if (!name) return;
    setBusy(true); setError('');
    try {
      await create(name);
      setNewName('');
      load();
    } catch (e) { setError(parseErr(e)); }
    finally { setBusy(false); }
  }

  async function saveEdit(id) {
    const name = editingName.trim();
    if (!name) return;
    setBusy(true); setError('');
    try {
      await update(id, { [payloadKey]: name });
      setEditingId(null);
      setEditingName('');
      load();
    } catch (e) { setError(parseErr(e)); }
    finally { setBusy(false); }
  }

  async function toggleActive(row) {
    const usage = row.UsageCount || 0;
    let msg;
    if (row.IsActive) {
      msg = usage > 0
        ? `${row[nameField]} is referenced by ${usage} contractor${usage === 1 ? '' : 's'}. Existing references stay intact, but it won't appear in new dropdowns. Deactivate?`
        : `Deactivate ${row[nameField]}?`;
    } else {
      msg = `Reactivate ${row[nameField]}?`;
    }
    if (!confirm(msg)) return;
    setBusy(true); setError('');
    try {
      await update(row[idField], { isActive: !row.IsActive });
      load();
    } catch (e) { setError(parseErr(e)); }
    finally { setBusy(false); }
  }

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>{title}</h3>
      {error && <div className="error">{error}</div>}

      {canEdit && (
        <div className="toolbar" style={{ marginBottom: 12 }}>
          <input
            placeholder={`Add new ${singular}…`}
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') add(); }}
            style={{ flex: 1 }}
            disabled={busy}
          />
          <button className="btn" onClick={add} disabled={!newName.trim() || busy}>
            Add
          </button>
        </div>
      )}

      <div className="scroll-x">
        {loading ? <p>Loading…</p> : rows.length === 0 ? (
          <p className="muted">None yet — add your first {singular} above.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th style={{ width: 60 }}>Used</th>
                <th style={{ width: 90 }}>Status</th>
                <th style={{ width: 200 }}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const isEditing = editingId === r[idField];
                return (
                  <tr key={r[idField]} style={{ opacity: r.IsActive ? 1 : 0.55 }}>
                    <td>
                      {isEditing ? (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <input
                            value={editingName}
                            onChange={e => setEditingName(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') saveEdit(r[idField]);
                              if (e.key === 'Escape') { setEditingId(null); setEditingName(''); }
                            }}
                            autoFocus
                          />
                        </div>
                      ) : r[nameField]}
                    </td>
                    <td>{r.UsageCount ?? 0}</td>
                    <td>{r.IsActive ? 'Active' : 'Inactive'}</td>
                    <td>
                      {isEditing ? (
                        <>
                          <button className="btn" onClick={() => saveEdit(r[idField])} disabled={busy}>Save</button>
                          {' '}
                          <button className="btn secondary" onClick={() => { setEditingId(null); setEditingName(''); }}>Cancel</button>
                        </>
                      ) : (
                        <>
                          {canEdit && (
                            <button className="btn secondary"
                                    onClick={() => { setEditingId(r[idField]); setEditingName(r[nameField]); }}>
                              Rename
                            </button>
                          )}
                          {' '}
                          {canDeactivate && (
                            <button
                              className={r.IsActive ? 'btn secondary' : 'btn'}
                              onClick={() => toggleActive(r)}>
                              {r.IsActive ? 'Deactivate' : 'Reactivate'}
                            </button>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function parseErr(e) {
  try {
    const j = JSON.parse(e.message);
    return j.error || e.message;
  } catch { return e.message; }
}
