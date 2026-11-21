import { useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Plus, ShoppingCart, Pencil, Trash2, Search, Save, FlaskConical } from 'lucide-react';
import { api, qs } from '../api/client.js';
import { useFetch } from '../lib/useFetch.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../components/Toast.jsx';
import { Badge, Button, Card, Field, Modal, PageHeader, Spinner, Empty, Tabs, cx } from '../components/ui.jsx';
import { money } from '../lib/format.js';

export default function Consumables() {
  const { isStaff, refreshBadges, badges } = useAuth();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const low = params.get('low') === '1';
  const [q, setQ] = useState('');
  const { data, loading, reload } = useFetch(`/consumables${qs({ low: low ? '1' : '', q })}`);
  const [qty, setQty] = useState({});
  const [editing, setEditing] = useState(null);

  async function addToCart(c) {
    try {
      await api.post('/cart/items', { consumableId: c.consumable_id, quantity: Number(qty[c.consumable_id] || 1) });
      toast.success(`Added ${qty[c.consumable_id] || 1} × ${c.name} to cart`);
      setQty({ ...qty, [c.consumable_id]: '' });
      refreshBadges();
    } catch (e) { toast.error(e); }
  }
  async function del(c) {
    if (!window.confirm(`Delete ${c.name}?`)) return;
    try { await api.del(`/consumables/${c.consumable_id}`); toast.success('Deleted'); reload(); } catch (e) { toast.error(e); }
  }

  return (
    <>
      <PageHeader title="Consumables" subtitle="Live inventory from MySQL. Add what you need to your cart — stock is deducted atomically when you check out."
        actions={<>
          {isStaff && <Button variant="secondary" icon={Plus} onClick={() => setEditing('new')}>Add item</Button>}
          <Link to="/cart"><Button icon={ShoppingCart}>Cart {badges.cart > 0 && `(${badges.cart})`}</Button></Link>
        </>} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Tabs value={low ? 'low' : 'all'} onChange={(v) => setParams(v === 'low' ? { low: '1' } : {})} tabs={[['all', 'All items'], ['low', 'Low stock']]} />
        <div className="relative ml-auto">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted" />
          <input className="input w-60 pl-8" placeholder="Search…" onKeyDown={(e) => e.key === 'Enter' && setQ(e.target.value)} />
        </div>
      </div>
      <Card padded={false}>
        {loading ? <Spinner /> : !data?.length ? <Empty icon={FlaskConical} title="Nothing here" /> : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead><tr><th>Item</th><th>Unit</th><th className="text-right">In stock</th><th className="text-right">Reorder at</th><th className="text-right">Used (30 d)</th><th className="text-right">Unit cost</th><th className="w-48">Add to cart</th>{isStaff && <th />}</tr></thead>
              <tbody>
                {data.map((c) => (
                  <tr key={c.consumable_id}>
                    <td className="font-medium">{c.name}</td>
                    <td className="text-muted">{c.unit}</td>
                    <td className="text-right">
                      <span className={cx('tnum font-semibold', c.stock_quantity === 0 ? 'text-danger' : c.is_low ? 'text-tape-600' : '')}>{c.stock_quantity}</span>
                      {c.is_low ? <Badge tone={c.stock_quantity === 0 ? 'red' : 'gold'} className="ml-2">{c.stock_quantity === 0 ? 'Out' : 'Low'}</Badge> : null}
                    </td>
                    <td className="text-right tnum text-muted">{c.reorder_level}</td>
                    <td className="text-right tnum text-muted">{c.used_30d}</td>
                    <td className="text-right tnum">{money(c.unit_cost)}</td>
                    <td>
                      <div className="flex gap-1.5">
                        <input type="number" min={1} className="input w-16 py-1.5 text-right" placeholder="1" value={qty[c.consumable_id] || ''}
                          onChange={(e) => setQty({ ...qty, [c.consumable_id]: e.target.value })} />
                        <Button size="sm" variant="secondary" icon={ShoppingCart} onClick={() => addToCart(c)}>Add</Button>
                      </div>
                    </td>
                    {isStaff && (
                      <td className="whitespace-nowrap text-right">
                        <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setEditing(c)} />
                        <Button size="sm" variant="ghost" icon={Trash2} onClick={() => del(c)} />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {editing && <ConsumableForm initial={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={reload} />}
    </>
  );
}

function ConsumableForm({ initial, onClose, onSaved }) {
  const toast = useToast();
  const [f, setF] = useState({
    name: initial?.name || '', unit: initial?.unit || '', stock_quantity: initial?.stock_quantity ?? 0,
    reorder_level: initial?.reorder_level ?? 0, unit_cost: initial?.unit_cost ?? 0,
  });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function submit(e) {
    e.preventDefault();
    try {
      if (initial) await api.patch(`/consumables/${initial.consumable_id}`, f);
      else await api.post('/consumables', f);
      toast.success(initial ? 'Inventory updated' : 'Item added');
      onSaved(); onClose();
    } catch (err) { toast.error(err); }
  }
  return (
    <Modal open onClose={onClose} title={initial ? `Edit ${initial.name}` : 'Add consumable'}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Name"><input className="input" required value={f.name} onChange={set('name')} /></Field>
        <Field label="Unit"><input className="input" required value={f.unit} onChange={set('unit')} placeholder="box of 100" /></Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="In stock"><input type="number" min={0} className="input" value={f.stock_quantity} onChange={set('stock_quantity')} /></Field>
          <Field label="Reorder at"><input type="number" min={0} className="input" value={f.reorder_level} onChange={set('reorder_level')} /></Field>
          <Field label="Unit cost"><input type="number" min={0} step="0.01" className="input" value={f.unit_cost} onChange={set('unit_cost')} /></Field>
        </div>
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" icon={Save}>Save</Button></div>
      </form>
    </Modal>
  );
}
