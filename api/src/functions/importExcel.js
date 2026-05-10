const { app } = require('@azure/functions');
const { sql, getPool } = require('../shared/db');
const { getPrincipal, hasRole, userEmail } = require('../shared/auth');
const { ALL_COLUMNS } = require('../shared/columns');
const ExcelJS = require('exceljs');

// Maps the Excel header (as seen in the master tracker) to a DB column.
// 'VendorName' / 'EntityName' are resolved to VendorID / EntityID below.
const HEADER_MAP = {
  'HRMID': 'HRMID',
  'Name': 'Name',
  'Vendor': 'VendorName',
  'Status': 'Status',
  'Entity': 'EntityName',
  'Finance SPOC': 'FinanceSPOC',
  'Date of Joining (as Cont)': 'DateOfJoining',
  'Exit Date as Contractual': 'ExitDate',
  'Currency': 'Currency',
  'Payment': 'Payment',
  'Hourly/monthly/per day': 'PaymentFrequency',
  'Payment Terms': 'PaymentTerms',
  'Recruiter': 'Recruiter',
  'Last renewal/contract effective from': 'LastRenewalEffectiveFrom',
  'Contract End Date': 'ContractEndDate',
  'Monthly Approximate Amt. (INR)': 'MonthlyApproxINR',
  'Annual Approximate Amt. (INR)': 'AnnualApproxINR',
  'Remarks': 'Remarks',
  "Jan'25 Invoice Amount": 'Jan25_Inv', 'Jan (INR)': 'Jan25_INR',
  "Feb'25 Invoice Amount": 'Feb25_Inv', 'Feb (INR)': 'Feb25_INR',
  'March Invoice Amt.': 'Mar25_Inv',   'Mar (INR)': 'Mar25_INR',
  'April Invoice Amt.': 'Apr25_Inv',   'Apr (INR)': 'Apr25_INR',
  'May Invoice Amt.': 'May25_Inv',     'May (INR)': 'May25_INR',
  'Jun Invoice Amt.': 'Jun25_Inv',     'Jun (INR)': 'Jun25_INR',
  'Jul Invoice Amt.': 'Jul25_Inv',     'Jul (INR)': 'Jul25_INR',
  'Aug Invoice Amt.': 'Aug25_Inv',     'Aug (INR)': 'Aug25_INR',
  'Sep Invoice Amt.': 'Sep25_Inv',     'Sep (INR)': 'Sep25_INR',
  'Oct Invoice Amt.': 'Oct25_Inv',     'Oct (INR)': 'Oct25_INR',
  'Nov Invoice Amt.': 'Nov25_Inv',     'Nov (INR)': 'Nov25_INR',
  'Dec Invoice Amt.': 'Dec25_Inv',     'Dec (INR)': 'Dec25_INR',
  "Jan'26 Invoice Amt.": 'Jan26_Inv',  "Jan'26 (INR)": 'Jan26_INR',
  "Feb'26 Invoice Amt.": 'Feb26_Inv',  "Feb'26 (INR)": 'Feb26_INR',
  "Mar'26 Invoice Amt.": 'Mar26_Inv',  "Mar'26 (INR)": 'Mar26_INR'
};

const norm = s => String(s ?? '').replace(/\s+/g, ' ').trim();

function unwrapCell(v) {
  if (v == null) return null;
  if (v && typeof v === 'object') {
    if ('text'   in v && v.text   != null) return v.text;
    if ('result' in v && v.result != null) return v.result;
    if (v instanceof Date) return v;
  }
  return v === '' ? null : v;
}

// DB columns that must be numeric. Strings like "USD 13,200" are coerced
// to 13200 (strip everything except digits, dot, minus). Unparseable → null.
const NUMERIC_COLUMNS = new Set([
  'Payment', 'MonthlyApproxINR', 'AnnualApproxINR',
  'Jan25_Inv','Jan25_INR','Feb25_Inv','Feb25_INR','Mar25_Inv','Mar25_INR',
  'Apr25_Inv','Apr25_INR','May25_Inv','May25_INR','Jun25_Inv','Jun25_INR',
  'Jul25_Inv','Jul25_INR','Aug25_Inv','Aug25_INR','Sep25_Inv','Sep25_INR',
  'Oct25_Inv','Oct25_INR','Nov25_Inv','Nov25_INR','Dec25_Inv','Dec25_INR',
  'Jan26_Inv','Jan26_INR','Feb26_Inv','Feb26_INR','Mar26_Inv','Mar26_INR'
]);

const DATE_COLUMNS = new Set([
  'DateOfJoining', 'ExitDate', 'LastRenewalEffectiveFrom', 'ContractEndDate'
]);

function tryNumber(v) {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  const cleaned = v.replace(/[^0-9.\-]/g, '');
  if (cleaned === '' || cleaned === '.' || cleaned === '-' || cleaned === '-.') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function tryDate(v) {
  if (v == null) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (typeof v !== 'string') return null;
  const trimmed = v.trim();
  if (!trimmed) return null;
  const d = new Date(trimmed);
  return Number.isNaN(d.getTime()) ? null : d;
}

function coerce(dbCol, v) {
  if (NUMERIC_COLUMNS.has(dbCol)) return tryNumber(v);
  if (DATE_COLUMNS.has(dbCol))    return tryDate(v);
  if (v === '') return null;
  return v;
}

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

    // Pick the right sheet: prefer one named "Contractors", else any sheet
    // with HRMID in row 1, else fall back to the first sheet.
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

    // Map row 1 headers -> excel column index
    const colIndex = {};
    ws.getRow(1).eachCell((cell, idx) => {
      const db = HEADER_MAP[norm(cell.value)];
      if (db) colIndex[db] = idx;
    });
    if (!colIndex.HRMID) return { status: 400, jsonBody: { error: 'HRMID column not found in row 1' } };

    // Cache vendor & entity name -> id
    const pool = await getPool();
    const vmap = new Map(), emap = new Map();
    (await pool.request().query('SELECT VendorID, VendorName FROM dbo.Vendors')).recordset
      .forEach(r => vmap.set(r.VendorName.toLowerCase(), r.VendorID));
    (await pool.request().query('SELECT EntityID, EntityName FROM dbo.Entities')).recordset
      .forEach(r => emap.set(r.EntityName.toLowerCase(), r.EntityID));

    // Parse rows + validate
    const rows = [];
    const errors = [];
    for (let r = 2; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const get = db => colIndex[db] ? unwrapCell(row.getCell(colIndex[db]).value) : null;

      const hrmid = norm(get('HRMID'));
      if (!hrmid) continue;
      const name = norm(get('Name'));
      if (!name) { errors.push({ row: r, error: 'Missing Name' }); continue; }

      const obj = { HRMID: hrmid, Name: name };
      for (const dbCol of new Set(Object.values(HEADER_MAP))) {
        if (dbCol === 'HRMID' || dbCol === 'Name') continue;
        const v = get(dbCol);
        if (dbCol === 'VendorName') {
          obj.VendorID = v ? (vmap.get(norm(v).toLowerCase()) ?? null) : null;
        } else if (dbCol === 'EntityName') {
          obj.EntityID = v ? (emap.get(norm(v).toLowerCase()) ?? null) : null;
        } else {
          obj[dbCol] = coerce(dbCol, v);
        }
      }
      rows.push(obj);
    }

    if (errors.length) return { status: 400, jsonBody: { errors } };

    // Upsert in a transaction
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
      let inserted = 0, updated = 0;
      for (const r of rows) {
        const cols = ALL_COLUMNS.filter(c => r[c] !== undefined);
        const insertCols = ['HRMID', ...cols];
        const insertVals = insertCols.map(c => '@' + c).join(',');
        const setClause  = cols.map(c => `[${c}]=@${c}`).join(',');

        const req = new sql.Request(tx);
        req.input('HRMID', sql.NVarChar(50), r.HRMID);
        cols.forEach(c => req.input(c, r[c]));
        req.input('UpdatedBy', sql.NVarChar(255), userEmail(principal));

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

        await new sql.Request(tx)
          .input('HRMID', sql.NVarChar(50), r.HRMID)
          .input('Action', sql.NVarChar(20), action)
          .input('ChangedColumn', sql.NVarChar(100), 'BULK_IMPORT')
          .input('ChangedBy', sql.NVarChar(255), userEmail(principal))
          .query(`INSERT INTO dbo.AuditLog (HRMID,[Action],ChangedColumn,ChangedBy)
                  VALUES (@HRMID,@Action,@ChangedColumn,@ChangedBy)`);
      }
      await tx.commit();
      return { jsonBody: { totalRows: rows.length, inserted, updated } };
    } catch (e) {
      await tx.rollback();
      context.error('import failed', e);
      return { status: 500, jsonBody: { error: e.message } };
    }
  }
});
