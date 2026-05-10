import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Api } from '../api/client.js';

export default function ChangePassword() {
  const location = useLocation();
  const nav      = useNavigate();
  const isFirstLogin = location.state?.firstLogin;

  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm]         = useState('');
  const [error, setError]             = useState('');
  const [busy, setBusy]               = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (newPassword !== confirm)  { setError('New passwords do not match'); return; }
    if (newPassword.length < 10)  { setError('Password must be at least 10 characters'); return; }
    setBusy(true);
    try {
      await Api.changePassword(oldPassword, newPassword);
      nav('/contractors');
    } catch (err) {
      try { const j = JSON.parse(err.message); setError(j.error || err.message); }
      catch { setError(err.message); }
    } finally { setBusy(false); }
  }

  return (
    <div className="auth-shell">
      <form onSubmit={submit} className="auth-card" style={{ width: 420 }}>
        <h2 style={{ marginTop: 0, marginBottom: 6 }}>
          {isFirstLogin ? 'Set your password' : 'Change password'}
        </h2>
        {isFirstLogin && (
          <p className="muted" style={{ marginBottom: 24 }}>
            Welcome — choose a password to continue.
          </p>
        )}

        {error && <div className="error">{error}</div>}

        <div className="form-row">
          <label>{isFirstLogin ? 'Temporary password' : 'Current password'}</label>
          <input type="password" value={oldPassword}
                 onChange={e => setOldPassword(e.target.value)}
                 required autoFocus autoComplete="current-password" />
        </div>

        <div className="form-row">
          <label>New password (10+ characters)</label>
          <input type="password" value={newPassword}
                 onChange={e => setNewPassword(e.target.value)}
                 required minLength={10} autoComplete="new-password" />
        </div>

        <div className="form-row">
          <label>Confirm new password</label>
          <input type="password" value={confirm}
                 onChange={e => setConfirm(e.target.value)}
                 required minLength={10} autoComplete="new-password" />
        </div>

        <button type="submit" className="btn" disabled={busy}
                style={{ width: '100%', marginTop: 8 }}>
          {busy ? 'Saving…' : 'Save password'}
        </button>

        {!isFirstLogin && (
          <button type="button" className="btn secondary"
                  onClick={() => nav('/contractors')}
                  style={{ width: '100%', marginTop: 8 }}>
            Cancel
          </button>
        )}
      </form>
    </div>
  );
}
