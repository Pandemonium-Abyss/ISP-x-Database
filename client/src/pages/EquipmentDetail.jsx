import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Pencil, Trash2, AlertTriangle, MapPin, Microscope } from 'lucide-react';
import { api } from '../api/client.js';
import { useFetch } from '../lib/useFetch.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../components/Toast.jsx';
import { Button, Card, Spinner, StatusBadge, PriorityBadge, Empty, Modal, Badge } from '../components/ui.jsx';
import EquipmentForm from '../components/EquipmentForm.jsx';
import BookingForm from '../components/BookingForm.jsx';
import MaintenanceLogs from '../components/MaintenanceLogs.jsx';
import { fmtDateTime, label } from '../lib/format.js';

export default function EquipmentDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const { isStaff } = useAuth();
  const { data: eq, loading, reload, error } = useFetch(`/equipment/${id}`);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  if (error) return <Empty title="Equipment not found" />;
  if (loading || !eq) return <Spinner />;
  const now = Date.now();
  const upcoming = eq.bookings.filter((b) => new Date(b.end_time) > now && b.status === 'booked').reverse();
  const past = eq.bookings.filter((b) => !(new Date(b.end_time) > now && b.status === 'booked')).slice(0, 10);

  async function remove() {
    try { await api.del(`/equipment/${id}`); toast.success(`${eq.name} deleted`); nav('/equipment'); } catch (e) { toast.error(e); }
  }

  return (
    <>
      <Link to="/equipment" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-brand-700"><ArrowLeft className="h-4 w-4" /> Equipment</Link>
      <div className="card mb-6 flex flex-col overflow-hidden sm:flex-row">
        <div className="flex h-48 shrink-0 items-center justify-center bg-bench sm:h-auto sm:w-64">
          {eq.image_path ? <img src={eq.image_path} alt={eq.name} className="h-full w-full object-cover" /> : <Microscope className="h-14 w-14 text-brand-600/30" />}
        </div>
        <div className="flex-1 p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-sm text-muted">{eq.category}</div>
              <h1 className="mt-1 font-display text-[2.5rem] font-semibold leading-[1.05] text-ink">{eq.name}</h1>
              <div className="mt-1 flex items-center gap-3 text-sm text-muted"><span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{eq.location}</span><StatusBadge status={eq.status} /></div>
            </div>
            <div className="flex gap-2">
              <Link to={`/requests/new?type=maintenance&equipment=${eq.equipment_id}`}><Button variant="secondary" icon={AlertTriangle}>Report issue</Button></Link>
              {isStaff && <Button variant="secondary" icon={Pencil} onClick={() => setEditing(true)}>Edit</Button>}
              {isStaff && <Button variant="danger" icon={Trash2} onClick={() => setDeleting(true)} />}
            </div>
          </div>
          {eq.description && <p className="mt-4 max-w-2xl text-sm">{eq.description}</p>}
          {eq.lastMaintenance && (
            <p className="mt-3 text-xs text-muted">Last {eq.lastMaintenance.kind} {fmtDateTime(eq.lastMaintenance.performedAt)} by {eq.lastMaintenance.performedByName}</p>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title={<span className="flex items-center gap-2">Schedule <Badge tone="blue">MySQL · equipment_bookings ⨝ users</Badge></span>} padded={false}>
            {upcoming.length === 0 ? <Empty title="No upcoming bookings — it's free" /> : (
              <table className="table-base">
                <thead><tr><th>When</th><th>Who</th><th>Purpose</th></tr></thead>
                <tbody>{upcoming.map((b) => (
                  <tr key={b.booking_id}><td className="whitespace-nowrap tnum text-xs">{fmtDateTime(b.start_time)} → {fmtDateTime(b.end_time)}</td><td>{b.user_name}</td><td className="text-muted">{b.purpose}</td></tr>
                ))}</tbody>
              </table>
            )}
            {past.length > 0 && (
              <details className="border-t border-line px-5 py-3 text-sm">
                <summary className="cursor-pointer text-muted">Recent history ({past.length})</summary>
                <ul className="mt-2 space-y-1">{past.map((b) => (
                  <li key={b.booking_id} className="flex justify-between gap-3 text-xs"><span>{fmtDateTime(b.start_time)} · {b.user_name}</span><StatusBadge status={b.status} /></li>
                ))}</ul>
              </details>
            )}
          </Card>
          <MaintenanceLogs equipmentId={eq.equipment_id} onChanged={reload} />
          <Card title="Related requests" padded={false}>
            {eq.requests.length === 0 ? <Empty title="No requests mention this equipment" /> : (
              <ul className="divide-y divide-line">{eq.requests.map((r) => (
                <li key={r.request_id}><Link to={`/requests/${r.request_id}`} className="flex items-center gap-3 px-5 py-2.5 text-sm hover:bg-brand-50/40">
                  <span className="tnum text-xs text-muted">#{r.request_id}</span><span className="flex-1">{r.title}</span>
                  <span className="text-xs text-muted">{label(r.type)}</span><PriorityBadge priority={r.priority} /><StatusBadge status={r.status} />
                </Link></li>
              ))}</ul>
            )}
          </Card>
        </div>
        <Card title="Book this equipment">
          {['maintenance', 'retired'].includes(eq.status)
            ? <p className="text-sm text-muted">This equipment is <b>{label(eq.status)}</b> and cannot be booked right now.</p>
            : <BookingForm equipmentId={eq.equipment_id} onBooked={reload} />}
        </Card>
      </div>

      <EquipmentForm open={editing} onClose={() => setEditing(false)} initial={eq} onSaved={reload} />
      <Modal open={deleting} onClose={() => setDeleting(false)} title={`Delete ${eq.name}?`}>
        <p className="text-sm text-muted">Its bookings are deleted (FK cascade), related requests keep their history (FK set null), and its maintenance logs are removed from MongoDB.</p>
        <div className="mt-5 flex justify-end gap-2"><Button variant="secondary" onClick={() => setDeleting(false)}>Cancel</Button><Button variant="danger" icon={Trash2} onClick={remove}>Delete</Button></div>
      </Modal>
    </>
  );
}
