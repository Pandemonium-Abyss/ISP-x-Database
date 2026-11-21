import { useState } from 'react';
import { CalendarPlus, FlaskRound } from 'lucide-react';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from './Toast.jsx';
import { Button, Field } from './ui.jsx';
import TransactionTrace from './TransactionTrace.jsx';
import { toLocalInput } from '../lib/format.js';

/** Creates a booking via the SQL transaction (lock equipment row → overlap check → insert). */
export default function BookingForm({ equipmentId, equipmentList, onBooked }) {
  const { isAdmin, refreshBadges } = useAuth();
  const toast = useToast();
  const start0 = new Date(Date.now() + 3600e3); start0.setMinutes(0, 0, 0);
  const [f, setF] = useState({
    equipment_id: equipmentId || '', start: toLocalInput(start0), end: toLocalInput(new Date(start0.getTime() + 2 * 3600e3)),
    purpose: '', simulateFailure: '',
  });
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api.post('/bookings', {
        equipment_id: f.equipment_id, start_time: new Date(f.start).toISOString(), end_time: new Date(f.end).toISOString(),
        purpose: f.purpose, simulateFailure: f.simulateFailure || undefined,
      });
      setResult({ ok: true, trace: r.trace });
      toast.success(`Booked ${r.equipmentName}`);
      refreshBadges();
      onBooked?.();
    } catch (err) {
      setResult({ ok: false, error: err.message, trace: err.data?.trace || [] });
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={submit} className="space-y-3">
        {!equipmentId && (
          <Field label="Equipment">
            <select className="input" required value={f.equipment_id} onChange={set('equipment_id')}>
              <option value="">Choose…</option>
              {equipmentList?.filter((e) => e.status !== 'retired').map((e) => (
                <option key={e.equipment_id} value={e.equipment_id} disabled={e.status === 'maintenance'}>{e.name}{e.status === 'maintenance' ? ' (maintenance)' : ''}</option>
              ))}
            </select>
          </Field>
        )}
        <div className="grid grid-cols-1 gap-3">
          <Field label="Start"><input type="datetime-local" className="input" required value={f.start} onChange={set('start')} /></Field>
          <Field label="End"><input type="datetime-local" className="input" required value={f.end} onChange={set('end')} /></Field>
        </div>
        <Field label="Purpose"><input className="input" value={f.purpose} onChange={set('purpose')} placeholder="e.g. Thesis imaging run" /></Field>
        {isAdmin && (
          <Field label={<span className="inline-flex items-center gap-1"><FlaskRound className="h-3 w-3" />Rollback demo (admin)</span>}>
            <select className="input" value={f.simulateFailure} onChange={set('simulateFailure')}>
              <option value="">No simulated failure</option>
              <option value="after_booking_insert">Fail after INSERT (forces ROLLBACK)</option>
            </select>
          </Field>
        )}
        <Button type="submit" icon={CalendarPlus} loading={busy} className="w-full">Book time slot</Button>
      </form>
      <TransactionTrace result={result} />
    </div>
  );
}
