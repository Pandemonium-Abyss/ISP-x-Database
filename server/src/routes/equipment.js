import { Router } from 'express';
import { query } from '../config/mysql.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { equipmentUpload, publicPath, removeLocalFile } from '../middleware/upload.js';
import { ah, HttpError, requireFields, assertEnum, ENUMS, pick } from '../utils/http.js';
import { logActivity } from '../services/activity.js';
import { MaintenanceLog } from '../models/index.js';

const r = Router();
r.use(requireAuth);

r.get('/', ah(async (req, res) => {
  const { status, category, q } = req.query;
  const where = [];
  const params = [];
  if (status) { where.push('e.status = ?'); params.push(status); }
  if (category) { where.push('e.category = ?'); params.push(category); }
  if (q) { where.push('(e.name LIKE ? OR e.location LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
  const rows = await query(
    `SELECT e.*,
            (SELECT COUNT(*) FROM equipment_bookings b
              WHERE b.equipment_id = e.equipment_id AND b.status = 'booked' AND b.end_time > UTC_TIMESTAMP()) AS upcoming_bookings,
            (SELECT COUNT(*) FROM requests rq
              WHERE rq.equipment_id = e.equipment_id AND rq.status NOT IN ('resolved','closed')) AS open_requests
       FROM equipment e ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY e.name`,
    params
  );
  res.json(rows);
}));

r.get('/:id', ah(async (req, res) => {
  const [eq] = await query('SELECT * FROM equipment WHERE equipment_id = ?', [req.params.id]);
  if (!eq) throw new HttpError(404, 'Equipment not found');
  const bookings = await query(
    `SELECT b.*, u.full_name AS user_name FROM equipment_bookings b
       JOIN users u ON u.user_id = b.user_id
      WHERE b.equipment_id = ? ORDER BY b.start_time DESC LIMIT 50`,
    [req.params.id]
  );
  const requests = await query(
    `SELECT rq.request_id, rq.title, rq.status, rq.priority, rq.type, rq.created_at, u.full_name AS requester_name
       FROM requests rq JOIN users u ON u.user_id = rq.requester_id
      WHERE rq.equipment_id = ? ORDER BY rq.created_at DESC LIMIT 20`,
    [req.params.id]
  );
  const lastMaintenance = await MaintenanceLog.findOne({ equipmentId: Number(req.params.id) }).sort({ performedAt: -1 }).lean();
  res.json({ ...eq, bookings, requests, lastMaintenance });
}));

const FIELDS = ['name', 'category', 'location', 'status', 'description'];

r.post('/', requireRole('staff', 'admin'), equipmentUpload.single('image'), ah(async (req, res) => {
  requireFields(req.body, ['name', 'category', 'location']);
  assertEnum(req.body.status, ENUMS.equipmentStatus, 'status');
  const data = pick(req.body, FIELDS);
  data.image_path = publicPath('equipment', req.file);
  const result = await query('INSERT INTO equipment SET ?', [data]);
  await logActivity(req, 'equipment.create', { type: 'equipment', id: result.insertId }, { name: data.name });
  const [eq] = await query('SELECT * FROM equipment WHERE equipment_id = ?', [result.insertId]);
  res.status(201).json(eq);
}));

r.patch('/:id', requireRole('staff', 'admin'), equipmentUpload.single('image'), ah(async (req, res) => {
  const [old] = await query('SELECT * FROM equipment WHERE equipment_id = ?', [req.params.id]);
  if (!old) throw new HttpError(404, 'Equipment not found');
  assertEnum(req.body.status, ENUMS.equipmentStatus, 'status');
  const data = pick(req.body, FIELDS);
  if (req.file) {
    data.image_path = publicPath('equipment', req.file);
    removeLocalFile(old.image_path);
  }
  if (!Object.keys(data).length) throw new HttpError(400, 'Nothing to update');
  await query('UPDATE equipment SET ? WHERE equipment_id = ?', [data, req.params.id]);
  const changes = Object.fromEntries(Object.keys(data).map((k) => [k, { from: old[k], to: data[k] }]));
  await logActivity(req, 'equipment.update', { type: 'equipment', id: Number(req.params.id) }, { changes });
  const [eq] = await query('SELECT * FROM equipment WHERE equipment_id = ?', [req.params.id]);
  res.json(eq);
}));

r.delete('/:id', requireRole('staff', 'admin'), ah(async (req, res) => {
  const [eq] = await query('SELECT * FROM equipment WHERE equipment_id = ?', [req.params.id]);
  if (!eq) throw new HttpError(404, 'Equipment not found');
  await query('DELETE FROM equipment WHERE equipment_id = ?', [req.params.id]);
  await MaintenanceLog.deleteMany({ equipmentId: Number(req.params.id) });
  removeLocalFile(eq.image_path);
  await logActivity(req, 'equipment.delete', { type: 'equipment', id: Number(req.params.id) }, { name: eq.name });
  res.json({ ok: true });
}));

export default r;
