import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';

export default function Layout() {
  const { user, loading, has } = useAuth();

  if (loading) return <div style={{ padding: 40 }}>Loading…</div>;

  if (!user) {
    // Not authenticated — bounce to AAD login
    window.location.href = '/.auth/login/aad';
    return null;
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <h1>Contractor Tracker</h1>
        <NavLink to="/contractors">Contractors</NavLink>
        <NavLink to="/dashboard">Dashboard</NavLink>
        {has('Admin') && <NavLink to="/import">Import</NavLink>}
      </aside>
      <main className="main">
        <div className="topbar">
          <div className="user">
            {user.email} · <span className="muted">{user.roles.join(', ') || 'no role'}</span>
            {' · '}<a href="/.auth/logout">Sign out</a>
          </div>
        </div>
        <Outlet />
      </main>
    </div>
  );
}
