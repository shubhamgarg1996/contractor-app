const { app } = require('@azure/functions');
const { getPrincipal, hasRole } = require('../shared/auth');
const ExcelJS = require('exceljs');

const HEADERS = [
  'HRMID', 'Name', 'Vendor', 'Status', 'Entity', 'Finance SPOC',
  'Date of Joining (as Cont)', 'Exit Date as Contractual',
  'Currency', 'Payment', 'Hourly/monthly/per day', 'Payment Terms',
  'Recruiter', 'Last renewal/contract effective from', 'Contract End Date',
  'Monthly Approximate Amt. (INR)', 'Annual Approximate Amt. (INR)', 'Remarks',
  "Jan'25 Invoice Amount", 'Jan (INR)',
  "Feb'25 Invoice Amount", 'Feb (INR)',
  'March Invoice Amt.', 'Mar (INR)',
  'April Invoice Amt.', 'Apr (INR)',
  'May Invoice Amt.',   'May (INR)',
  'Jun Invoice Amt.',   'Jun (INR)',
  'Jul Invoice Amt.',   'Jul (INR)',
  'Aug Invoice Amt.',   'Aug (INR)',
  'Sep Invoice Amt.',   'Sep (INR)',
  'Oct Invoice Amt.',   'Oct (INR)',
  'Nov Invoice Amt.',   'Nov (INR)',
  'Dec Invoice Amt.',   'Dec (INR)',
  "Jan'26 Invoice Amt.", "Jan'26 (INR)",
  "Feb'26 Invoice Amt.", "Feb'26 (INR)",
  "Mar'26 Invoice Amt.", "Mar'26 (INR)"
];

const EXAMPLE_ROW_1 = {
  'HRMID': 'CT-EXAMPLE-001', 'Name': 'Asha Verma',
  'Vendor': 'Randstad', 'Status': 'Active',
  'Entity': 'Celebal Technologies Pvt Ltd', 'Finance SPOC': 'Pooja Sharma',
  'Date of Joining (as Cont)': new Date('2025-01-15'),
  'Currency': 'INR', 'Payment': 90000,
  'Hourly/monthly/per day': 'Monthly', 'Payment Terms': 'Net 30',
  'Recruiter': 'Rohit Khanna',
  'Last renewal/contract effective from': new Date('2025-01-15'),
  'Contract End Date': new Date('2026-01-14'),
  'Monthly Approximate Amt. (INR)': 90000,
  'Annual Approximate Amt. (INR)': 1080000,
  'Remarks': 'Replace example rows before importing — see Instructions sheet',
  'Jan (INR)': 90000, 'Feb (INR)': 90000, 'Mar (INR)': 90000,
  'Apr (INR)': 90000, 'May (INR)': 90000, 'Jun (INR)': 90000
};

const EXAMPLE_ROW_2 = {
  'HRMID': 'CT-EXAMPLE-002', 'Name': 'David Chen',
  'Vendor': 'Direct hire', 'Status': 'Active',
  'Entity': 'Celebal Technologies Inc (US)', 'Finance SPOC': 'Pooja Sharma',
  'Date of Joining (as Cont)': new Date('2025-04-01'),
  'Currency': 'USD', 'Payment': 75,
  'Hourly/monthly/per day': 'Hourly', 'Payment Terms': 'Net 15',
  'Recruiter': 'Rohit Khanna',
  'Last renewal/contract effective from': new Date('2025-04-01'),
  'Contract End Date': new Date('2026-03-31'),
  'Monthly Approximate Amt. (INR)': 1080000,
  'Annual Approximate Amt. (INR)': 12960000,
  'Apr (INR)': 1080000, 'May (INR)': 1080000, 'Jun (INR)': 1080000
};

app.http('importTemplate', {
  methods: ['GET'],
  route: 'import/template',
  authLevel: 'anonymous',
  handler: async (request) => {
    if (!hasRole(getPrincipal(request), 'Admin'))
      return { status: 401, jsonBody: { error: 'Unauthorized' } };

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Contractor Tracker';
    wb.created = new Date();

    // ---- Instructions sheet ----
    const wsI = wb.addWorksheet('Instructions');
    wsI.getColumn(1).width = 38;
    wsI.getColumn(2).width = 70;

    wsI.getCell('A1').value = 'Contractor Tracker — Bulk import template';
    wsI.getCell('A1').font  = { name: 'Arial', size: 16, bold: true, color: { argb: 'FF1E293B' } };
    wsI.mergeCells('A1:B1');

    wsI.getCell('A3').value = 'How to use';
    wsI.getCell('A3').font  = { name: 'Arial', size: 12, bold: true };

    const steps = [
      ['1.', 'Go to the "Contractors" sheet in this workbook.'],
      ['2.', 'Delete the example rows (rows 2 and 3).'],
      ['3.', 'Add your data — one row per contractor. HRMID and Name are mandatory.'],
      ['4.', 'Save as .xlsx (do NOT change to .csv).'],
      ['5.', 'In the app: Sidebar → Import → choose this file → Import.'],
      ['6.', 'Existing rows (matched by HRMID) get UPDATED. New HRMIDs get INSERTED.']
    ];
    steps.forEach(([n, t], i) => {
      const r = 4 + i;
      wsI.getCell(`A${r}`).value = n;
      wsI.getCell(`B${r}`).value = t;
      wsI.getCell(`B${r}`).alignment = { wrapText: true, vertical: 'top' };
    });

    const notesStart = 4 + steps.length + 2;
    wsI.getCell(`A${notesStart - 1}`).value = 'Important notes';
    wsI.getCell(`A${notesStart - 1}`).font  = { name: 'Arial', size: 12, bold: true };

    const notes = [
      ['HRMID', 'Mandatory. Unique ID, used as the matching key for updates.'],
      ['Name', 'Mandatory. Full name.'],
      ['Vendor', 'Must EXACTLY match a vendor name in Masters (case-insensitive). Unknown values are imported as blank — add the vendor in Masters first.'],
      ['Entity', 'Same rule as Vendor — must match a name in Masters → Entities.'],
      ['Status', 'One of: Active, Exited, On Hold, Renewed.'],
      ['Currency', 'One of: INR, USD, EUR, GBP. "Invoice Amount" cols hold original currency; "(INR)" cols hold the converted amount.'],
      ['Hourly/monthly/per day', 'One of: Hourly, Monthly, PerDay (no spaces).'],
      ['Date columns', 'Use real Excel dates, not text strings.'],
      ['Invoice columns', 'Two per month: original currency + INR. Leave blank for months with no invoice.'],
      ['Remarks', 'Free text.']
    ];
    notes.forEach(([col, note], i) => {
      const r = notesStart + i;
      wsI.getCell(`A${r}`).value = col;
      wsI.getCell(`A${r}`).font  = { name: 'Arial', size: 11, bold: true };
      wsI.getCell(`B${r}`).value = note;
      wsI.getCell(`B${r}`).alignment = { wrapText: true, vertical: 'top' };
      wsI.getRow(r).height = 32;
    });

    // ---- Contractors sheet ----
    const ws = wb.addWorksheet('Contractors');
    ws.addRow(HEADERS);

    const headerRow = ws.getRow(1);
    headerRow.font      = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };
    headerRow.alignment = { horizontal: 'left', vertical: 'center', wrapText: true };
    headerRow.height    = 38;

    const widths = {
      'HRMID': 18, 'Name': 22, 'Vendor': 22, 'Status': 12, 'Entity': 28,
      'Finance SPOC': 18, 'Recruiter': 18,
      'Date of Joining (as Cont)': 16, 'Exit Date as Contractual': 16,
      'Last renewal/contract effective from': 18, 'Contract End Date': 16,
      'Currency': 10, 'Payment': 12, 'Hourly/monthly/per day': 16,
      'Payment Terms': 14,
      'Monthly Approximate Amt. (INR)': 18, 'Annual Approximate Amt. (INR)': 18,
      'Remarks': 30
    };
    HEADERS.forEach((h, i) => { ws.getColumn(i + 1).width = widths[h] || 14; });

    ws.views = [{ state: 'frozen', xSplit: 2, ySplit: 1 }];

    const headerIndex = Object.fromEntries(HEADERS.map((h, i) => [h, i + 1]));
    const rowFromObj = (obj) => HEADERS.map(h => obj[h] !== undefined ? obj[h] : null);
    ws.addRow(rowFromObj(EXAMPLE_ROW_1));
    ws.addRow(rowFromObj(EXAMPLE_ROW_2));

    // Number formats on data columns
    const dateCols = ['Date of Joining (as Cont)', 'Exit Date as Contractual',
                      'Last renewal/contract effective from', 'Contract End Date'];
    const inrCols  = HEADERS.filter(h => h.includes('(INR)') || h.endsWith("'26 (INR)"));
    const amtCols  = ['Payment', ...HEADERS.filter(h => h.includes('Invoice'))];

    dateCols.forEach(h => { ws.getColumn(headerIndex[h]).numFmt = 'yyyy-mm-dd'; });
    inrCols.forEach(h  => { ws.getColumn(headerIndex[h]).numFmt = '#,##0'; });
    amtCols.forEach(h  => { ws.getColumn(headerIndex[h]).numFmt = '#,##0.00'; });

    // Dropdown validations
    const addDropdown = (header, options) => {
      const col = headerIndex[header];
      const letter = ws.getColumn(col).letter;
      for (let r = 2; r <= 1000; r++) {
        ws.getCell(`${letter}${r}`).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [`"${options.join(',')}"`],
          showErrorMessage: true,
          errorStyle: 'warning',
          errorTitle: 'Invalid value',
          error: `Pick one of: ${options.join(', ')}`
        };
      }
    };
    addDropdown('Status',                 ['Active', 'Exited', 'On Hold', 'Renewed']);
    addDropdown('Currency',               ['INR', 'USD', 'EUR', 'GBP']);
    addDropdown('Hourly/monthly/per day', ['Hourly', 'Monthly', 'PerDay']);

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
