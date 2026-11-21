import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Paperclip, Pencil, Trash2, Send, SmilePlus, Package, CalendarClock, Save, X } from 'lucide-react';
import { api } from '../api/client.js';
import { useFetch } from '../lib/useFetch.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../components/Toast.jsx';
import { Avatar, Badge, Button, Card, Field, Spinner, StatusBadge, PriorityBadge, TypeBadge, Empty, Modal } from '../components/ui.jsx';
import { PRIORITIES, REQUEST_STATUSES, label, fmtDate, fmtDateTime, timeAgo, money } from '../lib/format.js';

export default function RequestDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const { user, isStaff, refreshBadges } = useAuth();
  const { data: rq, loading, reload, error } = useFetch(`/requests/${id}`);
  const { data: comments, reload: reloadComments } = useFetch(`/requests/${id}/comments`);
  const { data: users } = useFetch('/users');
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (error) return <Empty title="Request not found"><Link to="/requests" className="text-brand-700 underline">Back to requests</Link></Empty>;
  if (loading || !rq) return <Spinner />;
  const canEdit = isStaff || rq.requester_id === user.user_id;
  const finished = ['resolved', 'closed'].includes(rq.status);

  async function patch(body, msg) {
    try {
      await api.patch(`/requests/${id}`, body);
      toast.success(msg || 'Request updated');
      reload();
      refreshBadges();
    } catch (e) { toast.error(e); }
  }

  async function remove() {
    try {
      await api.del(`/requests/${id}`);
      toast.success(`Request #${id} deleted${rq.items.length && !finished ? ' — stock returned to inventory' : ''}`);
      nav('/requests');
    } catch (e) { toast.error(e); }
  }

  return (
    <>
      <Link to="/requests" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-brand-700"><ArrowLeft className="h-4 w-4" /> Requests</Link>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="tnum text-sm text-muted">#{rq.request_id}</span>
            <TypeBadge type={rq.type} /><PriorityBadge priority={rq.priority} /><StatusBadge status={rq.status} />
          </div>
          <h1 className="font-display text-[2.5rem] font-semibold leading-[1.05] text-ink">{rq.title}</h1>
          <p className="mt-1 text-sm text-muted">Filed by {rq.requester_name} · {fmtDateTime(rq.created_at)}</p>
        </div>
        {canEdit && (
          <div className="flex gap-2">
            <Button variant="secondary" icon={Pencil} onClick={() => setEditing(true)}>Edit</Button>
            <Button variant="danger" icon={Trash2} onClick={() => setConfirmDelete(true)}>Delete</Button>
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Description">
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{rq.description || <span className="text-muted">No description.</span>}</p>
          </Card>

          {rq.type === 'consumables' && (
            <ItemsCard rq={rq} canEdit={canEdit && !finished} onChange={reload} />
          )}

          {rq.bookings.length > 0 && (
            <Card title={<span className="flex items-center gap-2"><CalendarClock className="h-4 w-4" />Linked bookings</span>}>
              <ul className="space-y-1 text-sm">{rq.bookings.map((b) => (
                <li key={b.booking_id} className="flex justify-between"><span>{b.equipment_name}</span><span className="text-muted">{fmtDateTime(b.start_time)} – {fmtDateTime(b.end_time)}</span></li>
              ))}</ul>
            </Card>
          )}

          <Comments requestId={rq.request_id} comments={comments} reload={reloadComments} />
        </div>

        <div className="space-y-6">
          <Card title="Workflow">
            <div className="space-y-4">
              <Field label="Status">
                <select className="input" value={rq.status} disabled={!isStaff && !canEdit}
                  onChange={(e) => patch({ status: e.target.value }, `Status → ${label(e.target.value)}`)}>
                  {REQUEST_STATUSES.filter((s) => isStaff || s === rq.status || s === 'closed').map((s) => <option key={s} value={s}>{label(s)}</option>)}
                </select>
              </Field>
              <Field label="Priority">
                <select className="input" value={rq.priority} disabled={!canEdit} onChange={(e) => patch({ priority: e.target.value }, 'Priority updated')}>
                  {PRIORITIES.map((p) => <option key={p} value={p}>{label(p)}</option>)}
                </select>
              </Field>
              <Field label="Assignee">
                {isStaff ? (
                  <select className="input" value={rq.assignee_id || ''} onChange={(e) => patch({ assignee_id: e.target.value || null }, 'Assignee updated')}>
                    <option value="">Unassigned</option>
                    {users?.filter((u) => u.role !== 'member').map((u) => <option key={u.user_id} value={u.user_id}>{u.full_name}</option>)}
                  </select>
                ) : <div className="text-sm">{rq.assignee_name || <span className="text-muted">Unassigned</span>}</div>}
              </Field>
              {isStaff && !rq.assignee_id && (
                <Button variant="gold" className="w-full" onClick={() => patch({ assignee_id: user.user_id, status: rq.status === 'open' ? 'in_progress' : rq.status }, 'You picked this up')}>
                  Pick up this request
                </Button>
              )}
            </div>
          </Card>
          <Card title="Details">
            <dl className="space-y-2 text-sm">
              {[
                ['Requester', <span className="flex items-center gap-2"><Avatar name={rq.requester_name} src={rq.requester_avatar} size={22} />{rq.requester_name}</span>],
                ['Equipment', rq.equipment_name ? <Link className="text-brand-700 hover:underline" to={`/equipment/${rq.equipment_id}`}>{rq.equipment_name}</Link> : '—'],
                ['Needed by', fmtDate(rq.due_date)],
                ['Created', fmtDateTime(rq.created_at)],
                ['Last update', timeAgo(rq.updated_at)],
                ['Resolved', rq.resolved_at ? fmtDateTime(rq.resolved_at) : '—'],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4"><dt className="text-muted">{k}</dt><dd className="text-right">{v}</dd></div>
              ))}
            </dl>
          </Card>
        </div>
      </div>

      <EditModal open={editing} onClose={() => setEditing(false)} rq={rq} onSave={async (b) => { await patch(b, 'Request saved'); setEditing(false); }} />
      <Modal open={confirmDelete} onClose={() => setConfirmDelete(false)} title={`Delete request #${rq.request_id}?`}>
        <p className="text-sm text-muted">This removes the request, its line items and its comment thread.
          {rq.items.length > 0 && !finished && ' Reserved consumables will be returned to stock in the same SQL transaction.'}</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirmDelete(false)}>Cancel</Button>
          <Button variant="danger" icon={Trash2} onClick={remove}>Delete</Button>
        </div>
      </Modal>
    </>
  );
}

function EditModal({ open, onClose, rq, onSave }) {
  const [f, setF] = useState(null);
  const form = f || { title: rq.title, description: rq.description || '', due_date: rq.due_date ? rq.due_date.slice(0, 10) : '' };
  return (
    <Modal open={open} onClose={() => { setF(null); onClose(); }} title="Edit request">
      <div className="space-y-4">
        <Field label="Title"><input className="input" value={form.title} onChange={(e) => setF({ ...form, title: e.target.value })} /></Field>
        <Field label="Description"><textarea className="input min-h-32" value={form.description} onChange={(e) => setF({ ...form, description: e.target.value })} /></Field>
        <Field label="Needed by"><input type="date" className="input" value={form.due_date} onChange={(e) => setF({ ...form, due_date: e.target.value })} /></Field>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button icon={Save} onClick={() => { onSave(form); setF(null); }}>Save</Button>
        </div>
      </div>
    </Modal>
  );
}

function ItemsCard({ rq, canEdit, onChange }) {
  const toast = useToast();
  const [edit, setEdit] = useState({});
  const total = rq.items.reduce((s, i) => s + Number(i.line_total), 0);
  async function save(item) {
    try {
      await api.patch(`/requests/${rq.request_id}/items/${item.item_id}`, { quantity: Number(edit[item.item_id]) });
      toast.success('Quantity updated — stock adjusted');
      setEdit({});
      onChange();
    } catch (e) { toast.error(e); }
  }
  async function removeLine(item) {
    try {
      await api.del(`/requests/${rq.request_id}/items/${item.item_id}`);
      toast.success(`${item.name} removed — ${item.quantity} returned to stock`);
      onChange();
    } catch (e) { toast.error(e); }
  }
  return (
    <Card title={<span className="flex items-center gap-2"><Package className="h-4 w-4" />Ordered items <Badge tone="teal">request_items</Badge></span>} padded={false}>
      {rq.items.length === 0 ? <Empty title="No line items left" /> : (
        <table className="table-base">
          <thead><tr><th>Item</th><th className="text-right">Qty</th><th className="text-right">Unit cost</th><th className="text-right">Line total</th>{canEdit && <th />}</tr></thead>
          <tbody>
            {rq.items.map((i) => (
              <tr key={i.item_id}>
                <td>{i.name}<div className="text-xs text-muted">{i.unit} · {i.stock_quantity} left in stock</div></td>
                <td className="text-right">
                  {edit[i.item_id] !== undefined ? (
                    <input type="number" min={1} className="input w-20 text-right" value={edit[i.item_id]} onChange={(e) => setEdit({ [i.item_id]: e.target.value })} />
                  ) : <span className="tnum">{i.quantity}</span>}
                </td>
                <td className="text-right tnum">{money(i.unit_cost)}</td>
                <td className="text-right tnum">{money(i.line_total)}</td>
                {canEdit && (
                  <td className="whitespace-nowrap text-right">
                    {edit[i.item_id] !== undefined ? (
                      <>
                        <Button size="sm" icon={Save} onClick={() => save(i)}>Save</Button>
                        <Button size="sm" variant="ghost" icon={X} onClick={() => setEdit({})} />
                      </>
                    ) : (
                      <>
                        <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setEdit({ [i.item_id]: i.quantity })} />
                        <Button size="sm" variant="ghost" icon={Trash2} onClick={() => removeLine(i)} />
                      </>
                    )}
                  </td>
                )}
              </tr>
            ))}
            <tr><td colSpan={3} className="text-right font-medium">Total</td><td className="text-right tnum font-semibold">{money(total)}</td>{canEdit && <td />}</tr>
          </tbody>
        </table>
      )}
    </Card>
  );
}

function Comments({ requestId, comments, reload }) {
  const { user, isStaff } = useAuth();
  const toast = useToast();
  const [body, setBody] = useState('');
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(null);

  async function post(e) {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    const fd = new FormData();
    fd.append('body', body);
    files.forEach((f) => fd.append('files', f));
    try {
      await api.post(`/requests/${requestId}/comments`, fd);
      setBody(''); setFiles([]); e.target.reset();
      reload();
    } catch (err) { toast.error(err); } finally { setBusy(false); }
  }
  const act = (fn) => async (...a) => { try { await fn(...a); reload(); } catch (e) { toast.error(e); } };
  const saveEdit = act(async () => { await api.patch(`/comments/${editing._id}`, { body: editing.body }); setEditing(null); });
  const del = act((c) => api.del(`/comments/${c._id}`));
  const react = act((c, emoji) => api.post(`/comments/${c._id}/react`, { emoji }));

  return (
    <Card title={<span className="flex items-center gap-2">Discussion <Badge tone="green">MongoDB · request_comments</Badge></span>}>
      {!comments?.length && <p className="mb-4 text-sm text-muted">No comments yet — start the conversation here instead of email.</p>}
      <ol className="space-y-5">
        {comments?.map((c) => {
          const mine = c.userId === user.user_id;
          const counts = c.reactions.reduce((m, r) => ({ ...m, [r.emoji]: (m[r.emoji] || 0) + 1 }), {});
          return (
            <li key={c._id} className="flex gap-3">
              <Avatar name={c.userName || '?'} size={32} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-semibold">{c.userName}</span>
                  <span className="text-xs text-muted">{timeAgo(c.createdAt)}{c.editedAt && ' · edited'}</span>
                  {(mine || isStaff) && editing?._id !== c._id && (
                    <span className="ml-auto flex gap-1">
                      {mine && <button onClick={() => setEditing({ _id: c._id, body: c.body })} className="text-muted hover:text-brand-700"><Pencil className="h-3.5 w-3.5" /></button>}
                      <button onClick={() => del(c)} className="text-muted hover:text-danger"><Trash2 className="h-3.5 w-3.5" /></button>
                    </span>
                  )}
                </div>
                {editing?._id === c._id ? (
                  <div className="mt-1 space-y-2">
                    <textarea className="input" value={editing.body} onChange={(e) => setEditing({ ...editing, body: e.target.value })} />
                    <div className="flex gap-2"><Button size="sm" onClick={saveEdit}>Save</Button><Button size="sm" variant="secondary" onClick={() => setEditing(null)}>Cancel</Button></div>
                  </div>
                ) : <p className="mt-0.5 whitespace-pre-wrap text-sm">{c.body}</p>}
                {c.attachments?.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {c.attachments.map((a) => a.mimeType?.startsWith('image/') ? (
                      <a key={a.path} href={a.path} target="_blank" rel="noreferrer"><img src={a.path} alt={a.name} className="h-24 rounded-md border border-line object-cover" /></a>
                    ) : (
                      <a key={a.path} href={a.path} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 text-xs hover:border-brand-600">
                        <Paperclip className="h-3 w-3" />{a.name}
                      </a>
                    ))}
                  </div>
                )}
                <div className="mt-1.5 flex items-center gap-1">
                  {Object.entries(counts).map(([emoji, n]) => (
                    <button key={emoji} onClick={() => react(c, emoji)} className="rounded-full border border-line px-2 py-0.5 text-xs hover:border-brand-600">{emoji} {n}</button>
                  ))}
                  {['👍', '✅', '👀'].filter((e) => !counts[e]).map((emoji) => (
                    <button key={emoji} onClick={() => react(c, emoji)} className="rounded-full px-1.5 py-0.5 text-xs opacity-0 transition hover:bg-brand-50 group-hover:opacity-100 [li:hover_&]:opacity-60">{emoji}</button>
                  ))}
                  {Object.keys(counts).length === 0 && <SmilePlus className="h-3.5 w-3.5 text-muted/50" />}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
      <form onSubmit={post} className="mt-6 border-t border-line pt-4">
        <textarea className="input min-h-20" placeholder="Write an update, ask a question…" value={body} onChange={(e) => setBody(e.target.value)} />
        <div className="mt-2 flex items-center justify-between gap-2">
          <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-muted hover:text-brand-700">
            <Paperclip className="h-4 w-4" />
            {files.length ? `${files.length} file(s) attached` : 'Attach files (stored locally)'}
            <input type="file" multiple className="hidden" onChange={(e) => setFiles([...e.target.files])} />
          </label>
          <Button type="submit" icon={Send} loading={busy}>Comment</Button>
        </div>
      </form>
    </Card>
  );
}
