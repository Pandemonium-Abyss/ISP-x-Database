import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ShoppingCart, Trash2, Minus, Plus, CheckCircle, FlaskRound, AlertTriangle } from 'lucide-react';
import { api } from '../api/client.js';
import { useFetch } from '../lib/useFetch.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../components/Toast.jsx';
import { Badge, Button, Card, Field, PageHeader, Spinner, Empty } from '../components/ui.jsx';
import TransactionTrace from '../components/TransactionTrace.jsx';
import { PRIORITIES, label, money } from '../lib/format.js';

export default function Cart() {
  const { isAdmin, refreshBadges } = useAuth();
  const toast = useToast();
  const { data: cart, loading, reload, setData } = useFetch('/cart');
  const [form, setForm] = useState({ title: '', priority: 'medium', description: '', simulateFailure: '' });
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  const mutate = async (fn) => { try { setData(await fn()); refreshBadges(); } catch (e) { toast.error(e); } };
  const setQty = (i, q) => q >= 1 && mutate(() => api.patch(`/cart/items/${i.consumableId}`, { quantity: q }));

  async function checkout() {
    setBusy(true);
    setResult(null);
    try {
      const r = await api.post('/cart/checkout', { ...form, simulateFailure: form.simulateFailure || undefined });
      setResult({ ok: true, ...r });
      toast.success(`Order placed — request #${r.requestId}`);
    } catch (e) {
      setResult({ ok: false, error: e.message, ...e.data });
    } finally {
      setBusy(false);
      reload();
      refreshBadges();
    }
  }

  if (loading || !cart) return <Spinner />;
  const over = cart.items.filter((i) => i.quantity > i.stock_quantity);

  return (
    <>
      <PageHeader title="Consumables cart" subtitle="Your draft order lives in MongoDB until you check out. Checkout runs one atomic MySQL transaction, then a MongoDB transaction."
        actions={<Link to="/consumables"><Button variant="secondary" icon={Plus}>Add more items</Button></Link>} />
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <Card padded={false} title={<span className="flex items-center gap-2"><ShoppingCart className="h-4 w-4" />Items <Badge tone="green">MongoDB · consumable_carts</Badge></span>}
            action={cart.items.length > 0 && <Button size="sm" variant="ghost" icon={Trash2} onClick={() => mutate(() => api.del('/cart'))}>Clear cart</Button>}>
            {cart.items.length === 0 ? <Empty icon={ShoppingCart} title="Your cart is empty"><Link to="/consumables" className="text-brand-700 underline">Browse inventory</Link></Empty> : (
              <table className="table-base">
                <thead><tr><th>Item</th><th className="text-center">Quantity</th><th className="text-right">In stock</th><th className="text-right">Subtotal</th><th /></tr></thead>
                <tbody>
                  {cart.items.map((i) => (
                    <tr key={i.consumableId}>
                      <td><div className="font-medium">{i.name}</div><div className="text-xs text-muted">{i.unit} · {money(i.unit_cost)} each</div></td>
                      <td>
                        <div className="flex items-center justify-center gap-1">
                          <Button size="sm" variant="ghost" icon={Minus} onClick={() => setQty(i, i.quantity - 1)} />
                          <input type="number" min={1} className="input w-16 py-1 text-center" value={i.quantity} onChange={(e) => setQty(i, Number(e.target.value))} />
                          <Button size="sm" variant="ghost" icon={Plus} onClick={() => setQty(i, i.quantity + 1)} />
                        </div>
                      </td>
                      <td className={`text-right tnum ${i.quantity > i.stock_quantity ? 'font-semibold text-danger' : 'text-muted'}`}>{i.stock_quantity}</td>
                      <td className="text-right tnum">{money(i.quantity * i.unit_cost)}</td>
                      <td className="text-right"><Button size="sm" variant="ghost" icon={Trash2} onClick={() => mutate(() => api.del(`/cart/items/${i.consumableId}`))} /></td>
                    </tr>
                  ))}
                  <tr><td colSpan={3} className="text-right font-medium">Estimated total</td><td className="text-right tnum font-semibold">{money(cart.total)}</td><td /></tr>
                </tbody>
              </table>
            )}
          </Card>
          {over.length > 0 && (
            <div className="flex items-start gap-2 rounded-md border border-tape-100 bg-tape-50 px-4 py-3 text-sm text-tape-600">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{over.map((i) => i.name).join(', ')} {over.length > 1 ? 'exceed' : 'exceeds'} current stock — checkout will fail and the whole transaction will be rolled back.</span>
            </div>
          )}
          <TransactionTrace result={result} />
        </div>

        <div className="lg:col-span-2">
          <Card title="Checkout">
            <div className="space-y-4">
              <Field label="Order title (optional)"><input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Consumables for PCR week" /></Field>
              <Field label="Priority">
                <select className="input" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                  {PRIORITIES.map((p) => <option key={p} value={p}>{label(p)}</option>)}
                </select>
              </Field>
              <Field label="Note for staff"><textarea className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
              {isAdmin && (
                <Field label={<span className="inline-flex items-center gap-1"><FlaskRound className="h-3 w-3" />Rollback demo (admin only)</span>}
                  hint="Forces an error at a chosen step to prove nothing is partially saved.">
                  <select className="input" value={form.simulateFailure} onChange={(e) => setForm({ ...form, simulateFailure: e.target.value })}>
                    <option value="">No simulated failure</option>
                    <option value="after_stock_deduct">Fail after stock deduction → MySQL ROLLBACK</option>
                    <option value="after_sql_commit">Fail in MongoDB phase → abort + compensating SQL</option>
                  </select>
                </Field>
              )}
              <Button size="lg" className="w-full" icon={CheckCircle} loading={busy} disabled={!cart.items.length} onClick={checkout}>
                Place order · {money(cart.total)}
              </Button>
              <ol className="space-y-1 rounded-md bg-brand-50/60 p-3 text-xs text-ink">
                <li><b>MySQL</b> BEGIN → lock rows FOR UPDATE → verify stock → deduct → insert request + items → COMMIT</li>
                <li><b>MongoDB</b> startTransaction → clear cart → audit log → notifications → commit</li>
                <li className="text-muted">Any failure → ROLLBACK / abort (+ compensation if SQL already committed)</li>
              </ol>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
