import { pool, withSqlTransaction } from '../../config/mysql.js';
import { withMongoTransaction } from '../../config/mongo.js';
import { ConsumableCart } from '../../models/index.js';
import { logActivity, notify, staffIds } from '../activity.js';
import { HttpError, ENUMS } from '../../utils/http.js';

async function stockSnapshot(ids) {
  if (!ids.length) return [];
  const [rows] = await pool.query(
    'SELECT consumable_id, name, stock_quantity FROM consumables WHERE consumable_id IN (?) ORDER BY consumable_id',
    [ids]
  );
  return rows;
}

/**
 * Hybrid order workflow (cart in MongoDB -> order in MySQL -> side effects in MongoDB).
 *
 * Phase 1 — MySQL transaction (atomic):
 *   1. lock consumable rows (SELECT ... FOR UPDATE)
 *   2. verify stock for every line
 *   3. deduct stock
 *   4. insert request header (type = consumables)
 *   5. insert request_items lines
 *   any error -> ROLLBACK, nothing persisted.
 *
 * Phase 2 — MongoDB transaction (atomic):
 *   6. clear the user's consumable_cart
 *   7. write activity_logs entry
 *   8. write notifications (requester + staff)
 *   any error -> abortTransaction AND a compensating MySQL transaction
 *   (restore stock, delete request) so neither database keeps a half-finished order.
 *
 * `simulateFailure`: 'after_stock_deduct' | 'after_sql_commit' (demo of rollback paths).
 */
export async function submitConsumablesOrder({ req, user, title, priority = 'medium', description, simulateFailure }) {
  const trace = [];
  const cart = await ConsumableCart.findOne({ userId: user.user_id }).lean();
  if (!cart || cart.items.length === 0) throw new HttpError(400, 'Your cart is empty');
  if (!ENUMS.priority.includes(priority)) throw new HttpError(400, 'Invalid priority');

  const ids = cart.items.map((i) => i.consumableId);
  const stockBefore = await stockSnapshot(ids);
  trace.push({ db: 'mongodb', step: `Read cart: ${cart.items.length} line(s)` });

  // ---------------- Phase 1: MySQL ----------------
  let order;
  try {
    order = await withSqlTransaction(async (conn) => {
      const [rows] = await conn.query(
        `SELECT consumable_id, name, unit, stock_quantity, unit_cost
           FROM consumables WHERE consumable_id IN (?) ORDER BY consumable_id FOR UPDATE`,
        [ids]
      );
      trace.push({ db: 'mysql', step: `SELECT ... FOR UPDATE — locked ${rows.length} consumable row(s)` });
      const byId = new Map(rows.map((r) => [r.consumable_id, r]));

      for (const item of cart.items) {
        const row = byId.get(item.consumableId);
        if (!row) throw new HttpError(404, `Consumable #${item.consumableId} no longer exists`);
        if (row.stock_quantity < item.quantity) {
          throw new HttpError(
            409,
            `Insufficient stock for "${row.name}": requested ${item.quantity}, available ${row.stock_quantity}`
          );
        }
      }
      trace.push({ db: 'mysql', step: 'Verified stock availability for all lines' });

      for (const item of cart.items) {
        await conn.query('UPDATE consumables SET stock_quantity = stock_quantity - ? WHERE consumable_id = ?', [
          item.quantity,
          item.consumableId,
        ]);
        trace.push({ db: 'mysql', step: `UPDATE consumables: -${item.quantity} ${byId.get(item.consumableId).name}` });
      }

      if (simulateFailure === 'after_stock_deduct') {
        throw new HttpError(500, 'Simulated failure after stock deduction (before the request was saved)');
      }

      const lines = cart.items.map((i) => ({ ...i, unit_cost: byId.get(i.consumableId).unit_cost }));
      const total = lines.reduce((s, l) => s + l.quantity * l.unit_cost, 0);
      const summary = lines.map((l) => `${l.quantity} × ${byId.get(l.consumableId).name}`).join(', ');

      const [ins] = await conn.query(
        `INSERT INTO requests (requester_id, type, title, description, priority, status)
         VALUES (?, 'consumables', ?, ?, ?, 'open')`,
        [user.user_id, title || `Consumables order (${lines.length} item${lines.length > 1 ? 's' : ''})`,
         description || summary, priority]
      );
      trace.push({ db: 'mysql', step: `INSERT requests → request_id ${ins.insertId}` });

      await conn.query('INSERT INTO request_items (request_id, consumable_id, quantity, unit_cost) VALUES ?', [
        lines.map((l) => [ins.insertId, l.consumableId, l.quantity, l.unit_cost]),
      ]);
      trace.push({ db: 'mysql', step: `INSERT request_items — ${lines.length} line(s)` });

      return { requestId: ins.insertId, total: Number(total.toFixed(2)), lines };
    }, trace);
  } catch (err) {
    err.trace = trace;
    err.stockBefore = stockBefore;
    err.stockAfter = await stockSnapshot(ids);
    err.rolledBack = true;
    throw err;
  }

  // ---------------- Phase 2: MongoDB ----------------
  try {
    const staff = await staffIds();
    await withMongoTransaction(async (session) => {
      await ConsumableCart.updateOne(
        { userId: user.user_id },
        { $set: { items: [], updatedAt: new Date() } },
        { session }
      );
      trace.push({ db: 'mongodb', step: 'consumable_carts: cleared cart' });

      await logActivity(req, 'order.submit', { type: 'request', id: order.requestId },
        { total: order.total, items: order.lines.map((l) => ({ consumableId: l.consumableId, quantity: l.quantity })) },
        session);
      trace.push({ db: 'mongodb', step: 'activity_logs: inserted audit entry' });

      if (simulateFailure === 'after_sql_commit') {
        throw new HttpError(500, 'Simulated failure in MongoDB phase (after the MySQL commit)');
      }

      await notify(user.user_id, {
        type: 'order', title: 'Consumables order placed',
        message: `Request #${order.requestId} created — total ${order.total.toFixed(2)}`,
        link: `/requests/${order.requestId}`,
      }, session);
      await notify(staff.filter((id) => id !== user.user_id), {
        type: 'order', title: 'New consumables order',
        message: `${user.full_name} ordered ${order.lines.length} item(s) (#${order.requestId})`,
        link: `/requests/${order.requestId}`,
      }, session);
      trace.push({ db: 'mongodb', step: 'notifications: inserted for requester and staff' });
    }, trace);
  } catch (err) {
    // Compensating transaction: undo the committed MySQL work.
    trace.push({ db: 'mysql', step: 'COMPENSATE — MongoDB phase failed, undoing committed SQL order', ok: false });
    await withSqlTransaction(async (conn) => {
      for (const l of order.lines) {
        await conn.query('UPDATE consumables SET stock_quantity = stock_quantity + ? WHERE consumable_id = ?', [
          l.quantity, l.consumableId,
        ]);
      }
      trace.push({ db: 'mysql', step: 'UPDATE consumables: stock restored' });
      await conn.query('DELETE FROM requests WHERE request_id = ?', [order.requestId]);
      trace.push({ db: 'mysql', step: `DELETE requests #${order.requestId} (request_items cascade)` });
    }, trace);
    err.trace = trace;
    err.stockBefore = stockBefore;
    err.stockAfter = await stockSnapshot(ids);
    err.rolledBack = true;
    throw err;
  }

  return { ...order, trace, stockBefore, stockAfter: await stockSnapshot(ids) };
}
