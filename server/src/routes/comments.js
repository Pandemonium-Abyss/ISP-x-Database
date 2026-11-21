import { Router } from 'express';
import { requireAuth, isStaff } from '../middleware/auth.js';
import { removeLocalFile } from '../middleware/upload.js';
import { ah, HttpError } from '../utils/http.js';
import { logActivity } from '../services/activity.js';
import { RequestComment } from '../models/index.js';

const r = Router();
r.use(requireAuth);

async function own(req) {
  const c = await RequestComment.findById(req.params.id);
  if (!c) throw new HttpError(404, 'Comment not found');
  if (c.userId !== req.user.user_id && !isStaff(req.user)) throw new HttpError(403, 'You can only change your own comments');
  return c;
}

r.patch('/:id', ah(async (req, res) => {
  const c = await own(req);
  if (!req.body.body?.trim()) throw new HttpError(400, 'Comment cannot be empty');
  c.body = req.body.body;
  c.editedAt = new Date();
  await c.save();
  await logActivity(req, 'comment.update', { type: 'comment', id: c._id }, { requestId: c.requestId });
  res.json(c);
}));

r.delete('/:id', ah(async (req, res) => {
  const c = await own(req);
  c.attachments.forEach((a) => removeLocalFile(a.path));
  await c.deleteOne();
  await logActivity(req, 'comment.delete', { type: 'comment', id: c._id }, { requestId: c.requestId });
  res.json({ ok: true });
}));

// Toggle an emoji reaction (array update in the document)
r.post('/:id/react', ah(async (req, res) => {
  const emoji = req.body.emoji || '👍';
  const c = await RequestComment.findById(req.params.id);
  if (!c) throw new HttpError(404, 'Comment not found');
  const has = c.reactions.some((x) => x.userId === req.user.user_id && x.emoji === emoji);
  const update = has
    ? { $pull: { reactions: { userId: req.user.user_id, emoji } } }
    : { $push: { reactions: { userId: req.user.user_id, emoji } } };
  res.json(await RequestComment.findByIdAndUpdate(c._id, update, { new: true }));
}));

export default r;
