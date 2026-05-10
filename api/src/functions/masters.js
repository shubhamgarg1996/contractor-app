const { app } = require('@azure/functions');
const { sql, getPool } = require('../shared/db');
const { getPrincipal, hasRole } = require('../shared/auth');

// =====================================================
// VENDORS
// =====================================================

// GET /api/vendors
//   default              → active only, {VendorID, VendorName} (used by dropdowns)
//   ?includeInactive=true → all + IsActive + UsageCount (used by Masters page)
app.http('listVendors', {
  methods: ['GET'],
  route: 'vendors',
  authLevel: 'anonymous',
  handler: async (request) => {
    if (!hasRole(getPrincipal(request), 'Admin','FinanceSPOC','Recruiter','Viewer'))
      return { status: 401, jsonBody: { error: 'Unauthorized' } };

    const includeInactive = new URL(request.url).searchParams.get('includeInactive') === 'true';
    const pool = await getPool();
    const r = includeInactive
      ? await pool.request().query(`
          SELECT v.VendorID, v.VendorName, v.IsActive,
                 UsageCount = (SELECT COUNT(*) FROM dbo.Contractors c WHERE c.VendorID = v.VendorID)
          FROM dbo.Vendors v
          ORDER BY v.VendorName`)
      : await pool.request().query(`
          SELECT VendorID, VendorName
          FROM dbo.Vendors
          WHERE IsActive = 1
          ORDER BY VendorName`);
    return { jsonBody: r.recordset };
  }
});

// POST /api/vendors
app.http('createVendor', {
  methods: ['POST'],
  route: 'vendors',
  authLevel: 'anonymous',
  handler: async (request, context) => {
    if (!hasRole(getPrincipal(request), 'Admin','FinanceSPOC','Recruiter'))
      return { status: 401, jsonBody: { error: 'Unauthorized' } };

    let body;
    try { body = await request.json(); }
    catch { return { status: 400, jsonBody: { error: 'Invalid JSON body' } }; }

    const name = String(body.vendorName || body.name || '').trim();
    if (!name) return { status: 400, jsonBody: { error: 'Vendor name is required' } };
    if (name.length > 200) return { status: 400, jsonBody: { error: 'Name too long (max 200 characters)' } };

    try {
      const pool = await getPool();
      const r = await pool.request()
        .input('Name', sql.NVarChar(200), name)
        .query(`
          INSERT INTO dbo.Vendors (VendorName, IsActive)
          OUTPUT INSERTED.VendorID, INSERTED.VendorName, INSERTED.IsActive
          VALUES (@Name, 1)`);
      return { status: 201, jsonBody: r.recordset[0] };
    } catch (e) {
      if (e.number === 2627 || /UNIQUE/i.test(e.message))
        return { status: 409, jsonBody: { error: 'A vendor with that name already exists' } };
      context.error('createVendor failed', e);
      return { status: 500, jsonBody: { error: e.message } };
    }
  }
});

// PUT /api/vendors/{id}
//   Admin/FinanceSPOC/Recruiter can rename
//   Only Admin can deactivate/reactivate
app.http('updateVendor', {
  methods: ['PUT'],
  route: 'vendors/{id}',
  authLevel: 'anonymous',
  handler: async (request, context) => {
    const principal = getPrincipal(request);
    if (!hasRole(principal, 'Admin','FinanceSPOC','Recruiter'))
      return { status: 401, jsonBody: { error: 'Unauthorized' } };

    const id = parseInt(request.params.id, 10);
    if (Number.isNaN(id)) return { status: 400, jsonBody: { error: 'Invalid id' } };

    let body;
    try { body = await request.json(); }
    catch { return { status: 400, jsonBody: { error: 'Invalid JSON body' } }; }

    if (body.isActive !== undefined && !hasRole(principal, 'Admin'))
      return { status: 403, jsonBody: { error: 'Only Admin can deactivate or reactivate vendors' } };

    const sets = [];
    const pool = await getPool();
    const req = pool.request().input('ID', sql.Int, id);

    if (body.vendorName !== undefined) {
      const name = String(body.vendorName).trim();
      if (!name) return { status: 400, jsonBody: { error: 'Name cannot be empty' } };
      if (name.length > 200) return { status: 400, jsonBody: { error: 'Name too long (max 200 characters)' } };
      sets.push('VendorName = @Name');
      req.input('Name', sql.NVarChar(200), name);
    }
    if (body.isActive !== undefined) {
      sets.push('IsActive = @Active');
      req.input('Active', sql.Bit, body.isActive ? 1 : 0);
    }
    if (!sets.length) return { status: 400, jsonBody: { error: 'No fields to update' } };

    try {
      const r = await req.query(`UPDATE dbo.Vendors SET ${sets.join(', ')} WHERE VendorID = @ID`);
      if (r.rowsAffected[0] === 0) return { status: 404, jsonBody: { error: 'Vendor not found' } };
      return { jsonBody: { ok: true } };
    } catch (e) {
      if (e.number === 2627 || /UNIQUE/i.test(e.message))
        return { status: 409, jsonBody: { error: 'Another vendor with that name already exists' } };
      context.error('updateVendor failed', e);
      return { status: 500, jsonBody: { error: e.message } };
    }
  }
});

// =====================================================
// ENTITIES (same shape as vendors)
// =====================================================

app.http('listEntities', {
  methods: ['GET'],
  route: 'entities',
  authLevel: 'anonymous',
  handler: async (request) => {
    if (!hasRole(getPrincipal(request), 'Admin','FinanceSPOC','Recruiter','Viewer'))
      return { status: 401, jsonBody: { error: 'Unauthorized' } };

    const includeInactive = new URL(request.url).searchParams.get('includeInactive') === 'true';
    const pool = await getPool();
    const r = includeInactive
      ? await pool.request().query(`
          SELECT e.EntityID, e.EntityName, e.IsActive,
                 UsageCount = (SELECT COUNT(*) FROM dbo.Contractors c WHERE c.EntityID = e.EntityID)
          FROM dbo.Entities e
          ORDER BY e.EntityName`)
      : await pool.request().query(`
          SELECT EntityID, EntityName
          FROM dbo.Entities
          WHERE IsActive = 1
          ORDER BY EntityName`);
    return { jsonBody: r.recordset };
  }
});

app.http('createEntity', {
  methods: ['POST'],
  route: 'entities',
  authLevel: 'anonymous',
  handler: async (request, context) => {
    if (!hasRole(getPrincipal(request), 'Admin','FinanceSPOC','Recruiter'))
      return { status: 401, jsonBody: { error: 'Unauthorized' } };

    let body;
    try { body = await request.json(); }
    catch { return { status: 400, jsonBody: { error: 'Invalid JSON body' } }; }

    const name = String(body.entityName || body.name || '').trim();
    if (!name) return { status: 400, jsonBody: { error: 'Entity name is required' } };
    if (name.length > 200) return { status: 400, jsonBody: { error: 'Name too long (max 200 characters)' } };

    try {
      const pool = await getPool();
      const r = await pool.request()
        .input('Name', sql.NVarChar(200), name)
        .query(`
          INSERT INTO dbo.Entities (EntityName, IsActive)
          OUTPUT INSERTED.EntityID, INSERTED.EntityName, INSERTED.IsActive
          VALUES (@Name, 1)`);
      return { status: 201, jsonBody: r.recordset[0] };
    } catch (e) {
      if (e.number === 2627 || /UNIQUE/i.test(e.message))
        return { status: 409, jsonBody: { error: 'An entity with that name already exists' } };
      context.error('createEntity failed', e);
      return { status: 500, jsonBody: { error: e.message } };
    }
  }
});

app.http('updateEntity', {
  methods: ['PUT'],
  route: 'entities/{id}',
  authLevel: 'anonymous',
  handler: async (request, context) => {
    const principal = getPrincipal(request);
    if (!hasRole(principal, 'Admin','FinanceSPOC','Recruiter'))
      return { status: 401, jsonBody: { error: 'Unauthorized' } };

    const id = parseInt(request.params.id, 10);
    if (Number.isNaN(id)) return { status: 400, jsonBody: { error: 'Invalid id' } };

    let body;
    try { body = await request.json(); }
    catch { return { status: 400, jsonBody: { error: 'Invalid JSON body' } }; }

    if (body.isActive !== undefined && !hasRole(principal, 'Admin'))
      return { status: 403, jsonBody: { error: 'Only Admin can deactivate or reactivate entities' } };

    const sets = [];
    const pool = await getPool();
    const req = pool.request().input('ID', sql.Int, id);

    if (body.entityName !== undefined) {
      const name = String(body.entityName).trim();
      if (!name) return { status: 400, jsonBody: { error: 'Name cannot be empty' } };
      if (name.length > 200) return { status: 400, jsonBody: { error: 'Name too long (max 200 characters)' } };
      sets.push('EntityName = @Name');
      req.input('Name', sql.NVarChar(200), name);
    }
    if (body.isActive !== undefined) {
      sets.push('IsActive = @Active');
      req.input('Active', sql.Bit, body.isActive ? 1 : 0);
    }
    if (!sets.length) return { status: 400, jsonBody: { error: 'No fields to update' } };

    try {
      const r = await req.query(`UPDATE dbo.Entities SET ${sets.join(', ')} WHERE EntityID = @ID`);
      if (r.rowsAffected[0] === 0) return { status: 404, jsonBody: { error: 'Entity not found' } };
      return { jsonBody: { ok: true } };
    } catch (e) {
      if (e.number === 2627 || /UNIQUE/i.test(e.message))
        return { status: 409, jsonBody: { error: 'Another entity with that name already exists' } };
      context.error('updateEntity failed', e);
      return { status: 500, jsonBody: { error: e.message } };
    }
  }
});
