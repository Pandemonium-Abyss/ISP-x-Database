import { withSqlTransaction } from '../../config/mysql.js';
import { withMongoTransaction } from '../../config/mongo.js';
import { logActivity, notify } from '../activity.js';
import { HttpError } from '../../utils/http.js';

function parseWindow(start, end) {
  const s = new Date(start);
  const e = new Date(end);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) throw new HttpError(400, 'Invalid start or end time');
  if (e <= s) throw new HttpError(400, 'End time must be after start time');
  return [s, e];
}

/** Lock the equipment row and make sure no active booking overlaps [s, e). */
async function assertSlotFree(conn, trace, equipmentId, s, e, ignoreBookingId = null) {
  const [eq] = await conn.query(
    'SELECT equipment_id, name, status FROM equipment WHERE equipment_id = ? FOR UPDATE',
    [equipmentId]
  );
  trace.push({ db: 'mysql', step: `SELECT equipment #${equipmentId} FOR UPDATE` });
  if (!eq[0]) throw new HttpError(404, 'Equipment not found');
  if (eq[0].status === 'maintenance' || eq[0].status === 'retired') {
    throw new HttpError(409, `"${eq[0].name}" is ${eq[0].status} and cannot be booked`);
  }
  const [clash] = await conn.query(
    `SELECT b.booking_id, b.start_time, b.end_time, u.full_name
       FROM equipment_bookings b JOIN users u ON u.user_id = b.user_id
      WHERE b.equipment_id = ? AND b.status = 'booked'
        AND b.start_time < ? AND b.end_time > ?
        AND (? IS NULL OR b.booking_id <> ?)
      FOR UPDATE`,
    [equipmentId, e, s, ignoreBookingId, ignoreBookingId]
  );
  trace.push({ db: 'mysql', step: `Checked overlapping bookings — ${clash.length} found` });
  if (clash.length) {
    const c = clash[0];
    throw new HttpError(409, `Time slot overlaps booking #${c.booking_id} by ${c.full_name}`);
  }
  return eq[0];
}

export async function bookEquipment({ req, user, equipmentId, start, end, purpose, requestId, simulateFailure }) {
  const trace = [];
  const [s, e] = parseWindow(start, end);
  let booking;
  try {
    booking = await withSqlTransaction(async (conn) => {
      const eq = await assertSlotFree(conn, trace, equipmentId, s, e);
      const [ins] = await conn.query(
        `INSERT INTO equipment_bookings (equipment_id, user_id, request_id, start_time, end_time, purpose)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [equipmentId, user.user_id, requestId || null, s, e, purpose || null]
      );
      trace.push({ db: 'mysql', step: `INSERT equipment_bookings → booking_id ${ins.insertId}` });
      if (simulateFailure === 'after_booking_insert') {
        throw new HttpError(500, 'Simulated failure after inserting the booking');
      }
      return { bookingId: ins.insertId, equipmentName: eq.name };
    }, trace);
  } catch (err) {
    err.trace = trace;
    err.rolledBack = true;
    throw err;
  }

  try {
    await withMongoTransaction(async (session) => {
      await logActivity(req, 'booking.create', { type: 'booking', id: booking.bookingId },
        { equipmentId: Number(equipmentId), start: s, end: e }, session);
      await notify(user.user_id, {
        type: 'booking', title: 'Equipment booked',
        message: `${booking.equipmentName}: ${s.toISOString().slice(0, 16).replace('T', ' ')} → ${e
          .toISOString().slice(0, 16).replace('T', ' ')} UTC`,
        link: '/bookings',
      }, session);
      trace.push({ db: 'mongodb', step: 'activity_logs + notifications inserted' });
    }, trace);
  } catch (err) {
    trace.push({ db: 'mysql', step: 'COMPENSATE — deleting booking', ok: false });
    await withSqlTransaction(async (conn) => {
      await conn.query('DELETE FROM equipment_bookings WHERE booking_id = ?', [booking.bookingId]);
    }, trace);
    err.trace = trace;
    err.rolledBack = true;
    throw err;
  }
  return { ...booking, trace };
}

export async function rescheduleBooking({ req, bookingId, equipmentId, start, end, purpose }) {
  const trace = [];
  const [s, e] = parseWindow(start, end);
  try {
    await withSqlTransaction(async (conn) => {
      await assertSlotFree(conn, trace, equipmentId, s, e, bookingId);
      await conn.query(
        'UPDATE equipment_bookings SET start_time = ?, end_time = ?, purpose = COALESCE(?, purpose) WHERE booking_id = ?',
        [s, e, purpose ?? null, bookingId]
      );
      trace.push({ db: 'mysql', step: `UPDATE equipment_bookings #${bookingId}` });
    }, trace);
  } catch (err) {
    err.trace = trace;
    err.rolledBack = true;
    throw err;
  }
  await logActivity(req, 'booking.reschedule', { type: 'booking', id: bookingId }, { start: s, end: e });
  return { trace };
}
