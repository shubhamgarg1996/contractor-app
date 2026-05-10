import { useEffect, useState } from 'react';

export function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/.auth/me')
      .then(r => r.ok ? r.json() : { clientPrincipal: null })
      .then(d => {
        const p = d.clientPrincipal;
        setUser(p ? {
          id: p.userId,
          email: p.userDetails,
          roles: p.userRoles || [],
          provider: p.identityProvider
        } : null);
      })
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const has = (...roles) => !!user && roles.some(r => user.roles.includes(r));
  return { user, loading, has };
}
