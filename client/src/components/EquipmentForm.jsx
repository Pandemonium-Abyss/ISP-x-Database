import { useState } from 'react';
import { ImagePlus, Save } from 'lucide-react';
import { api } from '../api/client.js';
import { useToast } from './Toast.jsx';
import { Button, Field, Modal } from './ui.jsx';
import { EQUIPMENT_STATUSES, label } from '../lib/format.js';

export default function EquipmentForm({ open, onClose, initial, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState(null);
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const f = form || {
    name: initial?.name || '', category: initial?.category || '', location: initial?.location || '',
    status: initial?.status || 'available', description: initial?.description || '',
  };
  const set = (k) => (e) => setForm({ ...f, [k]: e.target.value });
  const close = () => { setForm(null); setFile(null); onClose(); };

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    const fd = new FormData();
    Object.entries(f).forEach(([k, v]) => fd.append(k, v));
    if (file) fd.append('image', file);
    try {
      const saved = initial ? await api.patch(`/equipment/${initial.equipment_id}`, fd) : await api.post('/equipment', fd);
      toast.success(initial ? 'Equipment updated' : `${saved.name} added`);
      onSaved?.(saved);
      close();
    } catch (err) { toast.error(err); } finally { setBusy(false); }
  }

  return (
    <Modal open={open} onClose={close} title={initial ? `Edit ${initial.name}` : 'Add equipment'}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Name"><input className="input" required value={f.name} onChange={set('name')} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Category"><input className="input" required value={f.category} onChange={set('category')} placeholder="Microscopy" /></Field>
          <Field label="Location"><input className="input" required value={f.location} onChange={set('location')} placeholder="Room 301" /></Field>
        </div>
        <Field label="Status">
          <select className="input" value={f.status} onChange={set('status')}>
            {EQUIPMENT_STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
          </select>
        </Field>
        <Field label="Description / usage notes"><textarea className="input" value={f.description} onChange={set('description')} /></Field>
        <Field label="Photo" hint="Saved to the server's local uploads/equipment folder">
          <label className="flex cursor-pointer items-center gap-3 rounded-md border border-dashed border-line p-3 hover:border-brand-600">
            {file ? <img src={URL.createObjectURL(file)} className="h-14 w-14 rounded object-cover" alt="" />
              : initial?.image_path ? <img src={initial.image_path} className="h-14 w-14 rounded object-cover" alt="" />
              : <ImagePlus className="h-6 w-6 text-muted" />}
            <span className="text-sm text-muted">{file ? file.name : 'Choose an image (PNG, JPEG, WEBP)'}</span>
            <input type="file" accept="image/*" className="hidden" onChange={(e) => setFile(e.target.files[0])} />
          </label>
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" type="button" onClick={close}>Cancel</Button>
          <Button type="submit" icon={Save} loading={busy}>{initial ? 'Save changes' : 'Add equipment'}</Button>
        </div>
      </form>
    </Modal>
  );
}
