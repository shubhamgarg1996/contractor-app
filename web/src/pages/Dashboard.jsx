import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Api } from '../api/client.js';
import {
  Bar, BarChart, CartesianGrid, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis
} from 'recharts';

export default function Dashboard() {
  const [d, setD] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    Api.dashboard().then(setD).catch(e => setError(e.message));
  }, []);

  if (error) return <div className="error">{error}</div>;
  if (!d) return <p>Loading…</p>;

  const totalCr = (d.totals?.TotalINR || 0) / 1e7;

  return (
    <div>
      <h2>Dashboard</h2>

      <div className="grid cols-4">
        <Tile label="Total spend (₹ Cr)" value={totalCr.toFixed(2)} />
        <Tile label="Active"  value={d.totals?.ActiveCount ?? 0} />
        <Tile label="Exited"  value={d.totals?.ExitedCount ?? 0} />
        <Tile label="Total"   value={d.totals?.TotalCount  ?? 0} />
      </div>

      <div className="grid cols-2" style={{ marginTop: 16 }}>
        <Card title="Monthly trend (INR)">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={d.trend}>
              <CartesianGrid stroke="#eef2f7" />
              <XAxis dataKey="Month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={fmtAxis} width={70} />
              <Tooltip formatter={v => fmtINR(v)} />
              <Line type="monotone" dataKey="INR" stroke="#2563eb" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Spend by vendor (top 10)">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={d.byVendor.slice(0, 10)} layout="vertical" margin={{ left: 20 }}>
              <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={fmtAxis} />
              <YAxis dataKey="VendorName" type="category" width={130} tick={{ fontSize: 11 }} />
              <Tooltip formatter={v => fmtINR(v)} />
              <Bar dataKey="INR" fill="#0ea5e9" />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Spend by entity">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={d.byEntity}>
              <CartesianGrid stroke="#eef2f7" />
              <XAxis dataKey="EntityName" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={fmtAxis} width={70} />
              <Tooltip formatter={v => fmtINR(v)} />
              <Bar dataKey="INR" fill="#10b981" />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Contracts ending in next 90 days">
          <div className="scroll-x">
            {d.expiring.length === 0 ? <p className="muted">None.</p> : (
              <table>
                <thead>
                  <tr><th>HRMID</th><th>Name</th><th>Vendor</th><th>End</th><th>Days</th></tr>
                </thead>
                <tbody>
                  {d.expiring.map(r => (
                    <tr key={r.HRMID}>
                      <td><Link to={`/contractors/${encodeURIComponent(r.HRMID)}`}>{r.HRMID}</Link></td>
                      <td>{r.Name}</td>
                      <td>{r.VendorName || '—'}</td>
                      <td>{new Date(r.ContractEndDate).toLocaleDateString('en-IN')}</td>
                      <td>{r.DaysLeft}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function Tile({ label, value }) {
  return <div className="tile"><h3>{label}</h3><div className="v">{value}</div></div>;
}
function Card({ title, children }) {
  return <div className="card"><h3 style={{ marginBottom: 12 }}>{title}</h3>{children}</div>;
}
function fmtINR(n) {
  if (n == null) return '—';
  return '₹' + Number(n).toLocaleString('en-IN');
}
function fmtAxis(n) {
  if (n == null) return '';
  if (Math.abs(n) >= 1e7) return (n / 1e7).toFixed(1) + ' Cr';
  if (Math.abs(n) >= 1e5) return (n / 1e5).toFixed(1) + ' L';
  if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(1) + ' K';
  return String(n);
}
