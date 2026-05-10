const { app } = require('@azure/functions');
const { sql, getPool } = require('../shared/db');
const { getPrincipal, hasRole, userEmail } = require('../shared/auth');
const { ALL_COLUMNS, allowedColumnsForRole } = require('../shared/columns');
const { logChanges } = require('../shared/audit');

// -----------------------------------------------------
// GET /api/contractors  (list with simple filters)
// -----------------------------------------------------
app.http('listContractors', {
  methods: ['GET'],
  route: 'contractors',
  authLevel: 'anonymous',
  handler: async (request) => {
    const principal = getPrincipal(request);
    if (!hasRole(principal, 'Admin','FinanceSPOC','Recruiter','Viewer'))
      return { status: 401, body: 'Unauthorized' };

    const url = new URL(request.url);
    const status   = url.searchParams.get('status');
    const vendorId = url.searchParams.get('vendorId');
    const entityId = url.searchParams.get('entityId');
    const search   = url.searchParams.get('search');
    const top      = Math.min(parseInt(url.searchParams.get('top') || '500', 10), 2000);

    const pool = await getPool();
    const req = pool.request();
    const where = ['1=1'];
    if (status)   { where.push('c.[Status] = @status');     req.input('status',   sql.NVarChar(50), status); }
    if (vendorId) { where.push('c.VendorID = @vendorId');   req.input('vendorId', sql.Int, +vendorId); }
    if (entityId) { where.push('c.EntityID = @entityId');   req.input('entityId', sql.Int, +entityId); }
    if (search)   { where.push('(c.[Name] LIKE @s OR c.HRMID LIKE @s)');
                    req.input('s', sql.NVarChar(200), `%${search}%`); }

    const r = await req.query(`
      SELECT TOP (${top}) c.*, v.VendorName, e.EntityName
      FROM dbo.Contractors c
      LEFT JOIN dbo.Vendors  v ON v.VendorID = c.VendorID
      LEFT JOIN dbo.Entities e ON e.EntityID = c.EntityID
      WHERE ${where.join(' AND ')}
      ORDER BY c.UpdatedAt DESC`);

    return { jsonBody: r.recordset };
  }
});

// -----------------------------------------------------
// GET /api/contractors/{hrmid}
// -----------------------------------------------------
app.http('getContractor', {
  methods: ['GET'],
  route: 'contractors/{hrmid}',
  authLevel: 'anonymous',
  handler: async (request) => {
    const principal = getPrincipal(request);
    if (!hasRole(principal, 'Admin','FinanceSPOC','Recruiter','Viewer'))
      return { status: 401, body: 'Unauthorized' };

    const pool = await getPool();
    const r = await pool.request()
      .input('HRMID', sql.NVarChar(50), request.params.hrmid)
      .query(`
        SELECT c.*, v.VendorName, e.EntityName
        FROM dbo.Contractors c
        LEFT JOIN dbo.Vendors  v ON v.VendorID = c.VendorID
        LEFT JOIN dbo.Entities e ON e.EntityID = c.EntityID
        WHERE c.HRMID = @HRMID`);
    if (!r.recordset.length) return { status: 404 };
    return { jsonBody: r.recordset[0] };
  }
});

// -----------------------------------------------------
// POST /api/contractors
// -----------------------------------------------------
app.http('createContractor', {
  methods: ['POST'],
  route: 'contractors',
  authLevel: 'anonymous',
  handler: async (request, context) => {
    const principal = getPrincipal(request);
    if (!hasRole(principal, 'Admin','FinanceSPOC','Recruiter'))
      return { status: 401, body: 'Unauthorized' };

    const body = await request.json();
    if (!body.HRMID || !body.Name)
      return { status: 400, jsonBody: { error: 'HRMID and Name are required' } };

    const allowed = allowedColumnsForRole(principal.userRoles || []);
    const cols    = ALL_COLUMNS.filter(c => allowed.has(c) && body[c] !== undefined);
    const insertCols = ['HRMID', ...cols];
    const insertVals = insertCols.map(c => '@' + c).join(',');

    const pool = await getPool();
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
      const req = new sql.Request(tx);
      req.input('HRMID', sql.NVarChar(50), body.HRMID);
      cols.forEach(c => req.input(c, body[c]));
      req.input('CreatedBy', sql.NVarChar(255), userEmail(principal));
      req.input('UpdatedBy', sql.NVarChar(255), userEmail(principal));

      await req.query(`
        INSERT INTO dbo.Contractors (${insertCols.join(',')}, CreatedBy, UpdatedBy)
        VALUES (${insertVals}, @CreatedBy, @UpdatedBy)`);

      const newRow = { Name: body.Name };
      cols.forEach(c => newRow[c] = body[c]);
      await logChanges(tx, body.HRMID, null, newRow, 'INSERT', userEmail(principal));

      await tx.commit();
      return { status: 201, jsonBody: { HRMID: body.HRMID } };
    } catch (e) {
      await tx.rollback();
      context.error('createContractor failed', e);
      return { status: 500, jsonBody: { error: e.message } };
    }
  }
});

// -----------------------------------------------------
// PUT /api/contractors/{hrmid}
// -----------------------------------------------------
app.http('updateContractor', {
  methods: ['PUT'],
  route: 'contractors/{hrmid}',
  authLevel: 'anonymous',
  handler: async (request, context) => {
    const principal = getPrincipal(request);
    if (!hasRole(principal, 'Admin','FinanceSPOC','Recruiter'))
      return { status: 401, body: 'Unauthorized' };

    const hrmid = request.params.hrmid;
    const body  = await request.json();
    const allowed = allowedColumnsForRole(principal.userRoles || []);
    const updateCols = ALL_COLUMNS.filter(c => allowed.has(c) && body[c] !== undefined);
    if (!updateCols.length)
      return { status: 400, jsonBody: { error: 'No editable columns in payload for your role' } };

    const pool = await getPool();
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
      const oldR = await new sql.Request(tx)
        .input('HRMID', sql.NVarChar(50), hrmid)
        .query('SELECT * FROM dbo.Contractors WHERE HRMID=@HRMID');
      if (!oldR.recordset.length) {
        await tx.rollback();
        return { status: 404 };
      }
      const oldRow = oldR.recordset[0];

      const req = new sql.Request(tx);
      req.input('HRMID', sql.NVarChar(50), hrmid);
      req.input('UpdatedBy', sql.NVarChar(255), userEmail(principal));
      updateCols.forEach(c => req.input(c, body[c]));

      const setClause = updateCols.map(c => `[${c}]=@${c}`).join(',');
      await req.query(`
        UPDATE dbo.Contractors
        SET ${setClause}, UpdatedBy=@UpdatedBy, UpdatedAt=SYSUTCDATETIME()
        WHERE HRMID=@HRMID`);

      const newRow = {}, oldSubset = {};
      updateCols.forEach(c => { newRow[c] = body[c]; oldSubset[c] = oldRow[c]; });
      await logChanges(tx, hrmid, oldSubset, newRow, 'UPDATE', userEmail(principal));

      await tx.commit();
      return { jsonBody: { ok: true } };
    } catch (e) {
      await tx.rollback();
      context.error('updateContractor failed', e);
      return { status: 500, jsonBody: { error: e.message } };
    }
  }
});

// -----------------------------------------------------
// DELETE /api/contractors/{hrmid}  (Admin only)
// -----------------------------------------------------
app.http('deleteContractor', {
  methods: ['DELETE'],
  route: 'contractors/{hrmid}',
  authLevel: 'anonymous',
  handler: async (request, context) => {
    const principal = getPrincipal(request);
    if (!hasRole(principal, 'Admin'))
      return { status: 401, body: 'Unauthorized' };

    const hrmid = request.params.hrmid;
    const pool = await getPool();
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
      await new sql.Request(tx)
        .input('HRMID', sql.NVarChar(50), hrmid)
        .input('Action', sql.NVarChar(20), 'DELETE')
        .input('ChangedBy', sql.NVarChar(255), userEmail(principal))
        .query(`INSERT INTO dbo.AuditLog (HRMID,[Action],ChangedBy)
                VALUES (@HRMID,@Action,@ChangedBy)`);
      const del = await new sql.Request(tx)
        .input('HRMID', sql.NVarChar(50), hrmid)
        .query(`DELETE FROM dbo.Contractors WHERE HRMID=@HRMID`);
      await tx.commit();
      if (del.rowsAffected[0] === 0) return { status: 404 };
      return { status: 204 };
    } catch (e) {
      await tx.rollback();
      context.error('deleteContractor failed', e);
      return { status: 500, jsonBody: { error: e.message } };
    }
  }
});
