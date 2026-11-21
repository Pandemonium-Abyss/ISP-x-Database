import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Search, MapPin, CalendarClock, ClipboardList, Microscope } from 'lucide-react';
import { useFetch } from '../lib/useFetch.js';
import { qs } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Button, PageHeader, Spinner, StatusBadge, Empty, Tabs } from '../components/ui.jsx';
import EquipmentForm from '../components/EquipmentForm.jsx';

export default function Equipment() {
  const { isStaff } = useAuth();
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const { data, loading, reload } = useFetch(`/equipment${qs({ status, q })}`);
  const categories = [...new Set((data || []).map((e) => e.category))];

  return (
    <>
      <PageHeader title="Equipment" subtitle="Shared instruments, their status and who is using them. Book a slot or report a problem."
        actions={isStaff && <Button icon={Plus} onClick={() => setAdding(true)}>Add equipment</Button>} />
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Tabs value={status} onChange={setStatus} tabs={[['', 'All'], ['available', 'Available'], ['in_use', 'In use'], ['maintenance', 'Maintenance'], ['retired', 'Retired']]} />
        <div className="relative ml-auto">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted" />
          <input className="input w-60 pl-8" placeholder="Search name or room…" onKeyDown={(e) => e.key === 'Enter' && setQ(e.target.value)} />
        </div>
      </div>
      {loading ? <Spinner /> : !data?.length ? <Empty title="No equipment found" /> : categories.map((cat) => (
        <section key={cat} className="mb-8">
          <h2 className="mb-3 border-b-2 border-ink pb-1.5 font-display text-xl font-semibold">{cat}</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {data.filter((e) => e.category === cat).map((e) => (
              <Link key={e.equipment_id} to={`/equipment/${e.equipment_id}`} className="card group overflow-hidden transition-colors hover:border-brand-600">
                <div className="flex h-32 items-center justify-center bg-bench">
                  {e.image_path ? <img src={e.image_path} alt={e.name} className="h-full w-full object-cover" /> : <Microscope className="h-10 w-10 text-muted/30" strokeWidth={1.25} />}
                </div>
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold leading-snug group-hover:text-brand-800">{e.name}</h3>
                    <StatusBadge status={e.status} />
                  </div>
                  <div className="mt-2 space-y-1 text-xs text-muted">
                    <div className="flex items-center gap-1.5"><MapPin className="h-3 w-3" />{e.location}</div>
                    <div className="flex items-center gap-3">
                      <span className="flex items-center gap-1.5"><CalendarClock className="h-3 w-3" />{e.upcoming_bookings} upcoming</span>
                      <span className="flex items-center gap-1.5"><ClipboardList className="h-3 w-3" />{e.open_requests} open requests</span>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ))}
      <EquipmentForm open={adding} onClose={() => setAdding(false)} onSaved={reload} />
    </>
  );
}
