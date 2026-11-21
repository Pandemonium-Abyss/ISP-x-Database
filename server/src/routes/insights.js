import { Router } from 'express';
import mongoose from 'mongoose';
import { query } from '../config/mysql.js';
import { requireAuth, isStaff } from '../middleware/auth.js';
import { ah } from '../utils/http.js';
import { ActivityLog, Announcement, MaintenanceLog } from '../models/index.js';

const r = Router();
r.use(requireAuth);

// "What's going on in the lab" — one call for the dashboard
r.get('/dashboard', ah(async (req, res) => {
  const uid = req.user.user_id;
  const [[counts]] = [await query(
    `SELECT
       (SELECT COUNT(*) FROM requests WHERE status NOT IN ('resolved','closed')) AS open_requests,
       (SELECT COUNT(*) FROM requests WHERE status NOT IN ('resolved','closed') AND priority = 'urgent') AS urgent_open,
       (SELECT COUNT(*) FROM requests WHERE status NOT IN ('resolved','closed') AND assignee_id IS NULL) AS unassigned,
       (SELECT COUNT(*) FROM requests WHERE requester_id = ? AND status NOT IN ('resolved','closed')) AS my_open,
       (SELECT COUNT(*) FROM requests WHERE assignee_id = ? AND status NOT IN ('resolved','closed')) AS assigned_to_me,
       (SELECT COUNT(*) FROM consumables WHERE stock_quantity <= reorder_level) AS low_stock,
       (SELECT COUNT(*) FROM equipment_bookings WHERE status = 'booked'
          AND start_time < UTC_TIMESTAMP() + INTERVAL 1 DAY AND end_time > UTC_TIMESTAMP()) AS bookings_24h`,
    [uid, uid]
  )];
  const [myRequests, queue, equipment, lowStock, myBookings] = await Promise.all([
    query(`SELECT rq.request_id, rq.title, rq.type, rq.priority, rq.status, rq.created_at, a.full_name AS assignee_name
             FROM requests rq LEFT JOIN users a ON a.user_id = rq.assignee_id
            WHERE rq.requester_id = ? AND rq.status NOT IN ('resolved','closed')
            ORDER BY FIELD(rq.priority,'urgent','high','medium','low'), rq.created_at DESC LIMIT 8`, [uid]),
    isStaff(req.user)
      ? query(`SELECT rq.request_id, rq.title, rq.type, rq.priority, rq.status, rq.created_at, u.full_name AS requester_name
                 FROM requests rq JOIN users u ON u.user_id = rq.requester_id
                WHERE rq.status NOT IN ('resolved','closed') AND (rq.assignee_id IS NULL OR rq.assignee_id = ?)
                ORDER BY FIELD(rq.priority,'urgent','high','medium','low'), rq.created_at LIMIT 10`, [uid])
      : Promise.resolve([]),
    query(`SELECT e.equipment_id, e.name, e.status, e.location,
                  (SELECT u.full_name FROM equipment_bookings b JOIN users u ON u.user_id = b.user_id
                    WHERE b.equipment_id = e.equipment_id AND b.status = 'booked'
                      AND b.start_time <= UTC_TIMESTAMP() AND b.end_time > UTC_TIMESTAMP() LIMIT 1) AS in_use_by
             FROM equipment e WHERE e.status <> 'retired' ORDER BY e.name`),
    query('SELECT consumable_id, name, unit, stock_quantity, reorder_level FROM consumables WHERE stock_quantity <= reorder_level ORDER BY stock_quantity LIMIT 8'),
    query(`SELECT b.booking_id, b.start_time, b.end_time, e.name AS equipment_name
             FROM equipment_bookings b JOIN equipment e ON e.equipment_id = b.equipment_id
            WHERE b.user_id = ? AND b.status = 'booked' AND b.end_time > UTC_TIMESTAMP()
            ORDER BY b.start_time LIMIT 5`, [uid]),
  ]);
  const [announcements, recentActivity] = await Promise.all([
    Announcement.find(isStaff(req.user) ? {} : { audience: { $ne: 'staff' } }).sort({ pinned: -1, createdAt: -1 }).limit(4).lean(),
    ActivityLog.find({ action: { $not: /^(user\.login|user\.logout|cart\.)/ } }).sort({ timestamp: -1 }).limit(12).lean(),
  ]);
  res.json({ counts, myRequests, queue, equipment, lowStock, myBookings, announcements, recentActivity });
}));

// Usage over time: SQL aggregates + MongoDB aggregation pipelines
r.get('/stats', ah(async (req, res) => {
  const weeks = Math.min(Number(req.query.weeks) || 10, 52);
  const [perWeek, resolution, statusBreakdown, equipmentHours, consumableUsage] = await Promise.all([
    query(`SELECT DATE_FORMAT(DATE_SUB(DATE(created_at), INTERVAL WEEKDAY(created_at) DAY), '%Y-%m-%d') AS week, type, COUNT(*) AS n
             FROM requests WHERE created_at >= UTC_TIMESTAMP() - INTERVAL ? WEEK
            GROUP BY week, type ORDER BY week`, [weeks]),
    query(`SELECT type, COUNT(*) AS resolved, ROUND(AVG(TIMESTAMPDIFF(MINUTE, created_at, resolved_at)) / 60, 1) AS avg_hours
             FROM requests WHERE resolved_at IS NOT NULL GROUP BY type ORDER BY avg_hours DESC`),
    query('SELECT status, COUNT(*) AS n FROM requests GROUP BY status'),
    query(`SELECT e.name, ROUND(SUM(TIMESTAMPDIFF(MINUTE, b.start_time, b.end_time)) / 60, 1) AS hours, COUNT(*) AS bookings
             FROM equipment_bookings b JOIN equipment e ON e.equipment_id = b.equipment_id
            WHERE b.status <> 'cancelled' AND b.start_time >= UTC_TIMESTAMP() - INTERVAL ? WEEK
            GROUP BY e.equipment_id ORDER BY hours DESC LIMIT 10`, [weeks]),
    query(`SELECT c.name, c.unit, SUM(i.quantity) AS qty, ROUND(SUM(i.quantity * i.unit_cost), 2) AS cost
             FROM request_items i JOIN consumables c ON c.consumable_id = i.consumable_id
             JOIN requests rq ON rq.request_id = i.request_id
            WHERE rq.created_at >= UTC_TIMESTAMP() - INTERVAL ? WEEK
            GROUP BY c.consumable_id ORDER BY cost DESC LIMIT 10`, [weeks]),
  ]);
  const since = new Date(Date.now() - weeks * 7 * 864e5);
  const [activityPerDay, topActions, maintenanceByKind] = await Promise.all([
    ActivityLog.aggregate([
      { $match: { timestamp: { $gte: since } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } }, n: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
    ActivityLog.aggregate([
      { $match: { timestamp: { $gte: since } } },
      { $group: { _id: '$action', n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: 8 },
    ]),
    MaintenanceLog.aggregate([{ $group: { _id: '$kind', n: { $sum: 1 } } }, { $sort: { n: -1 } }]),
  ]);
  res.json({ perWeek, resolution, statusBreakdown, equipmentHours, consumableUsage, activityPerDay, topActions, maintenanceByKind });
}));

// Live row/document counts for both databases (transaction before/after proof)
r.get('/db-state', ah(async (_req, res) => {
  const tables = ['users', 'equipment', 'consumables', 'requests', 'request_items', 'equipment_bookings'];
  const [[sqlCounts]] = [await query(`SELECT ${tables.map((t) => `(SELECT COUNT(*) FROM ${t}) AS ${t}`).join(', ')}`)];
  const names = ['activity_logs', 'request_comments', 'notifications', 'consumable_carts', 'maintenance_logs', 'announcements'];
  const db = mongoose.connection.db;
  const mongoCounts = Object.fromEntries(await Promise.all(names.map(async (n) => [n, await db.collection(n).countDocuments()])));
  const stock = await query('SELECT consumable_id, name, stock_quantity FROM consumables ORDER BY name');
  res.json({ mysql: sqlCounts, mongodb: mongoCounts, stock, at: new Date() });
}));

export default r;
