import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Pencil, Trash2, Save, X, Wrench } from 'lucide-react';
import { api } from '../api/client.js';
import { useFetch } from '../lib/useFetch.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from './Toast.jsx';
import { Badge, Button, Card, Empty, Field, Modal, Spinner } from './ui.jsx';
import { fmtDate, fmtDateTime, label } from '../lib/format.js';

const KINDS = ['calibration', 'inspection', 'cleaning', 'repair'];
const KIND_TONE = { calibration: 'teal', inspection: 'blue', cleaning: 'green', repair: 'gold' };

function ReadingsEditor({ rows, setRows }) {
  return (
    <div className="space-y-2">
      {rows.map((r, i) => (
        <div key={i} className="flex gap-2">
          <input className="input font-mono" placeholder="key e.g. offset_mV" value={r.k} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, k: e.target.value } : x)))} />
          <input className="input font-mono" placeholder="value" value={r.v} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, v: e.target.value } : x)))} />
          <Button type="button" variant="ghost" icon={X} onClick={() => setRows(rows.filter((_, j) => j !== i))} />
        </div>
      ))}
      <Button type="button" size="sm" variant="secondary" icon={Plus} onClick={() => setRows([...rows, { k: '', v: '' }])}>Add reading</Button>
    </div>
  );
}

const toRows = (obj) => Object.entries(obj || {}).map(([k, v]) => ({ k, v: typeof v === 'object' ? JSON.stringify(v) : String(v) }));
const fromRows = (rows) => Object.fromEntries(rows.filter((r) => r.k.trim()).map((r) => {
  try { return [r.k.trim(), r.v.trim().startsWith('[') || r.v.trim().startsWith('{') ? JSON.parse(r.v) : r.v]; } catch { return [r.k.trim(), r.v]; }
}));

function LogForm({ open, onClose, equipmentId, equipmentList, initial, onSaved }) {
  const toast = useToast();
  const [state, setState] = useState(null);
  const s = state || {
    equipmentId: initial?.equipmentId || equipmentId || '', kind: initial?.kind || 'calibration', notes: initial?.notes || '',
    performedAt: (initial?.performedAt || new Date().toISOString()).slice(0, 10), nextDueAt: initial?.nextDueAt?.slice(0, 10) || '',
    rows: initial ? toRows(initial.readings) : [{ k: '', v: '' }], setStatus: '',
  };
  const set = (patch) => setState({ ...s, ...patch });
  const close = () => { setState(null); onClose(); };
  async function submit(e) {
    e.preventDefault();
    const body = { equipmentId: s.equipmentId, kind: s.kind, notes: s.notes, performedAt: s.performedAt, nextDueAt: s.nextDueAt || null,
      readings: JSON.stringify(fromRows(s.rows)), setStatus: s.setStatus || undefined };
    try {
      if (initial) await api.patch(`/maintenance/${initial._id}`, body);
      else await api.post('/maintenance', body);
      toast.success(initial ? 'Log updated' : 'Maintenance logged');
      onSaved(); close();
    } catch (err) { toast.error(err); }
  }
  return (
    <Modal open={open} onClose={close} title={initial ? 'Edit maintenance log' : 'Log maintenance'} wide>
      <form onSubmit={submit} className="space-y-4">
        {!equipmentId && !initial && (
          <Field label="Equipment">
            <select className="input" required value={s.equipmentId} onChange={(e) => set({ equipmentId: e.target.value })}>
              <option value="">Choose…</option>
              {equipmentList?.map((e) => <option key={e.equipment_id} value={e.equipment_id}>{e.name}</option>)}
            </select>
          </Field>
        )}
        <div className="grid grid-cols-3 gap-3">
          <Field label="Kind"><select className="input" value={s.kind} onChange={(e) => set({ kind: e.target.value })}>{KINDS.map((k) => <option key={k} value={k}>{label(k)}</option>)}</select></Field>
          <Field label="Performed on"><input type="date" className="input" value={s.performedAt} onChange={(e) => set({ performedAt: e.target.value })} /></Field>
          <Field label="Next due"><input type="date" className="input" value={s.nextDueAt} onChange={(e) => set({ nextDueAt: e.target.value })} /></Field>
        </div>
        <Field label="Notes"><textarea className="input" value={s.notes} onChange={(e) => set({ notes: e.target.value })} /></Field>
        <Field label="Readings" hint="Free-form key/value pairs — every instrument records different fields (flexible MongoDB schema)">
          <ReadingsEditor rows={s.rows} setRows={(rows) => set({ rows })} />
        </Field>
        {!initial && (
          <Field label="Also set equipment status (optional)">
            <select className="input" value={s.setStatus} onChange={(e) => set({ setStatus: e.target.value })}>
              <option value="">Leave unchanged</option><option value="available">Available</option><option value="maintenance">Maintenance</option>
            </select>
          </Field>
        )}
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={close}>Cancel</Button><Button type="submit" icon={Save}>Save</Button></div>
      </form>
    </Modal>
  );
}

export default function MaintenanceLogs({ equipmentId, showEquipment, onChanged }) {
  const { isStaff } = useAuth();
  const toast = useToast();
  const { data, loading, reload } = useFetch(`/maintenance${equipmentId ? `?equipmentId=${equipmentId}` : ''}`);
  const { data: eqList } = useFetch(!equipmentId ? '/equipment' : null);
  const [form, setForm] = useState(null); // null | 'new' | log
  const refresh = () => { reload(); onChanged?.(); };
  async function del(log) {
    if (!window.confirm('Delete this maintenance log?')) return;
    try { await api.del(`/maintenance/${log._id}`); toast.success('Log deleted'); refresh(); } catch (e) { toast.error(e); }
  }
  return (
    <Card padded={false}
      title={<span className="flex items-center gap-2"><Wrench className="h-4 w-4" />Maintenance history <Badge tone="green">MongoDB · maintenance_logs</Badge></span>}
      action={isStaff && <Button size="sm" icon={Plus} onClick={() => setForm('new')}>Log maintenance</Button>}>
      {loading ? <Spinner /> : !data?.length ? <Empty title="No maintenance recorded" /> : (
        <ul className="divide-y divide-line">
          {data.map((l) => (
            <li key={l._id} className="px-5 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={KIND_TONE[l.kind]}>{label(l.kind)}</Badge>
                {showEquipment && <Link to={`/equipment/${l.equipmentId}`} className="text-sm font-medium hover:underline">{l.equipmentName}</Link>}
                <span className="text-xs text-muted">{fmtDateTime(l.performedAt)} · {l.performedByName}</span>
                {l.nextDueAt && <span className="text-xs text-muted">· next due {fmtDate(l.nextDueAt)}</span>}
                {isStaff && (
                  <span className="ml-auto flex gap-1">
                    <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setForm(l)} />
                    <Button size="sm" variant="ghost" icon={Trash2} onClick={() => del(l)} />
                  </span>
                )}
              </div>
              {l.notes && <p className="mt-1 text-sm">{l.notes}</p>}
              {Object.keys(l.readings || {}).length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {Object.entries(l.readings).map(([k, v]) => (
                    <span key={k} className="rounded-md bg-brand-50 px-2 py-0.5 font-mono text-[11px] text-ink">
                      {k}: <b>{typeof v === 'object' ? JSON.stringify(v) : String(v)}</b>
                    </span>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {form && (
        <LogForm open onClose={() => setForm(null)} equipmentId={equipmentId} equipmentList={eqList}
          initial={form === 'new' ? null : form} onSaved={refresh} />
      )}
    </Card>
  );
}
