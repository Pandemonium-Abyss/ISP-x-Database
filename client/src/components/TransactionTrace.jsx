import { CheckCircle2, XCircle, Undo2, Database, Leaf } from 'lucide-react';
import { cx } from './ui.jsx';

/** Visualises the step-by-step trace the server returns for every transaction. */
export default function TransactionTrace({ result }) {
  if (!result) return null;
  const { ok, error, trace = [], stockBefore, stockAfter } = result;
  const after = Object.fromEntries((stockAfter || []).map((s) => [s.consumable_id, s.stock_quantity]));
  return (
    <div className={cx('card overflow-hidden', ok ? 'border-success/40' : 'border-danger/40')}>
      <div className={cx('flex items-center gap-2 px-4 py-3 text-sm font-semibold', ok ? 'bg-emerald-50 text-success' : 'bg-red-50 text-danger')}>
        {ok ? <CheckCircle2 className="h-4 w-4" /> : <Undo2 className="h-4 w-4" />}
        {ok ? 'Transaction committed in MySQL and MongoDB' : 'Transaction rolled back — no partial data was saved'}
      </div>
      {error && <div className="border-b border-line px-4 py-2 text-sm text-danger">{error}</div>}
      <ol className="divide-y divide-line/70 font-mono text-xs">
        {trace.map((t, i) => {
          const bad = t.ok === false || /ROLLBACK|abort/i.test(t.step);
          const commit = /COMMIT|commitTransaction/.test(t.step);
          return (
            <li key={i} className={cx('flex items-start gap-3 px-4 py-1.5', bad && 'bg-red-50/60 text-danger', commit && 'bg-emerald-50/60 text-success')}>
              <span className="w-5 shrink-0 text-right text-muted">{i + 1}</span>
              {t.db === 'mysql' ? <Database className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-700" /> : <Leaf className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-700" />}
              <span className="w-14 shrink-0 uppercase text-muted">{t.db === 'mysql' ? 'mysql' : 'mongo'}</span>
              <span className="flex-1">{t.step}{t.detail && <span className="text-muted"> — {t.detail}</span>}</span>
              {bad ? <XCircle className="h-3.5 w-3.5 shrink-0" /> : commit ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> : null}
            </li>
          );
        })}
      </ol>
      {stockBefore?.length > 0 && (
        <div className="border-t border-line px-4 py-3">
          <div className="label">Stock in MySQL — before → after</div>
          <table className="w-full text-sm">
            <tbody>
              {stockBefore.map((s) => (
                <tr key={s.consumable_id}>
                  <td className="py-0.5">{s.name}</td>
                  <td className="py-0.5 text-right font-mono">{s.stock_quantity}</td>
                  <td className="w-8 text-center text-muted">→</td>
                  <td className={cx('py-0.5 text-right font-mono font-semibold', after[s.consumable_id] !== s.stock_quantity ? 'text-brand-700' : 'text-muted')}>
                    {after[s.consumable_id]}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
