import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarX2, Trash2, CalendarClock, Save } from 'lucide-react';
import { api, qs } from '../api/client.js';
import { useFetch } from '../lib/useFetch.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../components/Toast.jsx';
import { Button, Card, PageHeader, Spinner, StatusBadge, Empty, Tabs, Modal, Field } from '../components/ui.jsx';
import BookingForm from '../components/BookingForm.jsx';
import TransactionTrace from '../components/TransactionTrace.jsx';
import { fmtDateTime, toLocalInput } from '../lib/format.js';

export default function Bookings() {
  const { isStaff } = useAuth();
  const toast = useToast();
  const [scope, setScope] = useState('mine');
  const [when, setWhen] = useState('upcoming');
  const { data, loading, reload } = useFetch(`/bookings${qs({ scope, upcoming: when === 'upcoming' ? '1' : '' })}`);
  const { data: equipment } = useFetch('/equipment');
  const [resched, setResched] = useState(null);

  const act = async (fn, msg) => { try { await fn(); toast.success(msg); reload(); } catch (e) { toast.error(e); } };

  return (
    <>
      <PageHeader title="Bookings" subtitle="Reserve shared instruments. Overlapping slots are rejected inside a database transaction, so double-booking is impossible." />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="mb-3 flex flex-wrap gap-2">
            {isStaff && <Tabs value={scope} onChange={setScope} tabs={[['mine', 'My bookings'], ['all', 'Everyone']]} />}
            <Tabs value={when} onChange={setWhen} tabs={[['upcoming', 'Upcoming'], ['all', 'All']]} />
          </div>
          <Card padded={false}>
            {loading ? <Spinner /> : !data?.length ? <Empty icon={CalendarClock} title="No bookings" /> : (
              <div className="overflow-x-auto">
                <table className="table-base">
                  <thead><tr><th>Equipment</th>{scope === 'all' && <th>Who</th>}<th>Start</th><th>End</th><th>Purpose</th><th>Status</th><th /></tr></thead>
                  <tbody>
                    {data.map((b) => (
                      <tr key={b.booking_id}>
                        <td><Link to={`/equipment/${b.equipment_id}`} className="font-medium hover:underline">{b.equipment_name}</Link><div className="text-xs text-muted">{b.location}</div></td>
                        {scope === 'all' && <td>{b.user_name}</td>}
                        <td className="whitespace-nowrap tnum text-xs">{fmtDateTime(b.start_time)}</td>
                        <td className="whitespace-nowrap tnum text-xs">{fmtDateTime(b.end_time)}</td>
                        <td className="text-muted">{b.purpose}</td>
                        <td><StatusBadge status={b.status} /></td>
                        <td className="whitespace-nowrap text-right">
                          {b.status === 'booked' && new Date(b.end_time) > Date.now() && (
                            <>
                              <Button size="sm" variant="ghost" onClick={() => setResched(b)}>Reschedule</Button>
                              <Button size="sm" variant="ghost" icon={CalendarX2} title="Cancel booking"
                                onClick={() => act(() => api.patch(`/bookings/${b.booking_id}`, { status: 'cancelled' }), 'Booking cancelled')} />
                            </>
                          )}
                          <Button size="sm" variant="ghost" icon={Trash2} title="Delete record"
                            onClick={() => window.confirm('Delete this booking record permanently?') && act(() => api.del(`/bookings/${b.booking_id}`), 'Booking deleted')} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
        <Card title="New booking"><BookingForm equipmentList={equipment} onBooked={reload} /></Card>
      </div>
      {resched && <Reschedule booking={resched} onClose={() => setResched(null)} onDone={reload} />}
    </>
  );
}

function Reschedule({ booking, onClose, onDone }) {
  const toast = useToast();
  const [start, setStart] = useState(toLocalInput(booking.start_time));
  const [end, setEnd] = useState(toLocalInput(booking.end_time));
  const [result, setResult] = useState(null);
  async function save() {
    try {
      const r = await api.patch(`/bookings/${booking.booking_id}`, { start_time: new Date(start).toISOString(), end_time: new Date(end).toISOString() });
      toast.success('Booking rescheduled');
      setResult({ ok: true, trace: r.trace });
      onDone();
    } catch (e) { setResult({ ok: false, error: e.message, trace: e.data?.trace }); }
  }
  return (
    <Modal open onClose={onClose} title={`Reschedule · ${booking.equipment_name}`}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Start"><input type="datetime-local" className="input" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
          <Field label="End"><input type="datetime-local" className="input" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
        </div>
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Close</Button><Button icon={Save} onClick={save}>Save</Button></div>
        <TransactionTrace result={result} />
      </div>
    </Modal>
  );
}
