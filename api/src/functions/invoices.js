const { app } = require('@azure/functions');
const { sql, getPool } = require('../shared/db');
const { getPrincipal, hasRole, userEmail } = require('../shared/auth');
const { isValidMonthKey } = require('../shared/months');

// -----------------------------------------------------
// GET /api/contractors/{hrmid}/invoices
//   Returns: [{ MonthKey, InvoiceAmount, INRAmount }]
// -----------------------------------------------------
app.http('listInvoices', {
  methods: ['GET'],
  route: 'contractors/{hrmid}/invoices',
  authLevel: 'anonymous',
  handler: async (request) => {
    if (!hasRole(getPrincipal(request), 'Admin','FinanceSPOC','Recruiter','Viewer'))
      return { status: 401, jsonBody: { error: 'Unauthorized' } };

    const pool = await getPool();
    const r = await pool.request()
      .input('HRMID', sql.NVarChar(50), request.params.hrmid)
      .query(`
        SELECT MonthKey, InvoiceAmount, INRAmount, UpdatedAt, UpdatedBy
        FROM dbo.ContractorMonthlyInvoice
        WHERE HRMID = @HRMID
        ORDER BY MonthKey`);
    return { jsonBody: r.recordset };
  }
});

// -----------------------------------------------------
// PUT /api/contractors/{hrmid}/invoices
//   Body: { invoices: [{ monthKey, invoiceAmount, inrAmount }, ...] }
//   Upserts every supplied month. Months not in the payload are left untouched.
//   To delete a month, send invoiceAmount = null AND inrAmount = null — the row is removed.
//   Admin/FinanceSPOC only (the recruiter role doesn't have monthly invoices in scope).
// -----------------------------------------------------
app.http('upsertInvoices', {
  methods: ['PUT'],
  route: 'contractors/{hrmid}/invoices',
  authLevel: 'anonymous',
  handler: async (request, context) => {
    const principal = getPrincipal(request);
    if (!hasRole(principal, 'Admin','FinanceSPOC'))
      return { status: 401, jsonBody: { error: 'Unauthorized' } };

    const hrmid = request.params.hrmid;
    let body;
    try { body = await request.json(); }
    catch { return { status: 400, jsonBody: { error: 'Invalid JSON body' } }; }

    const invoices = Array.isArray(body.invoices) ? body.invoices : [];
    if (invoices.length === 0)
      return { status: 400, jsonBody: { error: 'No invoices in payload' } };

    // Validate month keys up front
    for (const x of invoices) {
      if (!isValidMonthKey(x.monthKey))
        return { status: 400, jsonBody: { error: `Invalid month key: ${x.monthKey}. Must be YYYY-MM.` } };
    }

    const pool = await getPool();

    // Confirm contractor exists
    const exists = await pool.request()
      .input('HRMID', sql.NVarChar(50), hrmid)
      .query(`SELECT 1 FROM dbo.Contractors WHERE HRMID = @HRMID`);
    if (!exists.recordset.length)
      return { status: 404, jsonBody: { error: 'Contractor not found' } };

    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
      let upserted = 0, deleted = 0;
      const updatedBy = userEmail(principal);

      for (const inv of invoices) {
        const monthKey = inv.monthKey;
        const invAmt   = toNum(inv.invoiceAmount);
        const inrAmt   = toNum(inv.inrAmount);

        // Both null → delete the row
        if (invAmt == null && inrAmt == null) {
          const del = await new sql.Request(tx)
            .input('HRMID',    sql.NVarChar(50), hrmid)
            .input('MonthKey', sql.Char(7),       monthKey)
            .query(`DELETE FROM dbo.ContractorMonthlyInvoice
                    WHERE HRMID = @HRMID AND MonthKey = @MonthKey`);
          deleted += del.rowsAffected[0];
          continue;
        }

        // MERGE upsert
        await new sql.Request(tx)
          .input('HRMID',    sql.NVarChar(50),  hrmid)
          .input('MonthKey', sql.Char(7),        monthKey)
          .input('InvAmt',   sql.Decimal(18,2), invAmt)
          .input('INRAmt',   sql.Decimal(18,2), inrAmt)
          .input('By',       sql.NVarChar(255), updatedBy)
          .query(`
            MERGE dbo.ContractorMonthlyInvoice AS T
            USING (SELECT @HRMID AS HRMID, @MonthKey AS MonthKey) AS S
              ON T.HRMID = S.HRMID AND T.MonthKey = S.MonthKey
            WHEN MATCHED THEN UPDATE SET
              InvoiceAmount = @InvAmt,
              INRAmount     = @INRAmt,
              UpdatedAt     = SYSUTCDATETIME(),
              UpdatedBy     = @By
            WHEN NOT MATCHED THEN INSERT
              (HRMID, MonthKey, InvoiceAmount, INRAmount, UpdatedAt, UpdatedBy)
              VALUES (@HRMID, @MonthKey, @InvAmt, @INRAmt, SYSUTCDATETIME(), @By);`);
        upserted++;
      }

      // Stamp the parent contractor row so the audit timeline reflects the edit
      await new sql.Request(tx)
        .input('HRMID', sql.NVarChar(50), hrmid)
        .input('By',    sql.NVarChar(255), updatedBy)
        .query(`
          UPDATE dbo.Contractors
          SET UpdatedAt = SYSUTCDATETIME(), UpdatedBy = @By
          WHERE HRMID = @HRMID`);

      // Single audit line for the bulk action
      await new sql.Request(tx)
        .input('HRMID',         sql.NVarChar(50),  hrmid)
        .input('Action',        sql.NVarChar(20),  'UPDATE')
        .input('ChangedColumn', sql.NVarChar(100), 'MonthlyInvoices')
        .input('NewValue',      sql.NVarChar(sql.MAX),
                                `Upserted ${upserted}, deleted ${deleted}`)
        .input('By',            sql.NVarChar(255), updatedBy)
        .query(`INSERT INTO dbo.AuditLog (HRMID,[Action],ChangedColumn,NewValue,ChangedBy)
                VALUES (@HRMID,@Action,@ChangedColumn,@NewValue,@By)`);

      await tx.commit();
      return { jsonBody: { upserted, deleted } };
    } catch (e) {
      await tx.rollback();
      context.error('upsertInvoices failed', e);
      return { status: 500, jsonBody: { error: e.message } };
    }
  }
});

function toNum(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const cleaned = String(v).replace(/[^0-9.\-]/g,'');
  if (!cleaned || cleaned === '.' || cleaned === '-') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}
