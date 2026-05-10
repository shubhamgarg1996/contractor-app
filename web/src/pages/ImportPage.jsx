import { useState } from 'react';
import { Api } from '../api/client.js';

export default function ImportPage() {
  const [file, setFile] = useState(null);
  const [res, setRes] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function go() {
    if (!file) return;
    setBusy(true); setErr(''); setRes(null);
    try {
      const r = await Api.importFile(file);
      setRes(r);
    } catch (e) {
      // Server returns { errors: [{row, error}, ...] } on validation failure
      try {
        const parsed = JSON.parse(e.message);
        if (parsed && parsed.errors) {
          setErr('Validation failed:\n' +
            parsed.errors.map(x => `  row ${x.row}: ${x.error}`).join('\n'));
        } else if (parsed && parsed.error) {
          setErr(parsed.error);
        } else {
          setErr(e.message);
        }
      } catch { setErr(e.message); }
    } finally { setBusy(false); }
  }

  return (
    <div>
      <h2>Import contractors</h2>

      <div className="card">
        <p className="muted" style={{ marginTop: 0 }}>
          Upload an Excel file using the same column headers as the master tracker.
          Rows matching an existing HRMID will be updated; new HRMIDs will be inserted.
          Vendor and Entity values are matched by name (case-insensitive).
        </p>

        <div className="toolbar">
          <input type="file" accept=".xlsx" onChange={e => setFile(e.target.files[0] || null)} />
          <button className="btn" onClick={go} disabled={!file || busy}>
            {busy ? 'Importing…' : 'Import'}
          </button>
          {file && <span className="muted">{file.name}</span>}
        </div>

        {err && <div className="error"><pre className="pre">{err}</pre></div>}
        {res && (
          <div className="success">
            Done. {res.totalRows} rows processed — {res.inserted} inserted, {res.updated} updated.
          </div>
        )}
      </div>

      <div className="card">
        <h3>Expected columns</h3>
        <p className="muted">
          HRMID, Name, Vendor, Status, Entity, Finance SPOC, Date of Joining (as Cont),
          Exit Date as Contractual, Currency, Payment, Hourly/monthly/per day, Payment Terms,
          Recruiter, Last renewal/contract effective from, Contract End Date,
          Monthly Approximate Amt. (INR), Annual Approximate Amt. (INR), Remarks,
          Jan'25 Invoice Amount, Jan (INR), … through Mar'26 Invoice Amt., Mar'26 (INR).
        </p>
      </div>
    </div>
  );
}
