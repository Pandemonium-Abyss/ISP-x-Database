import { Router } from 'express';
import { query } from '../config/mysql.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { attachmentUpload, publicPath, removeLocalFile } from '../middleware/upload.js';
import { ah, HttpError, requireFields } from '../utils/http.js';
import { logActivity } from '../services/activity.js';
import { MaintenanceLog } from '../models/index.js';

const r = Router();
r.use(requireAuth);

/** readings may arrive as JSON string (multipart) or object; numbers are coerced. */
function parseReadings(raw) {
  if (!raw) return {};
  let obj = raw;
  if (typeof raw === 'string') {
    try { obj = JSON.parse(raw); } catch { throw new HttpError(400, 'Readings must be valid JSON'); }
  }
  if (typeof obj !== 'object' || Array.isArray(obj)) throw new HttpError(400, 'Readings must be a key/value object');
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, v !== '' && !Number.isNaN(Number(v)) ? Number(v) : v]));
}

r.get('/', ah(async (req, res) => {
  const filter = req.query.equipmentId ? { equipmentId: Number(req.query.equipmentId) } : {};
  const logs = await MaintenanceLog.find(filter).sort({ performedAt: -1 }).limit(200).lean();
  if (!req.query.equipmentId && logs.length) {
    const names = await query('SELECT equipment_id, name FROM equipment WHERE equipment_id IN (?)', [[...new Set(logs.map((l) => l.equipmentId))]]);
    const byId = Object.fromEntries(names.map((n) => [n.equipment_id, n.name]));
    return res.json(logs.map((l) => ({ ...l, equipmentName: byId[l.equipmentId] })));
  }
  res.json(logs);
}));

r.post('/', requireRole('staff', 'admin'), attachmentUpload.array('files', 5), ah(async (req, res) => {
  requireFields(req.body, ['equipmentId', 'kind']);
  const [eq] = await query('SELECT equipment_id, name FROM equipment WHERE equipment_id = ?', [req.body.equipmentId]);
  if (!eq) throw new HttpError(404, 'Equipment not found');
  const log = await MaintenanceLog.create({
    equipmentId: eq.equipment_id,
    performedBy: req.user.user_id,
    performedByName: req.user.full_name,
    kind: req.body.kind,
    notes: req.body.notes,
    readings: parseReadings(req.body.readings),
    nextDueAt: req.body.nextDueAt || undefined,
    performedAt: req.body.performedAt || new Date(),
    attachments: (req.files || []).map((f) => ({ path: publicPath('attachments', f), name: f.originalname })),
  });
  if (req.body.setStatus) {
    await query('UPDATE equipment SET status = ? WHERE equipment_id = ?', [req.body.setStatus, eq.equipment_id]);
  }
  await logActivity(req, 'maintenance.create', { type: 'equipment', id: eq.equipment_id }, { kind: log.kind, logId: log._id });
  res.status(201).json(log);
}));

r.patch('/:id', requireRole('staff', 'admin'), ah(async (req, res) => {
  const update = {};
  for (const k of ['kind', 'notes', 'nextDueAt', 'performedAt']) if (req.body[k] !== undefined) update[k] = req.body[k] || null;
  if (req.body.readings !== undefined) update.readings = parseReadings(req.body.readings);
  const log = await MaintenanceLog.findByIdAndUpdate(req.params.id, { $set: update }, { new: true, runValidators: true });
  if (!log) throw new HttpError(404, 'Log not found');
  await logActivity(req, 'maintenance.update', { type: 'equipment', id: log.equipmentId }, { logId: log._id, fields: Object.keys(update) });
  res.json(log);
}));

r.delete('/:id', requireRole('staff', 'admin'), ah(async (req, res) => {
  const log = await MaintenanceLog.findByIdAndDelete(req.params.id);
  if (!log) throw new HttpError(404, 'Log not found');
  log.attachments.forEach((a) => removeLocalFile(a.path));
  await logActivity(req, 'maintenance.delete', { type: 'equipment', id: log.equipmentId }, { logId: log._id });
  res.json({ ok: true });
}));

export default r;
