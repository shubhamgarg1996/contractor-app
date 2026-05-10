import { useEffect, useState } from 'react';
import { Api } from '../api/client.js';
import { useAuth } from '../hooks/useAuth.js';

const ROLES = ['Admin', 'FinanceSPOC', 'Recruiter', 'Viewer'];

export default function UsersPage() {
  const { user: me } = useAuth();
  const [users, setUsers]               = useState([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState('');
  const [showCreate, setShowCreate]     = useState(false);
  const [tempPassword, setTempPassword] = useState(null);   // { email, password }

  async function load() {
    setLoading(true); setError('');
    try { setUsers(await Api.listUsers() || []); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function reset(email) {
    if (!confirm(`Reset password for ${email}? They will be forced to change it on next login.`)) return;
    try {
      const r = await Api.resetUserPwd(email);
      setTempPassword({ email, password: r.tempPassword });
    } catch (e) { setError(e.message); }
  }

  async function setRole(email, role) {
    try { await Api.updateUser(email, { role }); load(); }
    catch (e) {
      try { const j = JSON.parse(e.message); setError(j.error || e.message); }
      catch { setError(e.message); }
    }
  }

  async function toggleActive(email, isActive) {
    try { await Api.updateUser(email, { isActive: !isActive }); load(); }
    catch (e) {
      try { const j = JSON.parse(e.message); setError(j.error || e.message); }
      catch { setError(e.message); }
    }
  }

  return (
    <div>
      <h2>Users</h2>
      {error && <div className="error">{error}</div>}

      {tempPassword && (
        <div className="card" style={{ background: '#fef3c7', borderLeft: '4px solid #d97706' }}>
          <h3 style={{ marginTop: 0, marginBottom: 8 }}>Temporary password for {tempPassword.email}</h3>
          <p className="muted" style={{ marginBottom: 12 }}>
            Copy this and share it securely (Teams DM, password manager). It will not be shown again.
          </p>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <code style={{ fontSize: 16, padding: '6px 12px', background: '#fff',
                           borderRadius: 4, border: '1px solid #d97706' }}>
              {tempPassword.password}
            </code>
            <button className="btn secondary"
                    onClick={() => { navigator.clipboard.writeText(tempPassword.password); }}>
              Copy
            </button>
            <button className="btn" onClick={() => setTempPassword(null)}>Got it</button>
          </div>
        </div>
      )}

      <div className="toolbar">
        <button className="btn" onClick={() => setShowCreate(true)} disabled={showCreate}>
          + New user
        </button>
      </div>

      {showCreate && (
        <CreateUserCard
          onCreated={(t) => { setShowCreate(false); setTempPassword(t); load(); }}
          onCancel={() => setShowCreate(false)}
        />
      )}

      <div className="card scroll-x">
        {loading ? <p>Loading…</p> : users.length === 0 ? (
          <p className="muted">No users yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Email</th>
                <th>Name</th>
                <th>Role</th>
                <th>Status</th>
                <th>Last login</th>
                <th>Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => {
                const isMe = me && me.email && me.email.toLowerCase() === (u.Email || '').toLowerCase();
                return (
                  <tr key={u.UserID}>
                    <td>{u.Email} {isMe && <span className="muted">(you)</span>}</td>
                    <td>{u.DisplayName || '—'}</td>
                    <td>
                      <select value={u.Role} disabled={isMe}
                              onChange={e => setRole(u.Email, e.target.value)}
                              style={{ width: 140 }}>
                        {ROLES.map(r => <option key={r}>{r}</option>)}
                      </select>
                    </td>
                    <td>
                      <button className={u.IsActive ? 'btn secondary' : 'btn danger'}
                              disabled={isMe}
                              onClick={() => toggleActive(u.Email, u.IsActive)}>
                        {u.IsActive ? 'Active' : 'Disabled'}
                      </button>
                      {u.MustChangePassword ? (
                        <span className="muted" style={{ marginLeft: 8 }}>· must change pwd</span>
                      ) : null}
                    </td>
                    <td>{u.LastLogin ? new Date(u.LastLogin).toLocaleString('en-IN') : '—'}</td>
                    <td>{u.CreatedAt ? new Date(u.CreatedAt).toLocaleDateString('en-IN') : '—'}</td>
                    <td>
                      <button className="btn secondary" onClick={() => reset(u.Email)}>
                        Reset password
                      </button>
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

function CreateUserCard({ onCreated, onCancel }) {
  const [email, setEmail]             = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole]               = useState('Viewer');
  const [error, setError]             = useState('');
  const [busy, setBusy]               = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      const r = await Api.createUser({
        email: email.trim().toLowerCase(),
        displayName: displayName || null,
        role
      });
      onCreated({ email: r.email, password: r.tempPassword });
    } catch (err) {
      try { const j = JSON.parse(err.message); setError(j.error || err.message); }
      catch { setError(err.message); }
    } finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} className="card">
      <h3 style={{ marginTop: 0 }}>Create user</h3>
      {error && <div className="error">{error}</div>}
      <div className="grid cols-3">
        <div className="form-row">
          <label>Email *</label>
          <input type="email" value={email}
                 onChange={e => setEmail(e.target.value)} required autoFocus />
        </div>
        <div className="form-row">
          <label>Display name</label>
          <input value={displayName} onChange={e => setDisplayName(e.target.value)}
                 placeholder="Optional" />
        </div>
        <div className="form-row">
          <label>Role *</label>
          <select value={role} onChange={e => setRole(e.target.value)}>
            {ROLES.map(r => <option key={r}>{r}</option>)}
          </select>
        </div>
      </div>
      <div className="toolbar">
        <button type="submit" className="btn" disabled={busy}>
          {busy ? 'Creating…' : 'Create + generate temp password'}
        </button>
        <button type="button" className="btn secondary" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
