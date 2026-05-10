const { app } = require('@azure/functions');
const { getPool } = require('../shared/db');
const { getPrincipal, hasRole } = require('../shared/auth');

app.http('listVendors', {
  methods: ['GET'],
  route: 'vendors',
  authLevel: 'anonymous',
  handler: async (request) => {
    if (!hasRole(getPrincipal(request), 'Admin','FinanceSPOC','Recruiter','Viewer'))
      return { status: 401, body: 'Unauthorized' };
    const pool = await getPool();
    const r = await pool.request().query(
      `SELECT VendorID, VendorName FROM dbo.Vendors WHERE IsActive=1 ORDER BY VendorName`);
    return { jsonBody: r.recordset };
  }
});

app.http('listEntities', {
  methods: ['GET'],
  route: 'entities',
  authLevel: 'anonymous',
  handler: async (request) => {
    if (!hasRole(getPrincipal(request), 'Admin','FinanceSPOC','Recruiter','Viewer'))
      return { status: 401, body: 'Unauthorized' };
    const pool = await getPool();
    const r = await pool.request().query(
      `SELECT EntityID, EntityName FROM dbo.Entities WHERE IsActive=1 ORDER BY EntityName`);
    return { jsonBody: r.recordset };
  }
});
