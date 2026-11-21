import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ScrollText, Trash2, StickyNote, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { api, qs } from '../api/client.js';
import { useFetch } from '../lib/useFetch.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../components/Toast.jsx';
import { Badge, Button, Card, PageHeader, Spinner, Empty } from '../components/ui.jsx';
import { fmtDateTime } from '../lib/format.js';

const toneFor = (a) => (a.startsWith('order') ? 'green' : a.startsWith('request') ? 'blue' : a.startsWith('booking') ? 'teal'
  : a.startsWith('user') ? 'gray' : a.startsWith('maintenance') || a.startsWith('equipment') ? 'gold' : 'violet');

export default function ActivityLog() {
  const { isAdmin } = useAuth();
  const toast = useToast();
  const [f, setF] = useState({ action: '', q: '', page: 1 });
  const { data, loading, reload } = useFetch(`/activity${qs(f)}`);
  const act = async (fn) => { try { await fn(); reload(); } catch (e) { toast.error(e); } };

  return (
    <>
      <PageHeader title="Activity log" subtitle="Append-only audit trail in MongoDB. Each entry keeps a flexible metadata document describing exactly what changed."
        actions={<Button variant="secondary" icon={RefreshCw} onClick={reload}>Refresh</Button>} />
      <div className="mb-4 flex flex-wrap gap-2">
        <select className="input w-auto" value={f.action} onChange={(e) => setF({ ...f, action: e.target.value, page: 1 })}>
          <option value="">All actions</option>
          {data?.actions.map((a) => <option key={a._id} value={a._id}>{a._id} ({a.n})</option>)}
        </select>
        <input className="input w-64" placeholder="Search user or action, press Enter" onKeyDown={(e) => e.key === 'Enter' && setF({ ...f, q: e.target.value, page: 1 })} />
      </div>
      <Card padded={false}>
        {loading && !data ? <Spinner /> : !data?.items.length ? <Empty icon={ScrollText} title="No log entries" /> : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead><tr><th>When</th><th>User</th><th>Action</th><th>Entity</th><th>Metadata</th><th>IP</th>{isAdmin && <th />}</tr></thead>
              <tbody>
                {data.items.map((l) => (
                  <tr key={l._id}>
                    <td className="whitespace-nowrap tnum text-xs">{fmtDateTime(l.timestamp)}</td>
                    <td className="whitespace-nowrap">{l.userName || <span className="text-muted">anonymous</span>}</td>
                    <td><Badge tone={toneFor(l.action)}>{l.action}</Badge></td>
                    <td className="whitespace-nowrap text-xs">
                      {l.entity?.type === 'request' && l.entity.id ? <Link className="text-brand-700 hover:underline" to={`/requests/${l.entity.id}`}>request #{l.entity.id}</Link>
                        : l.entity?.type ? `${l.entity.type}${l.entity.id ? ` #${String(l.entity.id).slice(-6)}` : ''}` : ''}
                    </td>
                    <td className="max-w-sm">
                      <code className="line-clamp-2 break-all text-[11px] text-muted">{Object.keys(l.metadata || {}).length ? JSON.stringify(l.metadata) : ''}</code>
                      {l.adminNote && <div className="mt-1 text-xs text-tape-600">📝 {l.adminNote}</div>}
                    </td>
                    <td className="tnum text-xs text-muted">{l.ip}</td>
                    {isAdmin && (
                      <td className="whitespace-nowrap text-right">
                        <Button size="sm" variant="ghost" icon={StickyNote} title="Annotate"
                          onClick={() => { const n = window.prompt('Admin note for this entry', l.adminNote || ''); if (n !== null) act(() => api.patch(`/activity/${l._id}`, { adminNote: n })); }} />
                        <Button size="sm" variant="ghost" icon={Trash2} title="Purge entry" onClick={() => window.confirm('Purge this log entry?') && act(() => api.del(`/activity/${l._id}`))} />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {data && (
        <div className="mt-3 flex items-center justify-between text-sm text-muted">
          <span>{data.total} entries</span>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" icon={ChevronLeft} disabled={f.page <= 1} onClick={() => setF({ ...f, page: f.page - 1 })} />
            <span>Page {data.page} / {data.pages || 1}</span>
            <Button size="sm" variant="secondary" icon={ChevronRight} disabled={f.page >= data.pages} onClick={() => setF({ ...f, page: f.page + 1 })} />
          </div>
        </div>
      )}
    </>
  );
}
