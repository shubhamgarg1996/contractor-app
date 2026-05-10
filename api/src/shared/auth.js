// Auth helpers — JWT cookie based.
// Public interface (getPrincipal, hasRole, userEmail) is unchanged from the
// original SWA-Entra version, so existing functions don't need to be rewritten.

const { parseCookies, COOKIE_NAME } = require('./cookies');
const { verifyToken } = require('./jwt');

// Returns the current principal, or null.
// Shape: { userId, userDetails (email), userRoles[], mustChangePassword }
function getPrincipal(request) {
  const cookies = parseCookies(request.headers.get('cookie'));
  const token = cookies[COOKIE_NAME];
  const payload = verifyToken(token);
  if (!payload) return null;
  return {
    userId: payload.sub,
    userDetails: payload.email,
    userRoles: payload.roles || [],
    mustChangePassword: !!payload.mustChange
  };
}

// True only if authenticated, has at least one allowed role, and is NOT
// pending a password change. Users with mustChangePassword=true get false
// here — meaning every data endpoint refuses them — until they hit the
// change-password endpoint and get a fresh token.
function hasRole(principal, ...allowed) {
  if (!principal) return false;
  if (principal.mustChangePassword) return false;
  const roles = principal.userRoles || [];
  return allowed.some(r => roles.includes(r));
}

function userEmail(principal) {
  return principal && principal.userDetails ? principal.userDetails : 'anonymous';
}

module.exports = { getPrincipal, hasRole, userEmail };
