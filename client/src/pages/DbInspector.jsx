import { RefreshCw, Database, Leaf } from 'lucide-react';
import { useFetch } from '../lib/useFetch.js';
import { Button, Card, PageHeader, Spinner, cx } from '../components/ui.jsx';
import { fmtDateTime } from '../lib/format.js';

/** Live counts from both engines — used to prove DB state before/after a transaction. */
export default function DbInspector() {
  const { data, loading, reload } = useFetch('/db-state');
  return (
    <>
      <PageHeader title="Database inspector" subtitle="Live row and document counts from both engines. Snapshot before and after a checkout to prove a transaction committed — or that a rollback left nothing behind."
        actions={<Button variant="secondary" icon={RefreshCw} onClick={reload} loading={loading}>Refresh snapshot</Button>} />
      {!data ? <Spinner /> : (
        <>
          <p className="mb-4 font-mono text-xs text-muted">snapshot taken {fmtDateTime(data.at)} · {new Date(data.at).toLocaleTimeString()}</p>
          <div className="grid gap-6 lg:grid-cols-3">
            <Counts title="MySQL 8 · tables" icon={Database} tone="text-sky-700" counts={data.mysql} />
            <Counts title="MongoDB 7 · collections" icon={Leaf} tone="text-emerald-700" counts={data.mongodb} />
            <Card title="consumables.stock_quantity" padded={false}>
              <table className="table-base">
                <tbody>{data.stock.map((s) => (
                  <tr key={s.consumable_id}><td>{s.name}</td><td className="text-right font-mono font-semibold">{s.stock_quantity}</td></tr>
                ))}</tbody>
              </table>
            </Card>
          </div>
        </>
      )}
    </>
  );
}

function Counts({ title, icon: Icon, tone, counts }) {
  return (
    <Card title={<span className="flex items-center gap-2"><Icon className={cx('h-4 w-4', tone)} />{title}</span>} padded={false}>
      <table className="table-base">
        <tbody>{Object.entries(counts).map(([k, v]) => (
          <tr key={k}><td className="font-mono text-sm">{k}</td><td className="text-right font-mono text-lg font-semibold">{v}</td></tr>
        ))}</tbody>
      </table>
    </Card>
  );
}
