import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { Api } from '../api/client.js';
import { useAuth } from '../hooks/useAuth.js';

const MONTHS = [
  ['Jan-25','Jan25'], ['Feb-25','Feb25'], ['Mar-25','Mar25'],
  ['Apr-25','Apr25'], ['May-25','May25'], ['Jun-25','Jun25'],
  ['Jul-25','Jul25'], ['Aug-25','Aug25'], ['Sep-25','Sep25'],
  ['Oct-25','Oct25'], ['Nov-25','Nov25'], ['Dec-25','Dec25'],
  ['Jan-26','Jan26'], ['Feb-26','Feb26'], ['Mar-26','Mar26']
];

export default function ContractorDetail({ mode }) {
  const { hrmid } = useParams();
  const nav = useNavigate();
  const { has } = useAuth();
  const [data, setData] = useState({});
  const [vendors, setVendors] = useState([]);
  const [entities, setEntities] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([Api.vendors(), Api.entities()])
      .then(([v, e]) => { setVendors(v || []); setEntities(e || []); });
    if (mode === 'edit' && hrmid) {
      Api.get(hrmid).then(setData).catch(e => setError(e.message));
    }
  }, [mode, hrmid]);

  function set(k, v) {
    setData(prev => ({ ...prev, [k]: v === '' ? null : v }));
  }
  function setNum(k, v) {
    if (v === '' || v == null) set(k, null);
    else { const n = Number(v); set(k, Number.isNaN(n) ? null : n); }
  }

  async function save() {
    setError(''); setSuccess(''); setBusy(true);
    try {
      // Strip out fields the API doesn't accept on write (joined names, audit cols)
      const { VendorName, EntityName, CreatedAt, CreatedBy, UpdatedAt, UpdatedBy, ...payload } = data;
      if (mode === 'new') {
        await Api.create(payload);
        nav('/contractors/' + encodeURIComponent(payload.HRMID));
      } else {
        const { HRMID, ...rest } = payload;
        await Api.update(hrmid, rest);
        setSuccess('Saved.');
      }
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function remove() {
    if (!confirm('Delete this contractor? This will be audited.')) return;
    setBusy(true);
    try {
      await Api.remove(hrmid);
      nav('/contractors');
    } catch (e) { setError(e.message); setBusy(false); }
  }

  const canEdit = has('Admin','FinanceSPOC','Recruiter');

  return (
    <div>
      <h2>{mode === 'new' ? 'New contractor' : (data.Name || hrmid || '')}</h2>
      {error && <div className="error">{error}</div>}
      {success && <div className="success">{success}</div>}

      <div className="card">
        <h3>Identity</h3>
        <div className="grid cols-3">
          <Field label="HRMID" required>
            <input value={data.HRMID || ''} onChange={e => set('HRMID', e.target.value)}
                   disabled={mode === 'edit'} />
          </Field>
          <Field label="Name" required>
            <input value={data.Name || ''} onChange={e => set('Name', e.target.value)} />
          </Field>
          <Field label="Status">
            <select value={data.Status || ''} onChange={e => set('Status', e.target.value)}>
              <option value="">—</option>
              <option>Active</option><option>Exited</option>
              <option>On Hold</option><option>Renewed</option>
            </select>
          </Field>
          <Field label="Vendor">
            <select value={data.VendorID || ''} onChange={e => set('VendorID', e.target.value ? +e.target.value : null)}>
              <option value="">—</option>
              {vendors.map(v => <option key={v.VendorID} value={v.VendorID}>{v.VendorName}</option>)}
            </select>
          </Field>
          <Field label="Entity">
            <select value={data.EntityID || ''} onChange={e => set('EntityID', e.target.value ? +e.target.value : null)}>
              <option value="">—</option>
              {entities.map(en => <option key={en.EntityID} value={en.EntityID}>{en.EntityName}</option>)}
            </select>
          </Field>
          <Field label="Recruiter">
            <input value={data.Recruiter || ''} onChange={e => set('Recruiter', e.target.value)} />
          </Field>
        </div>
      </div>

      <div className="card">
        <h3>Contract</h3>
        <div className="grid cols-3">
          <Field label="Date of joining">
            <input type="date" value={dateVal(data.DateOfJoining)}
                   onChange={e => set('DateOfJoining', e.target.value || null)} />
          </Field>
          <Field label="Last renewal effective from">
            <input type="date" value={dateVal(data.LastRenewalEffectiveFrom)}
                   onChange={e => set('LastRenewalEffectiveFrom', e.target.value || null)} />
          </Field>
          <Field label="Contract end date">
            <input type="date" value={dateVal(data.ContractEndDate)}
                   onChange={e => set('ContractEndDate', e.target.value || null)} />
          </Field>
          <Field label="Exit date">
            <input type="date" value={dateVal(data.ExitDate)}
                   onChange={e => set('ExitDate', e.target.value || null)} />
          </Field>
          <Field label="Finance SPOC">
            <input value={data.FinanceSPOC || ''} onChange={e => set('FinanceSPOC', e.target.value)} />
          </Field>
        </div>
      </div>

      <div className="card">
        <h3>Payment</h3>
        <div className="grid cols-3">
          <Field label="Currency">
            <select value={data.Currency || ''} onChange={e => set('Currency', e.target.value)}>
              <option value="">—</option>
              <option>INR</option><option>USD</option><option>EUR</option><option>GBP</option>
            </select>
          </Field>
          <Field label="Payment">
            <input type="number" value={data.Payment ?? ''} onChange={e => setNum('Payment', e.target.value)} />
          </Field>
          <Field label="Frequency">
            <select value={data.PaymentFrequency || ''} onChange={e => set('PaymentFrequency', e.target.value)}>
              <option value="">—</option>
              <option value="Hourly">Hourly</option>
              <option value="Monthly">Monthly</option>
              <option value="PerDay">Per day</option>
            </select>
          </Field>
          <Field label="Payment terms">
            <input value={data.PaymentTerms || ''} onChange={e => set('PaymentTerms', e.target.value)} />
          </Field>
          <Field label="Monthly approx (INR)">
            <input type="number" value={data.MonthlyApproxINR ?? ''} onChange={e => setNum('MonthlyApproxINR', e.target.value)} />
          </Field>
          <Field label="Annual approx (INR)">
            <input type="number" value={data.AnnualApproxINR ?? ''} onChange={e => setNum('AnnualApproxINR', e.target.value)} />
          </Field>
        </div>
      </div>

      <div className="card">
        <h3>Monthly invoices</h3>
        <div className="scroll-x">
          <table>
            <thead><tr><th style={{ width: 100 }}>Month</th><th>Invoice amount</th><th>INR</th></tr></thead>
            <tbody>
              {MONTHS.map(([label, key]) => (
                <tr key={key}>
                  <td>{label}</td>
                  <td>
                    <input type="number" value={data[`${key}_Inv`] ?? ''}
                           onChange={e => setNum(`${key}_Inv`, e.target.value)}
                           style={{ width: 180 }} />
                  </td>
                  <td>
                    <input type="number" value={data[`${key}_INR`] ?? ''}
                           onChange={e => setNum(`${key}_INR`, e.target.value)}
                           style={{ width: 180 }} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <Field label="Remarks">
          <textarea rows={3} value={data.Remarks || ''} onChange={e => set('Remarks', e.target.value)} />
        </Field>
      </div>

      <div className="toolbar">
        {canEdit && <button className="btn" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>}
        {mode === 'edit' && has('Admin') && (
          <button className="btn danger" onClick={remove} disabled={busy}>Delete</button>
        )}
        {mode === 'edit' && has('Admin') && (
          <Link className="btn secondary" to={`/audit/${encodeURIComponent(hrmid)}`}>Audit history</Link>
        )}
        <Link className="btn secondary" to="/contractors">Back</Link>
      </div>
    </div>
  );
}

function Field({ label, required, children }) {
  return (
    <div className="form-row">
      <label>{label}{required ? ' *' : ''}</label>
      {children}
    </div>
  );
}
function dateVal(d) {
  if (!d) return '';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '';
  return dt.toISOString().slice(0, 10);
}
