const { app } = require('@azure/functions');
const { sql, getPool } = require('../shared/db');
const { getPrincipal, hasRole } = require('../shared/auth');
const { hash } = require('../shared/passwords');
const crypto = require('crypto');

const ROLES = ['Admin','FinanceSPOC','Recruiter','Viewer'];

// Generate a 14-char temp password using URL-safe characters.
function generateTempPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789abcdefghjkmnpqrstuvwxyz';
  // Plus a couple of safe symbols so it always has mixed classes
  const symbols = '!@#$';
  const bytes = crypto.randomBytes(14);
  let out = '';
  for (let i = 0; i < 12; i++) out += chars[bytes[i] % chars.length];
  out += symbols[bytes[12] % symbols.length];
  out += (bytes[13] % 10).toString();
  return out;
}

// -----------------------------------------------------
// GET /api/users
// -----------------------------------------------------
app.http('listUsers', {
  methods: ['GET'],
  route: 'users',
  authLevel: 'anonymous',
  handler: async (request) => {
    if (!hasRole(getPrincipal(request), 'Admin'))
      return { status: 401, jsonBody: { error: 'Unauthorized' } };

    const pool = await getPool();
    const r = await pool.request().query(`
      SELECT UserID, Email, DisplayName, [Role], IsActive,
             MustChangePassword, LastLogin, CreatedAt
      FROM dbo.AppUsers
      ORDER BY CreatedAt DESC`);
    return { jsonBody: r.recordset };
  }
});

// -----------------------------------------------------
// POST /api/users
// -----------------------------------------------------
app.http('createUser', {
  methods: ['POST'],
  route: 'users',
  authLevel: 'anonymous',
  handler: async (request, context) => {
    if (!hasRole(getPrincipal(request), 'Admin'))
      return { status: 401, jsonBody: { error: 'Unauthorized' } };

    let body;
    try { body = await request.json(); }
    catch { return { status: 400, jsonBody: { error: 'Invalid JSON body' } }; }

    const email       = (body.email || '').trim().toLowerCase();
    const displayName = body.displayName || email;
    const role        = body.role;

    if (!email)             return { status: 400, jsonBody: { error: 'Email required' } };
    if (!ROLES.includes(role)) return { status: 400, jsonBody: { error: 'Invalid role' } };

    const tempPassword = generateTempPassword();
    const passHash     = await hash(tempPassword);

    try {
      const pool = await getPool();
      await pool.request()
        .input('Email',       sql.NVarChar(255), email)
        .input('DisplayName', sql.NVarChar(200), displayName)
        .input('Role',        sql.NVarChar(20),  role)
        .input('Hash',        sql.NVarChar(255), passHash)
        .query(`
          INSERT INTO dbo.AppUsers (Email, DisplayName, [Role], IsActive, PasswordHash, MustChangePassword)
          VALUES (@Email, @DisplayName, @Role, 1, @Hash, 1)`);

      return {
        status: 201,
        jsonBody: {
          email, role, tempPassword,
          message: 'User created. Share the temp password — they must change it on first login.'
        }
      };
    } catch (e) {
      if (e.number === 2627 || /UNIQUE/i.test(e.message))
        return { status: 409, jsonBody: { error: 'A user with that email already exists' } };
      context.error('createUser failed', e);
      return { status: 500, jsonBody: { error: e.message } };
    }
  }
});

// -----------------------------------------------------
// PUT /api/users/{email}  (role / active / display name)
// -----------------------------------------------------
app.http('updateUser', {
  methods: ['PUT'],
  route: 'users/{email}',
  authLevel: 'anonymous',
  handler: async (request) => {
    const principal = getPrincipal(request);
    if (!hasRole(principal, 'Admin'))
      return { status: 401, jsonBody: { error: 'Unauthorized' } };

    const email = decodeURIComponent(request.params.email).toLowerCase();
    let body;
    try { body = await request.json(); }
    catch { return { status: 400, jsonBody: { error: 'Invalid JSON body' } }; }

    // Self-protection: admin can't lock themselves out
    const isSelf = email === (principal.userDetails || '').toLowerCase();
    if (isSelf) {
      if (body.isActive === false || (body.role && body.role !== 'Admin'))
        return { status: 400, jsonBody: { error: 'You cannot disable your own account or demote yourself' } };
    }

    const pool = await getPool();
    const req = pool.request().input('Email', sql.NVarChar(255), email);
    const sets = [];

    if (body.role !== undefined) {
      if (!ROLES.includes(body.role))
        return { status: 400, jsonBody: { error: 'Invalid role' } };
      sets.push('[Role] = @Role');
      req.input('Role', sql.NVarChar(20), body.role);
    }
    if (body.isActive !== undefined) {
      sets.push('IsActive = @IsActive');
      req.input('IsActive', sql.Bit, body.isActive ? 1 : 0);
    }
    if (body.displayName !== undefined) {
      sets.push('DisplayName = @DisplayName');
      req.input('DisplayName', sql.NVarChar(200), body.displayName);
    }

    if (!sets.length)
      return { status: 400, jsonBody: { error: 'No fields to update' } };

    const result = await req.query(`
      UPDATE dbo.AppUsers SET ${sets.join(', ')} WHERE LOWER(Email) = @Email`);
    if (result.rowsAffected[0] === 0)
      return { status: 404, jsonBody: { error: 'User not found' } };
    return { jsonBody: { ok: true } };
  }
});

// -----------------------------------------------------
// POST /api/users/{email}/reset-password
// -----------------------------------------------------
app.http('resetPassword', {
  methods: ['POST'],
  route: 'users/{email}/reset-password',
  authLevel: 'anonymous',
  handler: async (request) => {
    if (!hasRole(getPrincipal(request), 'Admin'))
      return { status: 401, jsonBody: { error: 'Unauthorized' } };

    const email        = decodeURIComponent(request.params.email).toLowerCase();
    const tempPassword = generateTempPassword();
    const passHash     = await hash(tempPassword);

    const pool = await getPool();
    const result = await pool.request()
      .input('Email', sql.NVarChar(255), email)
      .input('Hash',  sql.NVarChar(255), passHash)
      .query(`
        UPDATE dbo.AppUsers
        SET PasswordHash       = @Hash,
            MustChangePassword = 1,
            FailedAttempts     = 0,
            LockedUntil        = NULL
        WHERE LOWER(Email) = @Email`);
    if (result.rowsAffected[0] === 0)
      return { status: 404, jsonBody: { error: 'User not found' } };

    return {
      jsonBody: {
        tempPassword,
        message: 'Password reset. Share temp password — user changes on next login.'
      }
    };
  }
});
