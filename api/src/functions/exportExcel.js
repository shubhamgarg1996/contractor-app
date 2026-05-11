const { app } = require('@azure/functions');
const { getPool } = require('../shared/db');
const { getPrincipal, hasRole } = require('../shared/auth');
const { monthKeyToExcelInvoiceHeader, monthKeyToExcelINRHeader } = require('../shared/months');
const ExcelJS = require('exceljs');

// (DB column, Excel header) for the scalar (non-invoice) part
const SCALAR_COLUMNS = [
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
  ['Remarks', 'Remarks']
];

app.http('exportContractors', {
  methods: ['GET'],
  route: 'export',
  authLevel: 'anonymous',
  handler: async (request) => {
    if (!hasRole(getPrincipal(request), 'Admin','FinanceSPOC'))
      return { status: 401, jsonBody: { error: 'Unauthorized' } };

    const pool = await getPool();
    const contractorsP = pool.request().query(`
      SELECT c.*, v.VendorName, e.EntityName
      FROM dbo.Contractors c
      LEFT JOIN dbo.Vendors  v ON v.VendorID = c.VendorID
      LEFT JOIN dbo.Entities e ON e.EntityID = c.EntityID
      ORDER BY c.HRMID`);
    const invoicesP = pool.request().query(`
      SELECT HRMID, MonthKey, InvoiceAmount, INRAmount
      FROM dbo.ContractorMonthlyInvoice
      ORDER BY HRMID, MonthKey`);
    const [contractors, invoices] = await Promise.all([contractorsP, invoicesP]);

    // Collect every MonthKey that has data, sorted ascending
    const monthKeys = [...new Set(invoices.recordset.map(r => r.MonthKey))].sort();

    // Index invoices: HRMID → MonthKey → { InvoiceAmount, INRAmount }
    const byHrmid = new Map();
    for (const inv of invoices.recordset) {
      let m = byHrmid.get(inv.HRMID);
      if (!m) { m = new Map(); byHrmid.set(inv.HRMID, m); }
      m.set(inv.MonthKey, inv);
    }

    // Build the workbook
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Contractors');

    // Header row: scalar headers + 2 columns per month (Inv + INR)
    const headers = [
      ...SCALAR_COLUMNS.map(([, h]) => h),
      ...monthKeys.flatMap(k => [monthKeyToExcelInvoiceHeader(k), monthKeyToExcelINRHeader(k)])
    ];
    ws.addRow(headers);
    ws.getRow(1).font = { bold: true };

    // Data rows
    for (const c of contractors.recordset) {
      const scalarVals = SCALAR_COLUMNS.map(([k]) => c[k] != null ? c[k] : null);
      const monthVals = monthKeys.flatMap(k => {
        const inv = byHrmid.get(c.HRMID)?.get(k);
        return [
          inv ? inv.InvoiceAmount : null,
          inv ? inv.INRAmount : null
        ];
      });
      ws.addRow([...scalarVals, ...monthVals]);
    }
    ws.columns.forEach(col => { col.width = 18; });

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
