import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Api } from '../api/client.js';
import { useAuth } from '../hooks/useAuth.js';

export default function ContractorsList() {
  const { has } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  async function load() {
    setLoading(true); setError('');
    try {
      const qs = new URLSearchParams();
      if (search) qs.set('search', search);
      if (status) qs.set('status', status);
      const data = await Api.list(qs.toString());
      setRows(data || []);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  async function exportXlsx() {
    try {
      const res = await fetch('/api/export');
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Contractors_${new Date().toISOString().slice(0,10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) { setError(e.message); }
  }

  return (
    <div>
      <h2>Contractors</h2>
      {error && <div className="error">{error}</div>}

      <div className="toolbar">
        <input placeholder="Search HRMID or name…" value={search}
               onChange={e => setSearch(e.target.value)}
               onKeyDown={e => e.key === 'Enter' && load()}
               style={{ width: 240 }} />
        <select value={status} onChange={e => setStatus(e.target.value)} style={{ width: 160 }}>
          <option value="">All statuses</option>
          <option>Active</option>
          <option>Exited</option>
          <option>On Hold</option>
          <option>Renewed</option>
        </select>
        <button className="btn secondary" onClick={load}>Apply</button>
        {has('Admin','FinanceSPOC','Recruiter') && (
          <Link to="/contractors/new" className="btn">+ New contractor</Link>
        )}
        {has('Admin','FinanceSPOC') && (
          <button className="btn secondary" onClick={exportXlsx}>Export Excel</button>
        )}
      </div>

      <div className="card scroll-x">
        {loading ? <p>Loading…</p> : rows.length === 0 ? <p className="muted">No contractors found.</p> : (
          <table>
            <thead><tr>
              <th>HRMID</th><th>Name</th><th>Vendor</th><th>Entity</th>
              <th>Status</th><th>Joining</th><th>Contract end</th>
              <th>Monthly INR</th><th></th>
            </tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.HRMID}>
                  <td><Link to={`/contractors/${encodeURIComponent(r.HRMID)}`}>{r.HRMID}</Link></td>
                  <td>{r.Name}</td>
                  <td>{r.VendorName || '—'}</td>
                  <td>{r.EntityName || '—'}</td>
                  <td>{r.Status || '—'}</td>
                  <td>{fmtDate(r.DateOfJoining)}</td>
                  <td>{fmtDate(r.ContractEndDate)}</td>
                  <td>{fmtINR(r.MonthlyApproxINR)}</td>
                  <td><Link to={`/contractors/${encodeURIComponent(r.HRMID)}`}>Edit</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN');
}
function fmtINR(n) {
  if (n == null) return '—';
  return Number(n).toLocaleString('en-IN');
}
