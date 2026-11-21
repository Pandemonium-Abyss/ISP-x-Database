import { Router } from 'express';
import { query, withSqlTransaction } from '../config/mysql.js';
import { requireAuth, isStaff } from '../middleware/auth.js';
import { attachmentUpload, publicPath, removeLocalFile } from '../middleware/upload.js';
import { ah, HttpError, requireFields, assertEnum, ENUMS, pick } from '../utils/http.js';
import { logActivity, notify, staffIds } from '../services/activity.js';
import { RequestComment } from '../models/index.js';

const r = Router();
r.use(requireAuth);

const PRIORITY_ORDER = "FIELD(rq.priority,'urgent','high','medium','low')";

async function loadRequest(id) {
  const [row] = await query(
    `SELECT rq.*, req.full_name AS requester_name, req.email AS requester_email, req.avatar_path AS requester_avatar,
            asg.full_name AS assignee_name, e.name AS equipment_name
       FROM requests rq
       JOIN users req      ON req.user_id = rq.requester_id
       LEFT JOIN users asg ON asg.user_id = rq.assignee_id
       LEFT JOIN equipment e ON e.equipment_id = rq.equipment_id
      WHERE rq.request_id = ?`,
    [id]
  );
  if (!row) throw new HttpError(404, 'Request not found');
  return row;
}

function canEdit(user, rq) {
  return isStaff(user) || rq.requester_id === user.user_id;
}

// ---------- READ: list with filters + joins ----------
r.get('/', ah(async (req, res) => {
  const { status, type, priority, mine, assigned, q, open } = req.query;
  const where = [];
  const params = [];
  if (status) { where.push('rq.status = ?'); params.push(status); }
  if (open === '1') where.push("rq.status NOT IN ('resolved','closed')");
  if (type) { where.push('rq.type = ?'); params.push(type); }
  if (priority) { where.push('rq.priority = ?'); params.push(priority); }
  if (mine === '1') { where.push('rq.requester_id = ?'); params.push(req.user.user_id); }
  if (assigned === 'me') { where.push('rq.assignee_id = ?'); params.push(req.user.user_id); }
  if (assigned === 'none') where.push('rq.assignee_id IS NULL');
  if (q) { where.push('(rq.title LIKE ? OR rq.description LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
  const rows = await query(
    `SELECT rq.request_id, rq.type, rq.title, rq.priority, rq.status, rq.due_date, rq.created_at, rq.updated_at,
            rq.requester_id, rq.assignee_id, req.full_name AS requester_name, asg.full_name AS assignee_name,
            e.name AS equipment_name,
            (SELECT COUNT(*) FROM request_items i WHERE i.request_id = rq.request_id) AS item_count
       FROM requests rq
       JOIN users req ON req.user_id = rq.requester_id
       LEFT JOIN users asg ON asg.user_id = rq.assignee_id
       LEFT JOIN equipment e ON e.equipment_id = rq.equipment_id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY (rq.status IN ('resolved','closed')), ${PRIORITY_ORDER}, rq.created_at DESC
      LIMIT 300`,
    params
  );
  // attach comment counts from MongoDB
  const counts = await RequestComment.aggregate([
    { $match: { requestId: { $in: rows.map((x) => x.request_id) } } },
    { $group: { _id: '$requestId', n: { $sum: 1 } } },
  ]);
  const byId = Object.fromEntries(counts.map((c) => [c._id, c.n]));
  res.json(rows.map((x) => ({ ...x, comment_count: byId[x.request_id] || 0 })));
}));

r.get('/:id', ah(async (req, res) => {
  const rq = await loadRequest(req.params.id);
  const items = await query(
    `SELECT i.item_id, i.consumable_id, i.quantity, i.unit_cost, c.name, c.unit, c.stock_quantity,
            (i.quantity * i.unit_cost) AS line_total
       FROM request_items i JOIN consumables c ON c.consumable_id = i.consumable_id
      WHERE i.request_id = ? ORDER BY c.name`,
    [req.params.id]
  );
  const bookings = await query(
    `SELECT b.*, e.name AS equipment_name FROM equipment_bookings b
       JOIN equipment e ON e.equipment_id = b.equipment_id WHERE b.request_id = ? ORDER BY b.start_time`,
    [req.params.id]
  );
  res.json({ ...rq, items, bookings });
}));

// ---------- CREATE ----------
r.post('/', ah(async (req, res) => {
  requireFields(req.body, ['type', 'title']);
  const { type, priority = 'medium' } = req.body;
  assertEnum(type, ENUMS.requestType, 'type');
  assertEnum(priority, ENUMS.priority, 'priority');
  if (type === 'consumables') throw new HttpError(400, 'Use the consumables cart to place consumables orders');
  const data = pick(req.body, ['title', 'description', 'priority', 'due_date', 'equipment_id']);
  data.type = type;
  data.requester_id = req.user.user_id;
  if (isStaff(req.user) && req.body.assignee_id) data.assignee_id = req.body.assignee_id;
  const result = await query('INSERT INTO requests SET ?', [data]);
  const id = result.insertId;
  await logActivity(req, 'request.create', { type: 'request', id }, { type, priority, title: data.title });
  const staff = await staffIds();
  await notify(staff.filter((s) => s !== req.user.user_id), {
    type: 'request', title: `New ${type.replace('_', ' ')} request`,
    message: `${req.user.full_name}: ${data.title} (${priority})`, link: `/requests/${id}`,
  });
  res.status(201).json(await loadRequest(id));
}));

// ---------- UPDATE ----------
r.patch('/:id', ah(async (req, res) => {
  const old = await loadRequest(req.params.id);
  if (!canEdit(req.user, old)) throw new HttpError(403, 'Only the requester or lab staff can edit this request');
  const allowed = isStaff(req.user)
    ? ['title', 'description', 'priority', 'status', 'due_date', 'assignee_id', 'equipment_id']
    : ['title', 'description', 'priority', 'due_date', 'equipment_id', 'status'];
  const data = pick(req.body, allowed);
  assertEnum(data.priority, ENUMS.priority, 'priority');
  assertEnum(data.status, ENUMS.requestStatus, 'status');
  if (!isStaff(req.user) && data.status && data.status !== 'closed') {
    throw new HttpError(403, 'Members can only close their own requests');
  }
  if (!Object.keys(data).length) throw new HttpError(400, 'Nothing to update');
  if (data.status && ['resolved', 'closed'].includes(data.status) && !old.resolved_at) data.resolved_at = new Date();
  if (data.status && !['resolved', 'closed'].includes(data.status)) data.resolved_at = null;
  await query('UPDATE requests SET ? WHERE request_id = ?', [data, req.params.id]);

  const changes = {};
  for (const k of Object.keys(data)) if (k !== 'resolved_at' && String(old[k] ?? '') !== String(data[k] ?? '')) changes[k] = { from: old[k], to: data[k] };
  await logActivity(req, 'request.update', { type: 'request', id: Number(req.params.id) }, { changes });

  const updated = await loadRequest(req.params.id);
  const watchers = [old.requester_id, updated.assignee_id].filter((u) => u && u !== req.user.user_id);
  if (changes.status) {
    await notify(watchers, { type: 'request', title: `Request #${old.request_id} is now ${data.status.replace('_', ' ')}`,
      message: old.title, link: `/requests/${old.request_id}` });
  }
  if (changes.assignee_id && updated.assignee_id && updated.assignee_id !== req.user.user_id) {
    await notify(updated.assignee_id, { type: 'request', title: `You were assigned request #${old.request_id}`,
      message: old.title, link: `/requests/${old.request_id}` });
  }
  res.json(updated);
}));

// ---------- DELETE (restores consumable stock atomically) ----------
r.delete('/:id', ah(async (req, res) => {
  const rq = await loadRequest(req.params.id);
  if (!canEdit(req.user, rq)) throw new HttpError(403, 'Only the requester or lab staff can delete this request');
  const trace = [];
  await withSqlTransaction(async (conn) => {
    const [items] = await conn.query('SELECT consumable_id, quantity FROM request_items WHERE request_id = ? FOR UPDATE', [rq.request_id]);
    if (!['resolved', 'closed'].includes(rq.status)) {
      for (const it of items) {
        await conn.query('UPDATE consumables SET stock_quantity = stock_quantity + ? WHERE consumable_id = ?', [it.quantity, it.consumable_id]);
      }
      if (items.length) trace.push({ db: 'mysql', step: `Restored stock for ${items.length} line(s)` });
    }
    await conn.query('DELETE FROM requests WHERE request_id = ?', [rq.request_id]);
    trace.push({ db: 'mysql', step: `DELETE requests #${rq.request_id} (items cascade)` });
  }, trace);
  const comments = await RequestComment.find({ requestId: rq.request_id }).lean();
  comments.flatMap((c) => c.attachments || []).forEach((a) => removeLocalFile(a.path));
  await RequestComment.deleteMany({ requestId: rq.request_id });
  await logActivity(req, 'request.delete', { type: 'request', id: rq.request_id }, { title: rq.title });
  res.json({ ok: true, trace });
}));

// ---------- request_items: change quantity / remove line (stock adjusted in a transaction) ----------
r.patch('/:id/items/:itemId', ah(async (req, res) => {
  const rq = await loadRequest(req.params.id);
  if (!canEdit(req.user, rq)) throw new HttpError(403, 'Not allowed');
  if (['resolved', 'closed'].includes(rq.status)) throw new HttpError(409, 'Cannot change items on a finished request');
  const qty = Number(req.body.quantity);
  if (!Number.isInteger(qty) || qty < 1) throw new HttpError(400, 'Quantity must be a positive whole number');
  const trace = [];
  try {
    await withSqlTransaction(async (conn) => {
      const [[item]] = await conn.query('SELECT * FROM request_items WHERE item_id = ? AND request_id = ? FOR UPDATE', [req.params.itemId, rq.request_id]);
      if (!item) throw new HttpError(404, 'Line item not found');
      const delta = qty - item.quantity;
      const [[c]] = await conn.query('SELECT name, stock_quantity FROM consumables WHERE consumable_id = ? FOR UPDATE', [item.consumable_id]);
      if (delta > 0 && c.stock_quantity < delta) throw new HttpError(409, `Insufficient stock for "${c.name}": need ${delta} more, available ${c.stock_quantity}`);
      await conn.query('UPDATE consumables SET stock_quantity = stock_quantity - ? WHERE consumable_id = ?', [delta, item.consumable_id]);
      await conn.query('UPDATE request_items SET quantity = ? WHERE item_id = ?', [qty, item.item_id]);
      trace.push({ db: 'mysql', step: `Line ${item.item_id}: ${item.quantity} → ${qty}, stock ${delta > 0 ? '-' : '+'}${Math.abs(delta)}` });
    }, trace);
  } catch (err) { err.trace = trace; err.rolledBack = true; throw err; }
  await logActivity(req, 'request_item.update', { type: 'request', id: rq.request_id }, { itemId: Number(req.params.itemId), quantity: qty });
  res.json({ ok: true, trace });
}));

r.delete('/:id/items/:itemId', ah(async (req, res) => {
  const rq = await loadRequest(req.params.id);
  if (!canEdit(req.user, rq)) throw new HttpError(403, 'Not allowed');
  if (['resolved', 'closed'].includes(rq.status)) throw new HttpError(409, 'Cannot change items on a finished request');
  const trace = [];
  await withSqlTransaction(async (conn) => {
    const [[item]] = await conn.query('SELECT * FROM request_items WHERE item_id = ? AND request_id = ? FOR UPDATE', [req.params.itemId, rq.request_id]);
    if (!item) throw new HttpError(404, 'Line item not found');
    await conn.query('UPDATE consumables SET stock_quantity = stock_quantity + ? WHERE consumable_id = ?', [item.quantity, item.consumable_id]);
    await conn.query('DELETE FROM request_items WHERE item_id = ?', [item.item_id]);
    trace.push({ db: 'mysql', step: `Removed line ${item.item_id}, restored ${item.quantity} to stock` });
  }, trace);
  await logActivity(req, 'request_item.delete', { type: 'request', id: rq.request_id }, { itemId: Number(req.params.itemId) });
  res.json({ ok: true, trace });
}));

// ---------- Comments thread (MongoDB request_comments) ----------
r.get('/:id/comments', ah(async (req, res) => {
  res.json(await RequestComment.find({ requestId: Number(req.params.id) }).sort({ createdAt: 1 }).lean());
}));

r.post('/:id/comments', attachmentUpload.array('files', 5), ah(async (req, res) => {
  const rq = await loadRequest(req.params.id);
  if (!req.body.body?.trim()) throw new HttpError(400, 'Comment cannot be empty');
  const comment = await RequestComment.create({
    requestId: rq.request_id,
    userId: req.user.user_id,
    userName: req.user.full_name,
    body: req.body.body,
    attachments: (req.files || []).map((f) => ({
      path: publicPath('attachments', f), name: f.originalname, size: f.size, mimeType: f.mimetype,
    })),
  });
  await logActivity(req, 'comment.create', { type: 'request', id: rq.request_id }, { commentId: comment._id, files: comment.attachments.length });
  const watchers = [rq.requester_id, rq.assignee_id].filter((u) => u && u !== req.user.user_id);
  await notify(watchers, { type: 'request', title: `New comment on #${rq.request_id}`,
    message: `${req.user.full_name}: ${req.body.body.slice(0, 80)}`, link: `/requests/${rq.request_id}` });
  res.status(201).json(comment);
}));

export default r;
