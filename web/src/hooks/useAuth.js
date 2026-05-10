import { useEffect, useState, useCallback } from 'react';

export function useAuth() {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    fetch('/api/auth/me', { credentials: 'same-origin' })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        setUser(d ? {
          email:              d.email,
          roles:              d.roles || [],
          mustChangePassword: !!d.mustChangePassword
        } : null);
      })
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const has = (...roles) => !!user && roles.some(r => user.roles.includes(r));
  return { user, loading, has, reload: load };
}
