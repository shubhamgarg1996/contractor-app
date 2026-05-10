const { app } = require('@azure/functions');
const { getPool } = require('../shared/db');
const { getPrincipal, hasRole } = require('../shared/auth');
const ExcelJS = require('exceljs');

// (DB column, Excel header) — same order/headers as the master tracker
const EXPORT_COLUMNS = [
  ['HRMID', 'HRMID'],
  ['Name', 'Name'],
  ['VendorName', 'Vendor'],
  ['Status', 'Status'],
  ['EntityName', 'Entity'],
  ['FinanceSPOC', 'Finance SPOC'],
  ['DateOfJoining', 'Date of Joining (as Cont)'],
  ['ExitDate', 'Exit Date as Contractual'],
  ['Currency', 'Currency'],
  ['Payment', 'Payment'],
  ['PaymentFrequency', 'Hourly/monthly/per day'],
  ['PaymentTerms', 'Payment Terms'],
  ['Recruiter', 'Recruiter'],
  ['LastRenewalEffectiveFrom', 'Last renewal/contract effective from'],
  ['ContractEndDate', 'Contract End Date'],
  ['MonthlyApproxINR', 'Monthly Approximate Amt. (INR)'],
  ['AnnualApproxINR', 'Annual Approximate Amt. (INR)'],
  ['Remarks', 'Remarks'],
  ['Jan25_Inv', "Jan'25 Invoice Amount"], ['Jan25_INR', 'Jan (INR)'],
  ['Feb25_Inv', "Feb'25 Invoice Amount"], ['Feb25_INR', 'Feb (INR)'],
  ['Mar25_Inv', 'March Invoice Amt.'],   ['Mar25_INR', 'Mar (INR)'],
  ['Apr25_Inv', 'April Invoice Amt.'],   ['Apr25_INR', 'Apr (INR)'],
  ['May25_Inv', 'May Invoice Amt.'],     ['May25_INR', 'May (INR)'],
  ['Jun25_Inv', 'Jun Invoice Amt.'],     ['Jun25_INR', 'Jun (INR)'],
  ['Jul25_Inv', 'Jul Invoice Amt.'],     ['Jul25_INR', 'Jul (INR)'],
  ['Aug25_Inv', 'Aug Invoice Amt.'],     ['Aug25_INR', 'Aug (INR)'],
  ['Sep25_Inv', 'Sep Invoice Amt.'],     ['Sep25_INR', 'Sep (INR)'],
  ['Oct25_Inv', 'Oct Invoice Amt.'],     ['Oct25_INR', 'Oct (INR)'],
  ['Nov25_Inv', 'Nov Invoice Amt.'],     ['Nov25_INR', 'Nov (INR)'],
  ['Dec25_Inv', 'Dec Invoice Amt.'],     ['Dec25_INR', 'Dec (INR)'],
  ['Jan26_Inv', "Jan'26 Invoice Amt."],  ['Jan26_INR', "Jan'26 (INR)"],
  ['Feb26_Inv', "Feb'26 Invoice Amt."],  ['Feb26_INR', "Feb'26 (INR)"],
  ['Mar26_Inv', "Mar'26 Invoice Amt."],  ['Mar26_INR', "Mar'26 (INR)"]
];

app.http('exportContractors', {
  methods: ['GET'],
  route: 'export',
  authLevel: 'anonymous',
  handler: async (request) => {
    if (!hasRole(getPrincipal(request), 'Admin','FinanceSPOC'))
      return { status: 401, body: 'Unauthorized' };

    const pool = await getPool();
    const r = await pool.request().query(`
      SELECT c.*, v.VendorName, e.EntityName
      FROM dbo.Contractors c
      LEFT JOIN dbo.Vendors  v ON v.VendorID = c.VendorID
      LEFT JOIN dbo.Entities e ON e.EntityID = c.EntityID
      ORDER BY c.HRMID`);

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Contractors');
    ws.addRow(EXPORT_COLUMNS.map(([, h]) => h));
    ws.getRow(1).font = { bold: true };
    for (const row of r.recordset) {
      ws.addRow(EXPORT_COLUMNS.map(([k]) => row[k] != null ? row[k] : null));
    }
    ws.columns.forEach(c => { c.width = 20; });

    const buf = await wb.xlsx.writeBuffer();
    return {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="Contractors_${new Date().toISOString().slice(0,10)}.xlsx"`
      },
      body: Buffer.from(buf)
    };
  }
});
