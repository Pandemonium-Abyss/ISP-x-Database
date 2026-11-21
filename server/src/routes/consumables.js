import { Router } from 'express';
import { query } from '../config/mysql.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { ah, HttpError, requireFields, pick } from '../utils/http.js';
import { logActivity } from '../services/activity.js';

const r = Router();
r.use(requireAuth);

r.get('/', ah(async (req, res) => {
  const { q, low } = req.query;
  const where = [];
  const params = [];
  if (q) { where.push('c.name LIKE ?'); params.push(`%${q}%`); }
  if (low === '1') where.push('c.stock_quantity <= c.reorder_level');
  res.json(await query(
    `SELECT c.*, (c.stock_quantity <= c.reorder_level) AS is_low,
            COALESCE((SELECT SUM(i.quantity) FROM request_items i
                        JOIN requests rq ON rq.request_id = i.request_id
                       WHERE i.consumable_id = c.consumable_id
                         AND rq.created_at > UTC_TIMESTAMP() - INTERVAL 30 DAY), 0) AS used_30d
       FROM consumables c ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY c.name`,
    params
  ));
}));

const FIELDS = ['name', 'unit', 'stock_quantity', 'reorder_level', 'unit_cost'];

r.post('/', requireRole('staff', 'admin'), ah(async (req, res) => {
  requireFields(req.body, ['name', 'unit']);
  const data = pick(req.body, FIELDS);
  const result = await query('INSERT INTO consumables SET ?', [data]);
  await logActivity(req, 'consumable.create', { type: 'consumable', id: result.insertId }, data);
  const [row] = await query('SELECT * FROM consumables WHERE consumable_id = ?', [result.insertId]);
  res.status(201).json(row);
}));

r.patch('/:id', requireRole('staff', 'admin'), ah(async (req, res) => {
  const [old] = await query('SELECT * FROM consumables WHERE consumable_id = ?', [req.params.id]);
  if (!old) throw new HttpError(404, 'Consumable not found');
  const data = pick(req.body, FIELDS);
  if (!Object.keys(data).length) throw new HttpError(400, 'Nothing to update');
  await query('UPDATE consumables SET ? WHERE consumable_id = ?', [data, req.params.id]);
  const changes = Object.fromEntries(Object.keys(data).map((k) => [k, { from: old[k], to: data[k] }]));
  await logActivity(req, 'consumable.update', { type: 'consumable', id: Number(req.params.id) }, { name: old.name, changes });
  const [row] = await query('SELECT * FROM consumables WHERE consumable_id = ?', [req.params.id]);
  res.json(row);
}));

r.delete('/:id', requireRole('staff', 'admin'), ah(async (req, res) => {
  const [old] = await query('SELECT * FROM consumables WHERE consumable_id = ?', [req.params.id]);
  if (!old) throw new HttpError(404, 'Consumable not found');
  await query('DELETE FROM consumables WHERE consumable_id = ?', [req.params.id]);
  await logActivity(req, 'consumable.delete', { type: 'consumable', id: Number(req.params.id) }, { name: old.name });
  res.json({ ok: true });
}));

export default r;
