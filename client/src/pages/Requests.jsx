import { Link, useSearchParams } from 'react-router-dom';
import { Plus, Search, MessageSquare, Package } from 'lucide-react';
import { useFetch } from '../lib/useFetch.js';
import { qs } from '../api/client.js';
import { Button, Card, PageHeader, Spinner, StatusBadge, PriorityBadge, TypeBadge, Empty, Tabs } from '../components/ui.jsx';
import { REQUEST_TYPES, PRIORITIES, REQUEST_STATUSES, label, timeAgo, fmtDate } from '../lib/format.js';

export default function Requests() {
  const [params, setParams] = useSearchParams();
  const f = Object.fromEntries(params);
  const scope = f.mine === '1' ? 'mine' : f.assigned === 'me' ? 'assigned' : f.assigned === 'none' ? 'unassigned' : 'all';
  const { data, loading } = useFetch(`/requests${qs({ ...f, open: f.status ? undefined : f.open ?? '1' })}`);

  const update = (patch) => {
    const next = { ...f, ...patch };
    Object.keys(next).forEach((k) => (next[k] === '' || next[k] === undefined) && delete next[k]);
    setParams(next);
  };
  const setScope = (s) => update({ mine: s === 'mine' ? '1' : undefined, assigned: s === 'assigned' ? 'me' : s === 'unassigned' ? 'none' : undefined });

  return (
    <>
      <PageHeader title="Requests" subtitle="Experiment setups, maintenance, access, consumables and internal tickets — one queue, clear priorities."
        actions={<Link to="/requests/new"><Button icon={Plus}>New request</Button></Link>} />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Tabs value={scope} onChange={setScope} tabs={[['all', 'All'], ['mine', 'Filed by me'], ['assigned', 'Assigned to me'], ['unassigned', 'Unassigned']]} />
        <div className="relative ml-auto">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted" />
          <input className="input w-56 pl-8" placeholder="Search title…" defaultValue={f.q}
            onKeyDown={(e) => e.key === 'Enter' && update({ q: e.target.value })} />
        </div>
        <select className="input w-auto" value={f.type || ''} onChange={(e) => update({ type: e.target.value })}>
          <option value="">All types</option>
          {REQUEST_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select className="input w-auto" value={f.priority || ''} onChange={(e) => update({ priority: e.target.value })}>
          <option value="">Any priority</option>
          {PRIORITIES.map((p) => <option key={p} value={p}>{label(p)}</option>)}
        </select>
        <select className="input w-auto" value={f.status || (f.open === '0' ? 'any' : '')} onChange={(e) => update(
          e.target.value === 'any' ? { status: undefined, open: '0' } : { status: e.target.value, open: undefined })}>
          <option value="">Open only</option>
          <option value="any">Any status</option>
          {REQUEST_STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
        </select>
      </div>

      <Card padded={false}>
        {loading ? <Spinner /> : !data?.length ? <Empty title="No requests match these filters" /> : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr><th>#</th><th>Request</th><th>Type</th><th>Priority</th><th>Status</th><th>Requester</th><th>Assignee</th><th>Due</th><th>Updated</th></tr>
              </thead>
              <tbody>
                {data.map((r) => (
                  <tr key={r.request_id}>
                    <td className="tnum text-xs text-muted">{r.request_id}</td>
                    <td className="min-w-[16rem] max-w-sm">
                      <Link to={`/requests/${r.request_id}`} className="font-medium hover:text-brand-700 hover:underline">{r.title}</Link>
                      <div className="flex items-center gap-3 text-xs text-muted">
                        {r.equipment_name && <span>{r.equipment_name}</span>}
                        {r.item_count > 0 && <span className="inline-flex items-center gap-1"><Package className="h-3 w-3" />{r.item_count}</span>}
                        {r.comment_count > 0 && <span className="inline-flex items-center gap-1"><MessageSquare className="h-3 w-3" />{r.comment_count}</span>}
                      </div>
                    </td>
                    <td><TypeBadge type={r.type} /></td>
                    <td><PriorityBadge priority={r.priority} /></td>
                    <td><StatusBadge status={r.status} /></td>
                    <td className="whitespace-nowrap">{r.requester_name}</td>
                    <td className="whitespace-nowrap text-muted">{r.assignee_name || '—'}</td>
                    <td className="whitespace-nowrap text-xs">{fmtDate(r.due_date)}</td>
                    <td className="whitespace-nowrap text-xs text-muted">{timeAgo(r.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {data && <p className="mt-2 text-xs text-muted">{data.length} request(s) · sorted by open first, then priority</p>}
    </>
  );
}
