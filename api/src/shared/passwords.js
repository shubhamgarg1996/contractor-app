const bcrypt = require('bcryptjs');

const ROUNDS = 10;

async function hash(plain) {
  return bcrypt.hash(plain, ROUNDS);
}

async function verify(plain, hashed) {
  if (!plain || !hashed) return false;
  try { return await bcrypt.compare(plain, hashed); }
  catch { return false; }
}

module.exports = { hash, verify };
