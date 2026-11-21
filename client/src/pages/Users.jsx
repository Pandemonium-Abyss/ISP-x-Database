import { useState } from 'react';
import { UserPlus, Trash2, Save } from 'lucide-react';
import { api } from '../api/client.js';
import { useFetch } from '../lib/useFetch.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../components/Toast.jsx';
import { Avatar, Badge, Button, Card, Field, Modal, PageHeader, Spinner } from '../components/ui.jsx';
import { fmtDate } from '../lib/format.js';

export default function UsersPage() {
  const { isAdmin, user: me } = useAuth();
  const toast = useToast();
  const { data, loading, reload } = useFetch('/users');
  const [adding, setAdding] = useState(false);
  const act = async (fn, msg) => { try { await fn(); toast.success(msg); reload(); } catch (e) { toast.error(e); } };

  return (
    <>
      <PageHeader title="Lab members" subtitle="Accounts live in the MySQL users table. Request counts come from joined subqueries."
        actions={isAdmin && <Button icon={UserPlus} onClick={() => setAdding(true)}>Add member</Button>} />
      <Card padded={false}>
        {loading ? <Spinner /> : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead><tr><th>Member</th><th>Email</th><th>Role</th><th className="text-right">Requests filed</th><th className="text-right">Open assigned</th><th>Joined</th>{isAdmin && <th />}</tr></thead>
              <tbody>
                {data.map((u) => (
                  <tr key={u.user_id}>
                    <td><span className="flex items-center gap-2.5"><Avatar name={u.full_name} src={u.avatar_path} size={30} /><span className="font-medium">{u.full_name}</span></span></td>
                    <td className="text-muted">{u.email}</td>
                    <td>
                      {isAdmin && u.user_id !== me.user_id ? (
                        <select className="input w-auto py-1" value={u.role} onChange={(e) => act(() => api.patch(`/users/${u.user_id}`, { role: e.target.value }), `${u.full_name} is now ${e.target.value}`)}>
                          <option value="member">member</option><option value="staff">staff</option><option value="admin">admin</option>
                        </select>
                      ) : <Badge tone={u.role === 'admin' ? 'red' : u.role === 'staff' ? 'gold' : 'teal'}>{u.role}</Badge>}
                    </td>
                    <td className="text-right tnum">{u.requests_filed}</td>
                    <td className="text-right tnum">{u.open_assigned}</td>
                    <td className="text-xs text-muted">{fmtDate(u.created_at)}</td>
                    {isAdmin && (
                      <td className="text-right">
                        {u.user_id !== me.user_id && <Button size="sm" variant="ghost" icon={Trash2}
                          onClick={() => window.confirm(`Delete ${u.full_name}? Their requests and bookings are removed by FK cascade.`) && act(() => api.del(`/users/${u.user_id}`), 'Member deleted')} />}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {adding && <AddUser onClose={() => setAdding(false)} onSaved={reload} />}
    </>
  );
}

function AddUser({ onClose, onSaved }) {
  const toast = useToast();
  const [f, setF] = useState({ full_name: '', email: '', password: '', role: 'member' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function submit(e) {
    e.preventDefault();
    try { await api.post('/users', f); toast.success('Member added'); onSaved(); onClose(); } catch (err) { toast.error(err); }
  }
  return (
    <Modal open onClose={onClose} title="Add lab member">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Full name"><input className="input" required value={f.full_name} onChange={set('full_name')} /></Field>
        <Field label="Email"><input type="email" className="input" required value={f.email} onChange={set('email')} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Temporary password"><input className="input" required minLength={6} value={f.password} onChange={set('password')} /></Field>
          <Field label="Role"><select className="input" value={f.role} onChange={set('role')}><option>member</option><option>staff</option><option>admin</option></select></Field>
        </div>
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" icon={Save}>Add</Button></div>
      </form>
    </Modal>
  );
}
