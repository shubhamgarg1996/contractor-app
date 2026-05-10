// HTTP cookie helpers for the auth token.

const COOKIE_NAME = 'cnt_token';
const MAX_AGE_SEC = 8 * 3600; // 8 hours

const isProduction = (process.env.NODE_ENV || 'production') !== 'development';

function parseCookies(cookieHeader) {
  if (!cookieHeader) return {};
  const out = {};
  cookieHeader.split(';').forEach(part => {
    const idx = part.indexOf('=');
    if (idx < 0) return;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  });
  return out;
}

function setCookieHeader(token, maxAgeSec = MAX_AGE_SEC) {
  const flags = ['HttpOnly', `SameSite=Lax`, 'Path=/', `Max-Age=${maxAgeSec}`];
  if (isProduction) flags.unshift('Secure');
  return `${COOKIE_NAME}=${token}; ${flags.join('; ')}`;
}

function clearCookieHeader() {
  const flags = ['HttpOnly', `SameSite=Lax`, 'Path=/', 'Max-Age=0'];
  if (isProduction) flags.unshift('Secure');
  return `${COOKIE_NAME}=; ${flags.join('; ')}`;
}

module.exports = { parseCookies, setCookieHeader, clearCookieHeader, COOKIE_NAME, MAX_AGE_SEC };
