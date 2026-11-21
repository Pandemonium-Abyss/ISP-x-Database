import { useState } from 'react';
import { Camera, Save, KeyRound } from 'lucide-react';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../components/Toast.jsx';
import { Avatar, Badge, Button, Card, Field, PageHeader } from '../components/ui.jsx';
import { fmtDate } from '../lib/format.js';

export default function Profile() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const [f, setF] = useState({ full_name: user.full_name, email: user.email });
  const [pw, setPw] = useState({ current_password: '', new_password: '' });

  async function saveProfile(e) {
    e.preventDefault();
    try { setUser(await api.patch('/users/me', f)); toast.success('Profile updated'); } catch (err) { toast.error(err); }
  }
  async function savePassword(e) {
    e.preventDefault();
    try { await api.patch('/users/me', pw); setPw({ current_password: '', new_password: '' }); toast.success('Password changed'); } catch (err) { toast.error(err); }
  }
  async function upload(e) {
    const file = e.target.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('avatar', file);
    try {
      const r = await api.post('/users/me/avatar', fd);
      setUser({ ...user, avatar_path: r.avatar_path });
      toast.success('Avatar updated (saved to uploads/avatars on the server)');
    } catch (err) { toast.error(err); }
  }

  return (
    <>
      <PageHeader title="Your profile" />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <div className="flex flex-col items-center text-center">
            <label className="group relative cursor-pointer">
              <Avatar name={user.full_name} src={user.avatar_path} size={112} />
              <span className="absolute inset-0 flex items-center justify-center rounded-full bg-brand-900/50 text-white opacity-0 transition group-hover:opacity-100"><Camera className="h-6 w-6" /></span>
              <input type="file" accept="image/*" className="hidden" onChange={upload} />
            </label>
            <h2 className="mt-4 font-display text-xl font-semibold">{user.full_name}</h2>
            <p className="text-sm text-muted">{user.email}</p>
            <Badge tone="teal" className="mt-2 capitalize">{user.role}</Badge>
            <p className="mt-3 text-xs text-muted">Member since {fmtDate(user.created_at)}</p>
          </div>
        </Card>
        <div className="space-y-6 lg:col-span-2">
          <Card title="Account details">
            <form onSubmit={saveProfile} className="space-y-4">
              <Field label="Full name"><input className="input" value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></Field>
              <Field label="Email"><input type="email" className="input" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
              <div className="flex justify-end"><Button type="submit" icon={Save}>Save</Button></div>
            </form>
          </Card>
          <Card title="Change password">
            <form onSubmit={savePassword} className="grid gap-4 sm:grid-cols-2">
              <Field label="Current password"><input type="password" className="input" required value={pw.current_password} onChange={(e) => setPw({ ...pw, current_password: e.target.value })} /></Field>
              <Field label="New password"><input type="password" className="input" required minLength={6} value={pw.new_password} onChange={(e) => setPw({ ...pw, new_password: e.target.value })} /></Field>
              <div className="flex justify-end sm:col-span-2"><Button type="submit" variant="secondary" icon={KeyRound}>Update password</Button></div>
            </form>
          </Card>
        </div>
      </div>
    </>
  );
}
