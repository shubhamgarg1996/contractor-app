import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Api } from '../api/client.js';

export default function Login() {
  const nav = useNavigate();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [busy, setBusy]         = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      const r = await Api.login(email.trim(), password);
      if (!r) return;
      if (r.mustChangePassword) {
        nav('/change-password', { state: { firstLogin: true } });
      } else {
        nav('/contractors');
      }
    } catch (err) {
      // Server returns plaintext or JSON error string; try to parse
      try {
        const j = JSON.parse(err.message);
        setError(j.error || err.message);
      } catch {
        setError(err.message);
      }
    } finally { setBusy(false); }
  }

  return (
    <div className="auth-shell">
      <form onSubmit={submit} className="auth-card">
        <h2 style={{ marginTop: 0, marginBottom: 6 }}>Contractor Tracker</h2>
        <p className="muted" style={{ marginBottom: 24 }}>Sign in to continue</p>

        {error && <div className="error">{error}</div>}

        <div className="form-row">
          <label>Email</label>
          <input type="email" value={email}
                 onChange={e => setEmail(e.target.value)}
                 required autoFocus autoComplete="email" />
        </div>

        <div className="form-row">
          <label>Password</label>
          <input type="password" value={password}
                 onChange={e => setPassword(e.target.value)}
                 required autoComplete="current-password" />
        </div>

        <button type="submit" className="btn" disabled={busy}
                style={{ width: '100%', marginTop: 8 }}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
