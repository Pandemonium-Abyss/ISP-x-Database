import { Router } from 'express';
import { requireAuth, requireRole, isStaff } from '../middleware/auth.js';
import { ah, HttpError, requireFields } from '../utils/http.js';
import { logActivity, notify } from '../services/activity.js';
import { query } from '../config/mysql.js';
import { Announcement } from '../models/index.js';

const r = Router();
r.use(requireAuth);

r.get('/', ah(async (req, res) => {
  const filter = isStaff(req.user) ? {} : { audience: { $in: ['all', 'members'] } };
  if (req.query.tag) filter.tags = req.query.tag;
  res.json(await Announcement.find(filter).sort({ pinned: -1, createdAt: -1 }).limit(100).lean());
}));

const tagsOf = (t) => (Array.isArray(t) ? t : String(t || '').split(',')).map((s) => s.trim()).filter(Boolean);

r.post('/', requireRole('staff', 'admin'), ah(async (req, res) => {
  requireFields(req.body, ['title', 'body']);
  const a = await Announcement.create({
    authorId: req.user.user_id, authorName: req.user.full_name,
    title: req.body.title, body: req.body.body, tags: tagsOf(req.body.tags),
    pinned: !!req.body.pinned, audience: req.body.audience || 'all',
  });
  await logActivity(req, 'announcement.create', { type: 'announcement', id: a._id }, { title: a.title });
  if (req.body.notifyAll) {
    const roles = a.audience === 'staff' ? ['staff', 'admin'] : ['member', 'staff', 'admin'];
    const users = await query('SELECT user_id FROM users WHERE role IN (?)', [roles]);
    await notify(users.map((u) => u.user_id).filter((id) => id !== req.user.user_id),
      { type: 'announcement', title: `📣 ${a.title}`, message: a.body.slice(0, 100), link: '/announcements' });
  }
  res.status(201).json(a);
}));

r.patch('/:id', requireRole('staff', 'admin'), ah(async (req, res) => {
  const update = { updatedAt: new Date() };
  for (const k of ['title', 'body', 'audience']) if (req.body[k] !== undefined) update[k] = req.body[k];
  if (req.body.pinned !== undefined) update.pinned = !!req.body.pinned;
  if (req.body.tags !== undefined) update.tags = tagsOf(req.body.tags);
  const a = await Announcement.findByIdAndUpdate(req.params.id, { $set: update }, { new: true, runValidators: true });
  if (!a) throw new HttpError(404, 'Announcement not found');
  await logActivity(req, 'announcement.update', { type: 'announcement', id: a._id }, { fields: Object.keys(update) });
  res.json(a);
}));

r.delete('/:id', requireRole('staff', 'admin'), ah(async (req, res) => {
  const a = await Announcement.findByIdAndDelete(req.params.id);
  if (!a) throw new HttpError(404, 'Announcement not found');
  await logActivity(req, 'announcement.delete', { type: 'announcement', id: a._id }, { title: a.title });
  res.json({ ok: true });
}));

export default r;
