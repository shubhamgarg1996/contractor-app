const jwt = require('jsonwebtoken');

const EXPIRES_IN = '8h';

function getSecret() {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error('JWT_SECRET environment variable is not set');
  if (s.length < 32) throw new Error('JWT_SECRET must be at least 32 characters');
  return s;
}

function signToken(payload) {
  return jwt.sign(payload, getSecret(), { expiresIn: EXPIRES_IN });
}

function verifyToken(token) {
  if (!token) return null;
  try { return jwt.verify(token, getSecret()); }
  catch { return null; }
}

module.exports = { signToken, verifyToken, EXPIRES_IN };
