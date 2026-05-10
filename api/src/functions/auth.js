const { app } = require('@azure/functions');
const { sql, getPool } = require('../shared/db');
const { hash, verify } = require('../shared/passwords');
const { signToken } = require('../shared/jwt');
const { getPrincipal } = require('../shared/auth');
const { setCookieHeader, clearCookieHeader } = require('../shared/cookies');

const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_MINUTES   = 15;

// -----------------------------------------------------
// POST /api/auth/login
// -----------------------------------------------------
app.http('login', {
  methods: ['POST'],
  route: 'auth/login',
  authLevel: 'anonymous',
  handler: async (request, context) => {
    let body;
    try { body = await request.json(); }
    catch { return { status: 400, jsonBody: { error: 'Invalid JSON body' } }; }

    const email    = (body.email || '').trim().toLowerCase();
    const password = body.password || '';
    if (!email || !password)
      return { status: 400, jsonBody: { error: 'Email and password required' } };

    try {
      const pool = await getPool();
      const r = await pool.request()
        .input('Email', sql.NVarChar(255), email)
        .query(`
          SELECT UserID, Email, DisplayName, [Role], IsActive,
                 PasswordHash, MustChangePassword, FailedAttempts, LockedUntil
          FROM dbo.AppUsers WHERE LOWER(Email) = @Email`);

      if (!r.recordset.length)
        return { status: 401, jsonBody: { error: 'Invalid email or password' } };

      const u = r.recordset[0];

      if (!u.IsActive)
        return { status: 401, jsonBody: { error: 'Account disabled. Contact an admin.' } };

      if (u.LockedUntil && new Date(u.LockedUntil) > new Date()) {
        const mins = Math.ceil((new Date(u.LockedUntil) - new Date()) / 60000);
        return { status: 401, jsonBody: { error: `Account locked. Try again in ${mins} minutes.` } };
      }

      const ok = await verify(password, u.PasswordHash);

      if (!ok) {
        const newFailed = (u.FailedAttempts || 0) + 1;
        const lock = newFailed >= LOCKOUT_THRESHOLD;
        await pool.request()
          .input('UserID', sql.Int, u.UserID)
          .input('Failed', sql.Int, newFailed)
          .input('Lock',   sql.Bit, lock ? 1 : 0)
          .query(`
            UPDATE dbo.AppUsers
            SET FailedAttempts = @Failed,
                LockedUntil    = CASE WHEN @Lock = 1
                                      THEN DATEADD(MINUTE, ${LOCKOUT_MINUTES}, SYSUTCDATETIME())
                                      ELSE LockedUntil END
            WHERE UserID = @UserID`);
        return { status: 401, jsonBody: { error: 'Invalid email or password' } };
      }

      // Success — reset counters, stamp last login
      await pool.request()
        .input('UserID', sql.Int, u.UserID)
        .query(`
          UPDATE dbo.AppUsers
          SET FailedAttempts = 0, LockedUntil = NULL, LastLogin = SYSUTCDATETIME()
          WHERE UserID = @UserID`);

      const token = signToken({
        sub:        u.UserID,
        email:      u.Email,
        roles:      [u.Role],
        mustChange: !!u.MustChangePassword
      });

      return {
        status: 200,
        jsonBody: {
          email:              u.Email,
          displayName:        u.DisplayName,
          roles:              [u.Role],
          mustChangePassword: !!u.MustChangePassword
        },
        headers: { 'Set-Cookie': setCookieHeader(token) }
      };
    } catch (e) {
      context.error('login failed', e);
      return { status: 500, jsonBody: { error: e.message } };
    }
  }
});

// -----------------------------------------------------
// POST /api/auth/logout
// -----------------------------------------------------
app.http('logout', {
  methods: ['POST'],
  route: 'auth/logout',
  authLevel: 'anonymous',
  handler: async () => ({
    status: 200,
    jsonBody: { ok: true },
    headers: { 'Set-Cookie': clearCookieHeader() }
  })
});

// -----------------------------------------------------
// GET /api/auth/me
// -----------------------------------------------------
app.http('me', {
  methods: ['GET'],
  route: 'auth/me',
  authLevel: 'anonymous',
  handler: async (request) => {
    const p = getPrincipal(request);
    if (!p) return { status: 401, jsonBody: { error: 'Not authenticated' } };
    return {
      status: 200,
      jsonBody: {
        email:              p.userDetails,
        roles:              p.userRoles,
        mustChangePassword: p.mustChangePassword
      }
    };
  }
});

// -----------------------------------------------------
// POST /api/auth/change-password
// -----------------------------------------------------
app.http('changePassword', {
  methods: ['POST'],
  route: 'auth/change-password',
  authLevel: 'anonymous',
  handler: async (request, context) => {
    const p = getPrincipal(request);
    if (!p) return { status: 401, jsonBody: { error: 'Not authenticated' } };

    let body;
    try { body = await request.json(); }
    catch { return { status: 400, jsonBody: { error: 'Invalid JSON body' } }; }

    const oldPassword = body.oldPassword || '';
    const newPassword = body.newPassword || '';
    if (newPassword.length < 10)
      return { status: 400, jsonBody: { error: 'New password must be at least 10 characters' } };
    if (newPassword === oldPassword)
      return { status: 400, jsonBody: { error: 'New password must differ from old' } };

    try {
      const pool = await getPool();
      const r = await pool.request()
        .input('UserID', sql.Int, p.userId)
        .query(`SELECT PasswordHash, [Role] FROM dbo.AppUsers WHERE UserID = @UserID`);
      if (!r.recordset.length)
        return { status: 401, jsonBody: { error: 'User not found' } };

      const ok = await verify(oldPassword, r.recordset[0].PasswordHash);
      if (!ok)
        return { status: 401, jsonBody: { error: 'Current password incorrect' } };

      const newHash = await hash(newPassword);
      await pool.request()
        .input('UserID', sql.Int, p.userId)
        .input('Hash',   sql.NVarChar(255), newHash)
        .query(`
          UPDATE dbo.AppUsers
          SET PasswordHash = @Hash, MustChangePassword = 0
          WHERE UserID = @UserID`);

      // Reissue token without mustChange flag
      const token = signToken({
        sub:        p.userId,
        email:      p.userDetails,
        roles:      [r.recordset[0].Role],
        mustChange: false
      });

      return {
        status: 200,
        jsonBody: { ok: true },
        headers: { 'Set-Cookie': setCookieHeader(token) }
      };
    } catch (e) {
      context.error('changePassword failed', e);
      return { status: 500, jsonBody: { error: e.message } };
    }
  }
});

// -----------------------------------------------------
// POST /api/auth/bootstrap
// One-time: creates the very first admin. Refuses once any user exists.
// -----------------------------------------------------
app.http('bootstrap', {
  methods: ['POST'],
  route: 'auth/bootstrap',
  authLevel: 'anonymous',
  handler: async (request, context) => {
    let body;
    try { body = await request.json(); }
    catch { return { status: 400, jsonBody: { error: 'Invalid JSON body' } }; }

    const email       = (body.email || '').trim().toLowerCase();
    const password    = body.password || '';
    const displayName = body.displayName || email;

    if (!email || !password)
      return { status: 400, jsonBody: { error: 'Email and password required' } };
    if (password.length < 10)
      return { status: 400, jsonBody: { error: 'Password must be at least 10 characters' } };

    try {
      const pool  = await getPool();
      const count = await pool.request().query(`SELECT COUNT(*) AS N FROM dbo.AppUsers`);
      if (count.recordset[0].N > 0)
        return { status: 403, jsonBody: { error: 'Bootstrap already complete. Use the admin user to create new users.' } };

      const passHash = await hash(password);
      await pool.request()
        .input('Email',       sql.NVarChar(255), email)
        .input('DisplayName', sql.NVarChar(200), displayName)
        .input('Role',        sql.NVarChar(20),  'Admin')
        .input('Hash',        sql.NVarChar(255), passHash)
        .query(`
          INSERT INTO dbo.AppUsers (Email, DisplayName, [Role], IsActive, PasswordHash, MustChangePassword)
          VALUES (@Email, @DisplayName, @Role, 1, @Hash, 0)`);

      return {
        status: 201,
        jsonBody: { email, role: 'Admin', message: 'Bootstrap complete. You can now sign in.' }
      };
    } catch (e) {
      context.error('bootstrap failed', e);
      return { status: 500, jsonBody: { error: e.message } };
    }
  }
});
