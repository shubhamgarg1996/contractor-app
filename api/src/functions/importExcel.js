const { app } = require('@azure/functions');
const { sql, getPool } = require('../shared/db');
const { getPrincipal, hasRole, userEmail } = require('../shared/auth');
const { ALL_COLUMNS } = require('../shared/columns');
const ExcelJS = require('exceljs');

// =====================================================
// Excel header → DB column mapping
// =====================================================
// Scalar columns map to a DB column name.
// Invoice columns map to an object { monthKey, kind: 'inv'|'inr' }
// so we can route them into the long invoice table.
const HEADER_MAP = {
  'HRMID': 'HRMID', 'Name': 'Name',
  'Vendor': 'VendorName', 'Status': 'Status', 'Entity': 'EntityName',
  'Finance SPOC': 'FinanceSPOC',
  'Date of Joining (as Cont)': 'DateOfJoining', 'Exit Date as Contractual': 'ExitDate',
  'Currency': 'Currency', 'Payment': 'Payment',
  'Hourly/monthly/per day': 'PaymentFrequency', 'Payment Terms': 'PaymentTerms',
  'Recruiter': 'Recruiter',
  'Last renewal/contract effective from': 'LastRenewalEffectiveFrom',
  'Contract End Date': 'ContractEndDate',
  'Monthly Approximate Amt. (INR)': 'MonthlyApproxINR',
  'Annual Approximate Amt. (INR)': 'AnnualApproxINR',
  'Remarks': 'Remarks'
};

// 12 short month names → month numbers
const MONTH_NUM = {
  Jan:1,Feb:2,Mar:3,Apr:4,May:5,Jun:6,Jul:7,Aug:8,Sep:9,Oct:10,Nov:11,Dec:12,
  March:3, April:4
};

// Decide if a header is a monthly invoice column and produce { monthKey, kind }.
// Handles:
//   "Jan'25 Invoice Amount"       -> 2025-01 inv
//   'Jan (INR)'                   -> 2025-01 inr  (no year → assume "current" 2025)
//   "Jan'26 (INR)"                -> 2026-01 inr
//   'March Invoice Amt.'          -> 2025-03 inv
function classifyMonthHeader(raw, defaultYear) {
  if (!raw) return null;
  const s = String(raw).trim();

  // Month with quoted year: Jan'25, Feb'26 etc
  let m = s.match(/^([A-Za-z]+)'(\d{2})\s*(.*)$/);
  if (m) {
    const month = MONTH_NUM[m[1]] || MONTH_NUM[capitalize(m[1])];
    const yy = parseInt(m[2], 10);
    if (!month) return null;
    const fullYear = 2000 + yy;
    const rest = m[3].toLowerCase();
    const kind = rest.includes('inr') ? 'inr'
              : rest.includes('invoice') || rest.includes('amt') ? 'inv'
              : null;
    if (!kind) return null;
    return { monthKey: makeKey(fullYear, month), kind };
  }

  // Month with NO year: "Jan (INR)", "Mar (INR)", "May Invoice Amt.", "March Invoice Amt."
  m = s.match(/^([A-Za-z]+)\s*(.*)$/);
  if (m) {
    const namePart = m[1];
    const month = MONTH_NUM[namePart] || MONTH_NUM[capitalize(namePart)];
    if (!month) return null;
    const rest = m[2].toLowerCase();
    const kind = rest.includes('inr') ? 'inr'
              : rest.includes('invoice') || rest.includes('amt') ? 'inv'
              : null;
    if (!kind) return null;
    return { monthKey: makeKey(defaultYear, month), kind };
  }

  return null;
}

function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase(); }
function makeKey(y, m) { return `${y}-${String(m).padStart(2,'0')}`; }
function norm(s)       { return String(s ?? '').replace(/\s+/g, ' ').trim(); }

// =====================================================
// Cell helpers
// =====================================================
function unwrapCell(v) {
  if (v == null) return null;
  if (v && typeof v === 'object') {
    if ('text'   in v && v.text   != null) return v.text;
    if ('result' in v && v.result != null) return v.result;
    if (v instanceof Date) return v;
  }
  return v === '' ? null : v;
}

const NUMERIC_SCALAR_COLUMNS = new Set([
  'Payment', 'MonthlyApproxINR', 'AnnualApproxINR'
]);
const DATE_COLUMNS = new Set([
  'DateOfJoining', 'ExitDate', 'LastRenewalEffectiveFrom', 'ContractEndDate'
]);

function tryNumber(v) {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  const cleaned = v.replace(/[^0-9.\-]/g, '');
  if (cleaned === '' || cleaned === '.' || cleaned === '-') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}
function tryDate(v) {
  if (v == null) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (typeof v !== 'string') return null;
  const d = new Date(v.trim());
  return Number.isNaN(d.getTime()) ? null : d;
}
function coerceScalar(dbCol, v) {
  if (NUMERIC_SCALAR_COLUMNS.has(dbCol)) return tryNumber(v);
  if (DATE_COLUMNS.has(dbCol))           return tryDate(v);
  if (v === '') return null;
  return v;
}

// =====================================================
// Endpoint
// =====================================================
app.http('importContractors', {
  methods: ['POST'],
  route: 'import',
  authLevel: 'anonymous',
  handler: async (request, context) => {
    const principal = getPrincipal(request);
    if (!hasRole(principal, 'Admin'))
      return { status: 401, body: 'Unauthorized' };

    const buf = Buffer.from(await request.arrayBuffer());
    const wb = new ExcelJS.Workbook();
    try { await wb.xlsx.load(buf); }
    catch (e) { return { status: 400, jsonBody: { error: 'Could not read xlsx: ' + e.message } }; }

    // Pick "Contractors" sheet, else any sheet with HRMID, else first.
    const sheetHasHRMID = (s) => {
      let found = false;
      s.getRow(1).eachCell((cell) => {
        if (norm(cell.value) === 'HRMID') found = true;
      });
      return found;
    };
    const ws = wb.getWorksheet('Contractors')
            || wb.worksheets.find(sheetHasHRMID)
            || wb.worksheets[0];
    if (!ws) return { status: 400, jsonBody: { error: 'No worksheet in file' } };

    // Walk headers: each column is either a scalar DB col, a monthly invoice,
    // or unmapped. Year-less month headers default to 2025 (legacy template).
    const scalarColIndex = {};                          // dbCol → excel col idx
    const monthCols = [];                               // { idx, monthKey, kind }
    ws.getRow(1).eachCell((cell, idx) => {
      const raw = norm(cell.value);
      if (HEADER_MAP[raw]) {
        scalarColIndex[HEADER_MAP[raw]] = idx;
        return;
      }
      const m = classifyMonthHeader(raw, 2025);
      if (m) monthCols.push({ idx, ...m });
    });

    if (!scalarColIndex.HRMID)
      return { status: 400, jsonBody: { error: 'HRMID column not found in row 1' } };

    // Cache vendor/entity name → id
    const pool = await getPool();
    const vmap = new Map(), emap = new Map();
    (await pool.request().query('SELECT VendorID, VendorName FROM dbo.Vendors')).recordset
      .forEach(r => vmap.set(r.VendorName.toLowerCase(), r.VendorID));
    (await pool.request().query('SELECT EntityID, EntityName FROM dbo.Entities')).recordset
      .forEach(r => emap.set(r.EntityName.toLowerCase(), r.EntityID));

    // Parse rows
    const rows = [];
    const errors = [];
    for (let r = 2; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const getScalar = db => scalarColIndex[db]
        ? unwrapCell(row.getCell(scalarColIndex[db]).value)
        : null;

      const hrmid = norm(getScalar('HRMID'));
      if (!hrmid) continue;
      const name = norm(getScalar('Name'));
      if (!name) { errors.push({ row: r, error: 'Missing Name' }); continue; }

      const scalar = { HRMID: hrmid, Name: name };
      for (const dbCol of new Set(Object.values(HEADER_MAP))) {
        if (dbCol === 'HRMID' || dbCol === 'Name') continue;
        const v = getScalar(dbCol);
        if (dbCol === 'VendorName')
          scalar.VendorID = v ? (vmap.get(norm(v).toLowerCase()) ?? null) : null;
        else if (dbCol === 'EntityName')
          scalar.EntityID = v ? (emap.get(norm(v).toLowerCase()) ?? null) : null;
        else
          scalar[dbCol] = coerceScalar(dbCol, v);
      }

      // Collect monthly invoices, grouping by monthKey
      const monthly = new Map();  // monthKey → { inv, inr }
      for (const mc of monthCols) {
        const v = tryNumber(unwrapCell(row.getCell(mc.idx).value));
        if (v == null) continue;
        let bucket = monthly.get(mc.monthKey);
        if (!bucket) { bucket = { inv: null, inr: null }; monthly.set(mc.monthKey, bucket); }
        bucket[mc.kind] = v;
      }

      rows.push({ scalar, monthly });
    }

    if (errors.length) return { status: 400, jsonBody: { errors } };

    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
      let inserted = 0, updated = 0, invoiceUpserts = 0;
      const updatedBy = userEmail(principal);

      for (const { scalar, monthly } of rows) {
        const cols = ALL_COLUMNS.filter(c => scalar[c] !== undefined);
        const insertCols = ['HRMID', ...cols];
        const insertVals = insertCols.map(c => '@' + c).join(',');
        const setClause  = cols.map(c => `[${c}]=@${c}`).join(',');

        const req = new sql.Request(tx);
        req.input('HRMID', sql.NVarChar(50), scalar.HRMID);
        cols.forEach(c => req.input(c, scalar[c]));
        req.input('UpdatedBy', sql.NVarChar(255), updatedBy);

        const merge = await req.query(`
          MERGE dbo.Contractors AS T
          USING (SELECT @HRMID AS HRMID) AS S ON T.HRMID = S.HRMID
          WHEN MATCHED THEN UPDATE SET
            ${setClause ? setClause + ',' : ''} UpdatedBy=@UpdatedBy, UpdatedAt=SYSUTCDATETIME()
          WHEN NOT MATCHED THEN INSERT (${insertCols.join(',')}, CreatedBy, UpdatedBy)
            VALUES (${insertVals}, @UpdatedBy, @UpdatedBy)
          OUTPUT $action AS A;`);

        const action = merge.recordset[0] && merge.recordset[0].A;
        if (action === 'INSERT') inserted++;
        else if (action === 'UPDATE') updated++;

        // Upsert invoices for this contractor
        for (const [monthKey, { inv, inr }] of monthly) {
          await new sql.Request(tx)
            .input('HRMID',    sql.NVarChar(50),  scalar.HRMID)
            .input('MonthKey', sql.Char(7),       monthKey)
            .input('InvAmt',   sql.Decimal(18,2), inv)
            .input('INRAmt',   sql.Decimal(18,2), inr)
            .input('By',       sql.NVarChar(255), updatedBy)
            .query(`
              MERGE dbo.ContractorMonthlyInvoice AS T
              USING (SELECT @HRMID AS HRMID, @MonthKey AS MonthKey) AS S
                ON T.HRMID = S.HRMID AND T.MonthKey = S.MonthKey
              WHEN MATCHED THEN UPDATE SET
                InvoiceAmount = @InvAmt, INRAmount = @INRAmt,
                UpdatedAt = SYSUTCDATETIME(), UpdatedBy = @By
              WHEN NOT MATCHED THEN INSERT
                (HRMID, MonthKey, InvoiceAmount, INRAmount, UpdatedAt, UpdatedBy)
                VALUES (@HRMID, @MonthKey, @InvAmt, @INRAmt, SYSUTCDATETIME(), @By);`);
          invoiceUpserts++;
        }

        // Audit line for the bulk import action
        await new sql.Request(tx)
          .input('HRMID', sql.NVarChar(50), scalar.HRMID)
          .input('Action', sql.NVarChar(20), action)
          .input('ChangedColumn', sql.NVarChar(100), 'BULK_IMPORT')
          .input('NewValue', sql.NVarChar(sql.MAX), `Months upserted: ${monthly.size}`)
          .input('ChangedBy', sql.NVarChar(255), updatedBy)
          .query(`INSERT INTO dbo.AuditLog (HRMID,[Action],ChangedColumn,NewValue,ChangedBy)
                  VALUES (@HRMID,@Action,@ChangedColumn,@NewValue,@ChangedBy)`);
      }

      await tx.commit();
      return { jsonBody: { totalRows: rows.length, inserted, updated, invoiceUpserts } };
    } catch (e) {
      await tx.rollback();
      context.error('import failed', e);
      return { status: 500, jsonBody: { error: e.message } };
    }
  }
});
