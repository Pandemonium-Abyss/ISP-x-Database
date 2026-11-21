import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { FlaskConical, Wrench, KeyRound, Ticket, Beaker } from 'lucide-react';
import { api } from '../api/client.js';
import { useFetch } from '../lib/useFetch.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../components/Toast.jsx';
import { Button, Card, Field, PageHeader, cx } from '../components/ui.jsx';
import { PRIORITIES, label } from '../lib/format.js';

const TYPES = [
  ['experiment_setup', 'Experiment setup', Beaker, 'Prepare instruments, samples or a protocol for a run'],
  ['maintenance', 'Equipment maintenance', Wrench, 'Something is broken, needs calibration or service'],
  ['access', 'Access permission', KeyRound, 'Room / instrument access, training sign-off, accounts'],
  ['ticket', 'Internal ticket', Ticket, 'Small tasks: fix a script, calibrate a sensor, update a doc'],
];

export default function NewRequest() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const toast = useToast();
  const { isStaff } = useAuth();
  const { data: equipment } = useFetch('/equipment');
  const { data: users } = useFetch(isStaff ? '/users' : null);
  const [form, setForm] = useState({
    type: params.get('type') || 'ticket', title: '', description: '', priority: 'medium',
    equipment_id: params.get('equipment') || '', due_date: '', assignee_id: '',
  });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api.post('/requests', form);
      toast.success(`Request #${r.request_id} created — staff have been notified`);
      nav(`/requests/${r.request_id}`);
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title="New request" subtitle="Tell the lab team what you need. You can follow progress and discuss it on the request page." />
      <form onSubmit={submit} className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="What kind of request?">
            <div className="grid gap-3 sm:grid-cols-2">
              {TYPES.map(([v, l, Icon, d]) => (
                <button type="button" key={v} onClick={() => setForm({ ...form, type: v })}
                  className={cx('flex gap-3 rounded-md border p-3 text-left transition',
                    form.type === v ? 'border-brand-600 bg-brand-50 ring-2 ring-brand-100' : 'border-line hover:border-brand-600/50')}>
                  <Icon className={cx('mt-0.5 h-5 w-5 shrink-0', form.type === v ? 'text-brand-700' : 'text-muted')} />
                  <span><span className="block text-sm font-semibold">{l}</span><span className="text-xs text-muted">{d}</span></span>
                </button>
              ))}
              <Link to="/consumables" className="flex gap-3 rounded-md border border-dashed border-line p-3 text-left hover:border-tape-400 sm:col-span-2">
                <FlaskConical className="mt-0.5 h-5 w-5 text-tape-600" />
                <span><span className="block text-sm font-semibold">Consumables order</span>
                  <span className="text-xs text-muted">Add items to your cart from the inventory — stock is reserved atomically at checkout.</span></span>
              </Link>
            </div>
          </Card>
          <Card title="Details">
            <div className="space-y-4">
              <Field label="Title"><input className="input" required maxLength={200} value={form.title} onChange={set('title')} placeholder="e.g. Calibrate pH meter before Thursday's run" /></Field>
              <Field label="Description"><textarea className="input min-h-32" value={form.description} onChange={set('description')} placeholder="Context, steps tried, deadlines, links to protocols…" /></Field>
            </div>
          </Card>
        </div>
        <div className="space-y-6">
          <Card title="Triage">
            <div className="space-y-4">
              <Field label="Priority">
                <div className="grid grid-cols-4 gap-1">
                  {PRIORITIES.slice().reverse().map((p) => (
                    <button type="button" key={p} onClick={() => setForm({ ...form, priority: p })}
                      className={cx('rounded-md border px-2 py-1.5 text-xs', form.priority === p
                        ? { urgent: 'border-danger bg-danger text-white', high: 'border-tape-600 bg-tape-400 text-ink', medium: 'border-brand-700 bg-brand-700 text-white', low: 'border-stone-400 bg-stone-200' }[p]
                        : 'border-line hover:border-brand-600')}>{label(p)}</button>
                  ))}
                </div>
              </Field>
              <Field label="Related equipment (optional)">
                <select className="input" value={form.equipment_id} onChange={set('equipment_id')}>
                  <option value="">—</option>
                  {equipment?.map((e) => <option key={e.equipment_id} value={e.equipment_id}>{e.name}</option>)}
                </select>
              </Field>
              <Field label="Needed by (optional)"><input type="date" className="input" value={form.due_date} onChange={set('due_date')} /></Field>
              {isStaff && (
                <Field label="Assign to">
                  <select className="input" value={form.assignee_id} onChange={set('assignee_id')}>
                    <option value="">Unassigned</option>
                    {users?.filter((u) => u.role !== 'member').map((u) => <option key={u.user_id} value={u.user_id}>{u.full_name}</option>)}
                  </select>
                </Field>
              )}
            </div>
          </Card>
          <Button type="submit" size="lg" className="w-full" loading={busy}>Submit request</Button>
        </div>
      </form>
    </>
  );
}
