import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuth } from '../hooks/useAuth.js';
import { Api } from '../api/client.js';

export default function Layout() {
  const { user, loading, has } = useAuth();
  const nav = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      nav('/login', { replace: true });
      return;
    }
    if (user.mustChangePassword) {
      nav('/change-password', { replace: true, state: { firstLogin: true } });
    }
  }, [user, loading, nav]);

  async function logout() {
    try { await Api.logout(); } catch {}
    nav('/login', { replace: true });
  }

  if (loading) return <div style={{ padding: 40 }}>Loading…</div>;
  if (!user || user.mustChangePassword) return null;

  return (
    <div className="app">
      <aside className="sidebar">
        <h1>Contractor Tracker</h1>
        <NavLink to="/contractors">Contractors</NavLink>
        <NavLink to="/dashboard">Dashboard</NavLink>
        {has('Admin') && <NavLink to="/import">Import</NavLink>}
        {has('Admin') && <NavLink to="/users">Users</NavLink>}
      </aside>
      <main className="main">
        <div className="topbar">
          <div className="user">
            {user.email} · <span className="muted">{user.roles.join(', ') || 'no role'}</span>
            {' · '}
            <a href="/change-password" onClick={(e) => { e.preventDefault(); nav('/change-password'); }}>
              Change password
            </a>
            {' · '}
            <a href="#" onClick={(e) => { e.preventDefault(); logout(); }}>Sign out</a>
          </div>
        </div>
        <Outlet />
      </main>
    </div>
  );
}
