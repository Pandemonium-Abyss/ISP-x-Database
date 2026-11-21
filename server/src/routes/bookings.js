import { Router } from 'express';
import { query } from '../config/mysql.js';
import { requireAuth, requireRole, isStaff } from '../middleware/auth.js';
import { ah, HttpError, requireFields, assertEnum, ENUMS } from '../utils/http.js';
import { logActivity, notify } from '../services/activity.js';
import { bookEquipment, rescheduleBooking } from '../services/transactions/bookEquipment.js';

const r = Router();
r.use(requireAuth);

r.get('/', ah(async (req, res) => {
  const { equipmentId, scope = 'mine', upcoming } = req.query;
  const where = [];
  const params = [];
  if (scope === 'mine' || !isStaff(req.user)) { where.push('b.user_id = ?'); params.push(req.user.user_id); }
  if (equipmentId) { where.push('b.equipment_id = ?'); params.push(equipmentId); }
  if (upcoming === '1') where.push("b.end_time > UTC_TIMESTAMP() AND b.status = 'booked'");
  res.json(await query(
    `SELECT b.*, e.name AS equipment_name, e.location, u.full_name AS user_name
       FROM equipment_bookings b
       JOIN equipment e ON e.equipment_id = b.equipment_id
       JOIN users u ON u.user_id = b.user_id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY b.start_time DESC LIMIT 300`,
    params
  ));
}));

// CREATE — atomic transaction with overlap check
r.post('/', ah(async (req, res) => {
  requireFields(req.body, ['equipment_id', 'start_time', 'end_time']);
  const simulateFailure = req.user.role === 'admin' ? req.body.simulateFailure : undefined;
  const result = await bookEquipment({
    req, user: req.user,
    equipmentId: req.body.equipment_id,
    start: req.body.start_time, end: req.body.end_time,
    purpose: req.body.purpose, requestId: req.body.request_id,
    simulateFailure,
  });
  res.status(201).json(result);
}));

async function loadOwned(req) {
  const [b] = await query('SELECT * FROM equipment_bookings WHERE booking_id = ?', [req.params.id]);
  if (!b) throw new HttpError(404, 'Booking not found');
  if (b.user_id !== req.user.user_id && !isStaff(req.user)) throw new HttpError(403, 'Not your booking');
  return b;
}

// UPDATE — reschedule (transaction) or change status
r.patch('/:id', ah(async (req, res) => {
  const b = await loadOwned(req);
  if (req.body.start_time || req.body.end_time) {
    const result = await rescheduleBooking({
      req, bookingId: b.booking_id, equipmentId: b.equipment_id,
      start: req.body.start_time || b.start_time, end: req.body.end_time || b.end_time, purpose: req.body.purpose,
    });
    return res.json(result);
  }
  if (req.body.status) {
    assertEnum(req.body.status, ENUMS.bookingStatus, 'status');
    await query('UPDATE equipment_bookings SET status = ? WHERE booking_id = ?', [req.body.status, b.booking_id]);
    await logActivity(req, `booking.${req.body.status}`, { type: 'booking', id: b.booking_id });
    if (b.user_id !== req.user.user_id) {
      await notify(b.user_id, { type: 'booking', title: `Your booking #${b.booking_id} was ${req.body.status}`, link: '/bookings' });
    }
    return res.json({ ok: true });
  }
  if (req.body.purpose !== undefined) {
    await query('UPDATE equipment_bookings SET purpose = ? WHERE booking_id = ?', [req.body.purpose, b.booking_id]);
    return res.json({ ok: true });
  }
  throw new HttpError(400, 'Nothing to update');
}));

r.delete('/:id', ah(async (req, res) => {
  const b = await loadOwned(req);
  await query('DELETE FROM equipment_bookings WHERE booking_id = ?', [b.booking_id]);
  await logActivity(req, 'booking.delete', { type: 'booking', id: b.booking_id }, { equipmentId: b.equipment_id });
  res.json({ ok: true });
}));

export default r;
