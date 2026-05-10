// Static Web Apps injects an x-ms-client-principal header on every API call.
// It's a base64-encoded JSON: { userId, userDetails, identityProvider, userRoles: [..] }
// Roles are assigned via the SWA portal (Invitations) or via a roles function.

function getPrincipal(request) {
  const header = request.headers.get('x-ms-client-principal');
  if (!header) return null;
  try {
    const json = Buffer.from(header, 'base64').toString('utf8');
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function hasRole(principal, ...allowed) {
  if (!principal) return false;
  const roles = principal.userRoles || [];
  return allowed.some(r => roles.includes(r));
}

function userEmail(principal) {
  return principal && principal.userDetails ? principal.userDetails : 'anonymous';
}

module.exports = { getPrincipal, hasRole, userEmail };
