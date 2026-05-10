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

  async function downloadTemplate() {
    try {
      const r = await fetch('/api/import/template', { credentials: 'same-origin' });
      if (!r.ok) {
        if (r.status === 401) { window.location.href = '/login'; return; }
        throw new Error(await r.text());
      }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'contractor-import-template.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) { setErr(e.message); }
  }

  return (
    <div>
      <h2>Import contractors</h2>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Step 1 — Get the template</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          The template has the exact column headers the import expects, plus dropdowns for
          Status / Currency / Frequency and two example rows you can replace.
        </p>
        <button className="btn secondary" onClick={downloadTemplate}>
          Download template
        </button>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Step 2 — Upload your filled-in file</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          Rows matching an existing HRMID will be updated; new HRMIDs will be inserted.
          Vendor and Entity are matched by name (case-insensitive) — make sure they exist in Masters first.
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
        <h3 style={{ marginTop: 0 }}>Expected columns (for reference)</h3>
        <p className="muted" style={{ marginTop: 0 }}>
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
