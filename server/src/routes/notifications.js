import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { ah, HttpError } from '../utils/http.js';
import { Notification } from '../models/index.js';

const r = Router();
r.use(requireAuth);

r.get('/', ah(async (req, res) => {
  const filter = { userId: req.user.user_id };
  if (req.query.unread === '1') filter.isRead = false;
  const [items, unread] = await Promise.all([
    Notification.find(filter).sort({ sentAt: -1 }).limit(Number(req.query.limit) || 100).lean(),
    Notification.countDocuments({ userId: req.user.user_id, isRead: false }),
  ]);
  res.json({ items, unread });
}));

r.patch('/:id/read', ah(async (req, res) => {
  const n = await Notification.findOneAndUpdate(
    { _id: req.params.id, userId: req.user.user_id },
    { $set: { isRead: req.body.isRead ?? true } },
    { new: true }
  );
  if (!n) throw new HttpError(404, 'Notification not found');
  res.json(n);
}));

r.post('/read-all', ah(async (req, res) => {
  const r2 = await Notification.updateMany({ userId: req.user.user_id, isRead: false }, { $set: { isRead: true } });
  res.json({ updated: r2.modifiedCount });
}));

r.delete('/:id', ah(async (req, res) => {
  const d = await Notification.deleteOne({ _id: req.params.id, userId: req.user.user_id });
  if (!d.deletedCount) throw new HttpError(404, 'Notification not found');
  res.json({ ok: true });
}));

export default r;
