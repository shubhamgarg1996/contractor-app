const { app } = require('@azure/functions');
const { getPool } = require('../shared/db');
const { getPrincipal, hasRole } = require('../shared/auth');
const { monthKeyToExcelInvoiceHeader, monthKeyToExcelINRHeader,
        monthRange, addMonths, monthKeyToLong } = require('../shared/months');
const ExcelJS = require('exceljs');

const SCALAR_HEADERS = [
  'HRMID', 'Name', 'Vendor', 'Status', 'Entity', 'Finance SPOC',
  'Date of Joining (as Cont)', 'Exit Date as Contractual',
  'Currency', 'Payment', 'Hourly/monthly/per day', 'Payment Terms',
  'Recruiter', 'Last renewal/contract effective from', 'Contract End Date',
  'Monthly Approximate Amt. (INR)', 'Annual Approximate Amt. (INR)', 'Remarks'
];

function currentMonthKey() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`;
}

app.http('importTemplate', {
  methods: ['GET'],
  route: 'import/template',
  authLevel: 'anonymous',
  handler: async (request) => {
    if (!hasRole(getPrincipal(request), 'Admin'))
      return { status: 401, jsonBody: { error: 'Unauthorized' } };

    const pool = await getPool();

    // Look up the range of months we currently have data for
    const r = await pool.request().query(`
      SELECT
        MinKey = MIN(MonthKey),
        MaxKey = MAX(MonthKey)
      FROM dbo.ContractorMonthlyInvoice`);

    let startKey = r.recordset[0].MinKey;
    let endKey   = r.recordset[0].MaxKey;

    // Fallbacks for an empty DB: start at Jan of current year, end 12 months out
    if (!startKey || !endKey) {
      const now = currentMonthKey();
      startKey = `${now.slice(0,4)}-01`;
      endKey   = addMonths(now, 12);
    } else {
      // Always include 12 months forward of either today or the latest data
      const target = addMonths(currentMonthKey(), 12);
      if (target > endKey) endKey = target;
    }

    const months = monthRange(startKey, endKey);

    // ---- Build the workbook ----
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Contractor Tracker';

    // Instructions
    const wsI = wb.addWorksheet('Instructions');
    wsI.getColumn(1).width = 38;
    wsI.getColumn(2).width = 70;
    wsI.getCell('A1').value = 'Contractor Tracker — Bulk import template';
    wsI.getCell('A1').font  = { name: 'Arial', size: 16, bold: true };
    wsI.mergeCells('A1:B1');

    wsI.getCell('A3').value = 'How to use';
    wsI.getCell('A3').font  = { name: 'Arial', size: 12, bold: true };
    const steps = [
      ['1.', 'Go to the "Contractors" sheet.'],
      ['2.', 'Add your data — one row per contractor. HRMID and Name are mandatory.'],
      ['3.', 'Save as .xlsx.'],
      ['4.', 'In the app: Sidebar → Import → choose this file → Import.'],
      ['5.', 'Existing HRMIDs are UPDATED. New HRMIDs are INSERTED. Monthly invoices upserted by (HRMID, Month).']
    ];
    steps.forEach(([n, t], i) => {
      const r = 4 + i;
      wsI.getCell(`A${r}`).value = n;
      wsI.getCell(`B${r}`).value = t;
      wsI.getCell(`B${r}`).alignment = { wrapText: true };
    });

    const notesStart = 4 + steps.length + 2;
    wsI.getCell(`A${notesStart - 1}`).value = 'Notes';
    wsI.getCell(`A${notesStart - 1}`).font  = { name: 'Arial', size: 12, bold: true };
    const notes = [
      ['Month columns',
       `This template includes invoice columns from ${monthKeyToLong(months[0])} through ${monthKeyToLong(months[months.length-1])}. To add a future month, just add columns with header pattern "MMM'YY Invoice Amount" and "MMM'YY (INR)".`],
      ['Vendor / Entity', 'Must match a name in Masters (case-insensitive). Add new ones in Masters first.'],
      ['Numbers', 'Currency prefixes are tolerated — "USD 1,000" is parsed as 1000.'],
      ['Dates', 'Use real Excel dates, not text.']
    ];
    notes.forEach(([col, note], i) => {
      const r = notesStart + i;
      wsI.getCell(`A${r}`).value = col;
      wsI.getCell(`A${r}`).font  = { name: 'Arial', size: 11, bold: true };
      wsI.getCell(`B${r}`).value = note;
      wsI.getCell(`B${r}`).alignment = { wrapText: true };
      wsI.getRow(r).height = 40;
    });

    // Contractors
    const ws = wb.addWorksheet('Contractors');
    const headers = [
      ...SCALAR_HEADERS,
      ...months.flatMap(k => [monthKeyToExcelInvoiceHeader(k), monthKeyToExcelINRHeader(k)])
    ];
    ws.addRow(headers);
    const headerRow = ws.getRow(1);
    headerRow.font      = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };
    headerRow.alignment = { wrapText: true };
    headerRow.height    = 38;
    ws.views = [{ state: 'frozen', xSplit: 2, ySplit: 1 }];

    SCALAR_HEADERS.forEach((h, i) => {
      const widths = {
        'HRMID': 18, 'Name': 22, 'Vendor': 22, 'Status': 12, 'Entity': 22,
        'Finance SPOC': 18, 'Recruiter': 18, 'Currency': 10, 'Payment': 12,
        'Hourly/monthly/per day': 16, 'Payment Terms': 14,
        'Monthly Approximate Amt. (INR)': 18, 'Annual Approximate Amt. (INR)': 18,
        'Remarks': 30
      };
      ws.getColumn(i + 1).width = widths[h] || 16;
    });
    for (let i = SCALAR_HEADERS.length + 1; i <= headers.length; i++) {
      ws.getColumn(i).width = 14;
    }

    // Dropdowns
    const colByHeader = Object.fromEntries(SCALAR_HEADERS.map((h, i) => [h, i + 1]));
    const addDropdown = (header, options) => {
      const col = colByHeader[header];
      const letter = ws.getColumn(col).letter;
      for (let r = 2; r <= 1000; r++) {
        ws.getCell(`${letter}${r}`).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [`"${options.join(',')}"`],
          showErrorMessage: true,
          errorStyle: 'warning'
        };
      }
    };
    addDropdown('Status',                 ['Active', 'Exited', 'On Hold', 'Renewed']);
    addDropdown('Currency',               ['INR', 'USD', 'EUR', 'GBP', 'AUD', 'CAD', 'AED']);
    addDropdown('Hourly/monthly/per day', ['Hourly', 'Monthly', 'PerDay', 'Daily', 'Per Invoice']);

    const buf = await wb.xlsx.writeBuffer();
    return {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="contractor-import-template.xlsx"`
      },
      body: Buffer.from(buf)
    };
  }
});
