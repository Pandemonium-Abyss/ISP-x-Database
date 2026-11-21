import { Router } from 'express';
import { requireRole } from '../middleware/auth.js';
import { ah, HttpError } from '../utils/http.js';
import { ActivityLog } from '../models/index.js';

const r = Router();
r.use(requireRole('staff', 'admin'));

r.get('/', ah(async (req, res) => {
  const { action, userId, entityType, q, page = 1, limit = 50 } = req.query;
  const filter = {};
  if (action) filter.action = new RegExp(`^${action.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
  if (userId) filter.userId = Number(userId);
  if (entityType) filter['entity.type'] = entityType;
  if (q) filter.$or = [{ userName: new RegExp(q, 'i') }, { action: new RegExp(q, 'i') }];
  const lim = Math.min(Number(limit) || 50, 200);
  const [items, total, actions] = await Promise.all([
    ActivityLog.find(filter).sort({ timestamp: -1 }).skip((Number(page) - 1) * lim).limit(lim).lean(),
    ActivityLog.countDocuments(filter),
    ActivityLog.aggregate([{ $group: { _id: '$action', n: { $sum: 1 } } }, { $sort: { n: -1 } }]),
  ]);
  res.json({ items, total, page: Number(page), pages: Math.ceil(total / lim), actions });
}));

// Update: admin annotation on a log entry
r.patch('/:id', requireRole('admin'), ah(async (req, res) => {
  const log = await ActivityLog.findByIdAndUpdate(req.params.id, { $set: { adminNote: req.body.adminNote || '' } }, { new: true });
  if (!log) throw new HttpError(404, 'Log entry not found');
  res.json(log);
}));

r.delete('/:id', requireRole('admin'), ah(async (req, res) => {
  const d = await ActivityLog.deleteOne({ _id: req.params.id });
  if (!d.deletedCount) throw new HttpError(404, 'Log entry not found');
  res.json({ ok: true });
}));

export default r;
