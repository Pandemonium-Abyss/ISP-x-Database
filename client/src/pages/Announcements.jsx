import { useState } from 'react';
import { Megaphone, Pin, PinOff, Pencil, Trash2, Plus, Save } from 'lucide-react';
import { api } from '../api/client.js';
import { useFetch } from '../lib/useFetch.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../components/Toast.jsx';
import { Avatar, Badge, Button, Card, Field, Modal, PageHeader, Spinner, Empty } from '../components/ui.jsx';
import { fmtDate, timeAgo } from '../lib/format.js';

export default function Announcements() {
  const { isStaff } = useAuth();
  const toast = useToast();
  const { data, loading, reload } = useFetch('/announcements');
  const [editing, setEditing] = useState(null);
  const act = async (fn, msg) => { try { await fn(); toast.success(msg); reload(); } catch (e) { toast.error(e); } };

  return (
    <>
      <PageHeader title="Announcements" subtitle="The lab notice board — onboarding info, outages, events. New members start here."
        actions={isStaff && <Button icon={Plus} onClick={() => setEditing('new')}>Post announcement</Button>} />
      {loading ? <Spinner /> : !data?.length ? <Empty icon={Megaphone} title="No announcements yet" /> : (
        <div className="grid gap-4 md:grid-cols-2">
          {data.map((a) => (
            <Card key={a._id} className={a.pinned ? 'border-tape-400/60 ring-1 ring-tape-100' : ''}>
              <div className="flex items-start gap-3">
                <Avatar name={a.authorName || '?'} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {a.pinned && <Pin className="h-3.5 w-3.5 text-tape-600" />}
                    <h3 className="font-semibold">{a.title}</h3>
                    {a.audience !== 'all' && <Badge tone="violet">{a.audience} only</Badge>}
                  </div>
                  <div className="text-xs text-muted">{a.authorName} · {fmtDate(a.createdAt)} ({timeAgo(a.createdAt)}){a.updatedAt && ' · edited'}</div>
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">{a.body}</p>
                  {a.tags?.length > 0 && <div className="mt-3 flex flex-wrap gap-1">{a.tags.map((t) => <Badge key={t} tone="teal">#{t}</Badge>)}</div>}
                </div>
              </div>
              {isStaff && (
                <div className="mt-4 flex justify-end gap-1 border-t border-line pt-3">
                  <Button size="sm" variant="ghost" icon={a.pinned ? PinOff : Pin} onClick={() => act(() => api.patch(`/announcements/${a._id}`, { pinned: !a.pinned }), a.pinned ? 'Unpinned' : 'Pinned')}>{a.pinned ? 'Unpin' : 'Pin'}</Button>
                  <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setEditing(a)}>Edit</Button>
                  <Button size="sm" variant="ghost" icon={Trash2} onClick={() => window.confirm('Delete this announcement?') && act(() => api.del(`/announcements/${a._id}`), 'Deleted')}>Delete</Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
      {editing && <AnnouncementForm initial={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={reload} />}
    </>
  );
}

function AnnouncementForm({ initial, onClose, onSaved }) {
  const toast = useToast();
  const [f, setF] = useState({
    title: initial?.title || '', body: initial?.body || '', tags: (initial?.tags || []).join(', '),
    audience: initial?.audience || 'all', pinned: initial?.pinned || false, notifyAll: !initial,
  });
  async function submit(e) {
    e.preventDefault();
    try {
      if (initial) await api.patch(`/announcements/${initial._id}`, f);
      else await api.post('/announcements', f);
      toast.success(initial ? 'Announcement updated' : 'Announcement posted');
      onSaved(); onClose();
    } catch (err) { toast.error(err); }
  }
  return (
    <Modal open onClose={onClose} title={initial ? 'Edit announcement' : 'Post announcement'} wide>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Title"><input className="input" required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <Field label="Message"><textarea className="input min-h-32" required value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tags (comma separated)"><input className="input" value={f.tags} onChange={(e) => setF({ ...f, tags: e.target.value })} placeholder="equipment, onboarding" /></Field>
          <Field label="Audience">
            <select className="input" value={f.audience} onChange={(e) => setF({ ...f, audience: e.target.value })}>
              <option value="all">Everyone</option><option value="members">Members</option><option value="staff">Staff only</option>
            </select>
          </Field>
        </div>
        <div className="flex gap-6 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" checked={f.pinned} onChange={(e) => setF({ ...f, pinned: e.target.checked })} /> Pin to top</label>
          {!initial && <label className="flex items-center gap-2"><input type="checkbox" checked={f.notifyAll} onChange={(e) => setF({ ...f, notifyAll: e.target.checked })} /> Notify everyone</label>}
        </div>
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" icon={Save}>{initial ? 'Save' : 'Post'}</Button></div>
      </form>
    </Modal>
  );
}
