const { sql } = require('./db');

// Compare oldRow and newRow on the keys present in newRow, write one
// AuditLog row per changed column. Pass the open Transaction so writes
// participate in the same atomic unit as the data change.
async function logChanges(transaction, hrmid, oldRow, newRow, action, changedBy) {
  const cols = Object.keys(newRow);
  for (const c of cols) {
    const oldV = oldRow ? oldRow[c] : null;
    const newV = newRow[c];
    const changed = String(oldV ?? '') !== String(newV ?? '');
    if (!changed && action !== 'INSERT') continue;
    await new sql.Request(transaction)
      .input('HRMID', sql.NVarChar(50), hrmid)
      .input('Action', sql.NVarChar(20), action)
      .input('ChangedColumn', sql.NVarChar(100), c)
      .input('OldValue', sql.NVarChar(sql.MAX), oldV != null ? String(oldV) : null)
      .input('NewValue', sql.NVarChar(sql.MAX), newV != null ? String(newV) : null)
      .input('ChangedBy', sql.NVarChar(255), changedBy)
      .query(`INSERT INTO dbo.AuditLog (HRMID,[Action],ChangedColumn,OldValue,NewValue,ChangedBy)
              VALUES (@HRMID,@Action,@ChangedColumn,@OldValue,@NewValue,@ChangedBy)`);
  }
}

module.exports = { logChanges };
