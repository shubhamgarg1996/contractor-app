const { app } = require('@azure/functions');
const { sql, getPool } = require('../shared/db');
const { getPrincipal, hasRole } = require('../shared/auth');

app.http('auditByHRMID', {
  methods: ['GET'],
  route: 'audit/{hrmid}',
  authLevel: 'anonymous',
  handler: async (request) => {
    if (!hasRole(getPrincipal(request), 'Admin'))
      return { status: 401, body: 'Unauthorized' };
    const pool = await getPool();
    const r = await pool.request()
      .input('HRMID', sql.NVarChar(50), request.params.hrmid)
      .query(`SELECT TOP 1000 *
              FROM dbo.AuditLog
              WHERE HRMID=@HRMID
              ORDER BY ChangedAt DESC`);
    return { jsonBody: r.recordset };
  }
});
