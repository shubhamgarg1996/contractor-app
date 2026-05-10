import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Api } from '../api/client.js';

export default function AuditPage() {
  const { hrmid } = useParams();
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Api.audit(hrmid)
      .then(r => setRows(r || []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [hrmid]);

  return (
    <div>
      <h2>Audit history — {hrmid}</h2>
      <div className="toolbar">
        <Link className="btn secondary" to={`/contractors/${encodeURIComponent(hrmid)}`}>
          ← Back to contractor
        </Link>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="card scroll-x">
        {loading ? <p>Loading…</p> : rows.length === 0 ? (
          <p className="muted">No audit entries for this HRMID.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th style={{ width: 160 }}>When</th>
                <th>Who</th>
                <th>Action</th>
                <th>Column</th>
                <th>Old value</th>
                <th>New value</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.AuditID}>
                  <td>{new Date(r.ChangedAt).toLocaleString('en-IN')}</td>
                  <td>{r.ChangedBy || '—'}</td>
                  <td>{r.Action}</td>
                  <td>{r.ChangedColumn || '—'}</td>
                  <td><pre className="pre">{r.OldValue ?? ''}</pre></td>
                  <td><pre className="pre">{r.NewValue ?? ''}</pre></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
