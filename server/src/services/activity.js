import { ActivityLog, Notification } from '../models/index.js';
import { query } from '../config/mysql.js';

/** Write an audit entry to MongoDB `activity_logs`. Never throws (logging must not break requests). */
export async function logActivity(req, action, entity = {}, metadata = {}, session) {
  try {
    const doc = {
      userId: req?.user?.user_id ?? null,
      userName: req?.user?.full_name ?? null,
      action,
      entity,
      ip: req?.ip,
      metadata,
      timestamp: new Date(),
    };
    if (session) await ActivityLog.create([doc], { session });
    else await ActivityLog.create(doc);
  } catch (err) {
    if (session) throw err; // inside a transaction the caller must know
    console.error('activity log failed:', err.message);
  }
}

/** Create notifications for one or more users. */
export async function notify(userIds, { title, message, link, type = 'info' }, session) {
  const ids = [...new Set([].concat(userIds).filter(Boolean))];
  if (!ids.length) return;
  const docs = ids.map((userId) => ({ userId, title, message, link, type, sentAt: new Date() }));
  if (session) await Notification.insertMany(docs, { session });
  else await Notification.insertMany(docs);
}

export async function staffIds() {
  const rows = await query("SELECT user_id FROM users WHERE role IN ('staff','admin')");
  return rows.map((r) => r.user_id);
}
