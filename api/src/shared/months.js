// MonthKey conventions:
//   - 'YYYY-MM' (e.g. '2025-01', '2026-04', '2030-12')
//   - Sortable, comparable, future-proof.

const MONTH_NAMES_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTH_NAMES_FULL  = ['January','February','March','April','May','June','July','August','September','October','November','December'];

// '2025-01' -> 'Jan-25'
function monthKeyToLabel(key) {
  if (!isValidMonthKey(key)) return key;
  const [y, m] = key.split('-');
  return `${MONTH_NAMES_SHORT[parseInt(m,10)-1]}-${y.slice(2)}`;
}

// '2025-01' -> 'January 2025'
function monthKeyToLong(key) {
  if (!isValidMonthKey(key)) return key;
  const [y, m] = key.split('-');
  return `${MONTH_NAMES_FULL[parseInt(m,10)-1]} ${y}`;
}

// Excel header for original currency invoice column (matches the master template).
//   '2025-01'  -> "Jan'25 Invoice Amount"
//   '2026-04'  -> "Apr'26 Invoice Amount"
function monthKeyToExcelInvoiceHeader(key) {
  if (!isValidMonthKey(key)) return key;
  const [y, m] = key.split('-');
  return `${MONTH_NAMES_SHORT[parseInt(m,10)-1]}'${y.slice(2)} Invoice Amount`;
}

// Excel header for INR column.
//   '2025-01' -> 'Jan (INR)'
//   '2025-12' -> 'Dec (INR)'
//   '2026-01' -> "Jan'26 (INR)"   (year shown when it's not the "current" calendar year of the file)
function monthKeyToExcelINRHeader(key, referenceYear) {
  if (!isValidMonthKey(key)) return key;
  const [y, m] = key.split('-');
  const monthShort = MONTH_NAMES_SHORT[parseInt(m,10)-1];
  if (referenceYear && parseInt(y,10) === referenceYear) {
    return `${monthShort} (INR)`;
  }
  return `${monthShort}'${y.slice(2)} (INR)`;
}

function isValidMonthKey(key) {
  return typeof key === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(key);
}

// Build the canonical list of months between two MonthKeys, inclusive.
function monthRange(startKey, endKey) {
  if (!isValidMonthKey(startKey) || !isValidMonthKey(endKey)) return [];
  const out = [];
  let [y, m] = startKey.split('-').map(Number);
  const [endY, endM] = endKey.split('-').map(Number);
  while (y < endY || (y === endY && m <= endM)) {
    out.push(`${y}-${String(m).padStart(2,'0')}`);
    m++; if (m > 12) { m = 1; y++; }
  }
  return out;
}

// Add N months to a MonthKey.
function addMonths(key, n) {
  if (!isValidMonthKey(key)) return key;
  let [y, m] = key.split('-').map(Number);
  m += n;
  while (m > 12) { m -= 12; y++; }
  while (m < 1)  { m += 12; y--; }
  return `${y}-${String(m).padStart(2,'0')}`;
}

module.exports = {
  isValidMonthKey, monthRange, addMonths,
  monthKeyToLabel, monthKeyToLong,
  monthKeyToExcelInvoiceHeader, monthKeyToExcelINRHeader,
  MONTH_NAMES_SHORT, MONTH_NAMES_FULL
};
