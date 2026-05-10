// Defines every column the API will accept on POST/PUT, and which subset
// each role is allowed to write. This is the column-level RBAC layer.

const MONTH_KEYS = [
  'Jan25','Feb25','Mar25','Apr25','May25','Jun25',
  'Jul25','Aug25','Sep25','Oct25','Nov25','Dec25',
  'Jan26','Feb26','Mar26'
];

const MONTH_COLUMNS = MONTH_KEYS.flatMap(m => [`${m}_Inv`, `${m}_INR`]);

const MONTH_LABELS = [
  ['Jan-25','Jan25'], ['Feb-25','Feb25'], ['Mar-25','Mar25'],
  ['Apr-25','Apr25'], ['May-25','May25'], ['Jun-25','Jun25'],
  ['Jul-25','Jul25'], ['Aug-25','Aug25'], ['Sep-25','Sep25'],
  ['Oct-25','Oct25'], ['Nov-25','Nov25'], ['Dec-25','Dec25'],
  ['Jan-26','Jan26'], ['Feb-26','Feb26'], ['Mar-26','Mar26']
];

const ALL_COLUMNS = [
  'Name','VendorID','Status','EntityID','FinanceSPOC',
  'DateOfJoining','ExitDate','Currency','Payment','PaymentFrequency',
  'PaymentTerms','Recruiter','LastRenewalEffectiveFrom','ContractEndDate',
  'MonthlyApproxINR','AnnualApproxINR','Remarks',
  ...MONTH_COLUMNS
];

const FINANCE_COLUMNS = [
  'Currency','Payment','PaymentFrequency','PaymentTerms',
  'MonthlyApproxINR','AnnualApproxINR','FinanceSPOC',
  ...MONTH_COLUMNS
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

module.exports = {
  ALL_COLUMNS, MONTH_COLUMNS, MONTH_LABELS, MONTH_KEYS, allowedColumnsForRole
};
