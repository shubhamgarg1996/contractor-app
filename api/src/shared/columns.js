// Columns allowed on the main Contractors row.
// Monthly invoices live in dbo.ContractorMonthlyInvoice now;
// they're written via the /api/contractors/{hrmid}/invoices endpoint.

const ALL_COLUMNS = [
  'Name','VendorID','Status','EntityID','FinanceSPOC',
  'DateOfJoining','ExitDate','Currency','Payment','PaymentFrequency',
  'PaymentTerms','Recruiter','LastRenewalEffectiveFrom','ContractEndDate',
  'MonthlyApproxINR','AnnualApproxINR','Remarks'
];

const FINANCE_COLUMNS = [
  'Currency','Payment','PaymentFrequency','PaymentTerms',
  'MonthlyApproxINR','AnnualApproxINR','FinanceSPOC'
];

const RECRUITER_COLUMNS = [
  'Name','VendorID','Status','EntityID','DateOfJoining','ExitDate',
  'Recruiter','LastRenewalEffectiveFrom','ContractEndDate','Remarks'
];

function allowedColumnsForRole(roles = []) {
  if (roles.includes('Admin')) return new Set(ALL_COLUMNS);
  const cols = new Set();
  if (roles.includes('FinanceSPOC')) FINANCE_COLUMNS.forEach(c => cols.add(c));
  if (roles.includes('Recruiter'))   RECRUITER_COLUMNS.forEach(c => cols.add(c));
  return cols;
}

module.exports = { ALL_COLUMNS, allowedColumnsForRole };
