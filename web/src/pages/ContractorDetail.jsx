import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { Api } from '../api/client.js';
import { useAuth } from '../hooks/useAuth.js';

const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function monthKeyLabel(key) {
  const [y, m] = key.split('-');
  return `${MONTH_SHORT[parseInt(m,10)-1]}-${y.slice(2)}`;
}
function monthKeyLong(key) {
  const [y, m] = key.split('-');
  return `${MONTH_SHORT[parseInt(m,10)-1]} ${y}`;
}
function currentMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}
function addMonthsToKey(key, n) {
  let [y, m] = key.split('-').map(Number);
  m += n;
  while (m > 12) { m -= 12; y++; }
  while (m < 1)  { m += 12; y--; }
  return `${y}-${String(m).padStart(2,'0')}`;
}
function monthRange(startKey, endKey) {
  const out = [];
  let [y, m] = startKey.split('-').map(Number);
  const [endY, endM] = endKey.split('-').map(Number);
  while (y < endY || (y === endY && m <= endM)) {
    out.push(`${y}-${String(m).padStart(2,'0')}`);
    m++; if (m > 12) { m = 1; y++; }
  }
  return out;
}

export default function ContractorDetail({ mode }) {
  const { hrmid } = useParams();
  const nav = useNavigate();
  const { has } = useAuth();

  const [data, setData]         = useState({});
  const [vendors, setVendors]   = useState([]);
  const [entities, setEntities] = useState([]);
  const [invoices, setInvoices] = useState({});   // monthKey → { inv, inr }
  const [originalInvoices, setOriginal] = useState({});
  const [extraMonths, setExtraMonths]   = useState([]);
  const [error, setError]   = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy]     = useState(false);

  useEffect(() => {
    Promise.all([Api.vendors(), Api.entities()])
      .then(([v, e]) => { setVendors(v || []); setEntities(e || []); });
    if (mode === 'edit' && hrmid) {
      Api.get(hrmid).then(setData).catch(e => setError(e.message));
      Api.invoices(hrmid).then(list => {
        const m = {};
        for (const r of (list || [])) {
          m[r.MonthKey] = { inv: r.InvoiceAmount, inr: r.INRAmount };
        }
        setInvoices(m);
        setOriginal(m);
      }).catch(e => setError(e.message));
    }
  }, [mode, hrmid]);

  // Build the month list shown in the grid. For an existing contractor, span from
  // min(invoice month) to max(today+12, max(invoice month)). For a new contractor,
  // show this year so far + 12 months ahead.
  const months = useMemo(() => {
    const keys = Object.keys(invoices);
    const now = currentMonthKey();
    const futureCap = addMonthsToKey(now, 12);
    let start, end;
    if (keys.length) {
      keys.sort();
      start = keys[0];
      end   = keys[keys.length - 1];
    } else {
      start = `${now.slice(0,4)}-01`;
      end   = futureCap;
    }
    if (end < futureCap) end = futureCap;
    const list = monthRange(start, end);
    for (const k of extraMonths) if (!list.includes(k)) list.push(k);
    list.sort();
    return list;
  }, [invoices, extraMonths]);

  function set(k, v) {
    setData(prev => ({ ...prev, [k]: v === '' ? null : v }));
  }
  function setNum(k, v) {
    if (v === '' || v == null) set(k, null);
    else { const n = Number(v); set(k, Number.isNaN(n) ? null : n); }
  }

  function setInvoice(key, kind, raw) {
    setInvoices(prev => {
      const cur = { ...(prev[key] || { inv: null, inr: null }) };
      cur[kind] = raw === '' ? null : (Number.isNaN(Number(raw)) ? raw : Number(raw));
      return { ...prev, [key]: cur };
    });
  }

  function addMonth() {
    const last = months[months.length - 1] || currentMonthKey();
    const next = addMonthsToKey(last, 1);
    setExtraMonths(prev => prev.includes(next) ? prev : [...prev, next]);
  }

  async function save() {
    setError(''); setSuccess(''); setBusy(true);
    try {
      const { VendorName, EntityName, CreatedAt, CreatedBy, UpdatedAt, UpdatedBy, ...payload } = data;

      if (mode === 'new') {
        await Api.create(payload);
        // After creating the scalar row, push any invoice values
        const inv = Object.entries(invoices)
          .filter(([, v]) => v && (v.inv != null || v.inr != null))
          .map(([monthKey, v]) => ({ monthKey, invoiceAmount: v.inv, inrAmount: v.inr }));
        if (inv.length) await Api.saveInvoices(payload.HRMID, inv);
        nav('/contractors/' + encodeURIComponent(payload.HRMID));
        return;
      }

      const { HRMID, ...scalar } = payload;
      await Api.update(hrmid, scalar);

      // Diff invoices and send only changed months
      const changed = [];
      for (const k of new Set([...Object.keys(invoices), ...Object.keys(originalInvoices)])) {
        const cur  = invoices[k]         || { inv: null, inr: null };
        const orig = originalInvoices[k] || { inv: null, inr: null };
        const invChanged = (cur.inv ?? null) !== (orig.inv ?? null);
        const inrChanged = (cur.inr ?? null) !== (orig.inr ?? null);
        if (invChanged || inrChanged)
          changed.push({ monthKey: k, invoiceAmount: cur.inv, inrAmount: cur.inr });
      }
      if (changed.length) {
        await Api.saveInvoices(hrmid, changed);
        setOriginal(invoices);
      }
      setSuccess('Saved.');
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
            <input list="currencies" value={data.Currency || ''} onChange={e => set('Currency', e.target.value)} />
            <datalist id="currencies">
              <option>INR</option><option>USD</option><option>EUR</option>
              <option>GBP</option><option>AUD</option><option>CAD</option><option>AED</option>
            </datalist>
          </Field>
          <Field label="Payment">
            <input type="number" value={data.Payment ?? ''} onChange={e => setNum('Payment', e.target.value)} />
          </Field>
          <Field label="Frequency">
            <input list="freqs" value={data.PaymentFrequency || ''} onChange={e => set('PaymentFrequency', e.target.value)} />
            <datalist id="freqs">
              <option>Hourly</option><option>Monthly</option><option>Daily</option>
              <option>PerDay</option><option>Per Invoice</option>
            </datalist>
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
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: 8 }}>
          <h3 style={{ margin:0 }}>Monthly invoices</h3>
          {canEdit && <button className="btn secondary" onClick={addMonth}>+ Add month</button>}
        </div>
        <p className="muted" style={{ marginTop: 0 }}>
          Showing {months.length} months. To clear a month, leave both cells blank and save.
        </p>
        <div className="scroll-x">
          <table>
            <thead><tr><th style={{ width: 100 }}>Month</th><th>Invoice amount</th><th>INR</th></tr></thead>
            <tbody>
              {months.map(key => {
                const v = invoices[key] || { inv: null, inr: null };
                return (
                  <tr key={key}>
                    <td>{monthKeyLabel(key)}</td>
                    <td>
                      <input type="number" value={v.inv ?? ''}
                             onChange={e => setInvoice(key, 'inv', e.target.value)}
                             style={{ width: 180 }} disabled={!canEdit} />
                    </td>
                    <td>
                      <input type="number" value={v.inr ?? ''}
                             onChange={e => setInvoice(key, 'inr', e.target.value)}
                             style={{ width: 180 }} disabled={!canEdit} />
                    </td>
                  </tr>
                );
              })}
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
