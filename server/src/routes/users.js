import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../config/mysql.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { avatarUpload, publicPath, removeLocalFile } from '../middleware/upload.js';
import { ah, HttpError, requireFields, assertEnum, ENUMS } from '../utils/http.js';
import { logActivity } from '../services/activity.js';

const r = Router();
const COLS = 'user_id, email, full_name, role, avatar_path, created_at';

// Read: everyone signed in can see the member directory (needed for assignees)
r.get('/', requireAuth, ah(async (_req, res) => {
  res.json(await query(
    `SELECT u.user_id, u.email, u.full_name, u.role, u.avatar_path, u.created_at,
            (SELECT COUNT(*) FROM requests q WHERE q.requester_id = u.user_id) AS requests_filed,
            (SELECT COUNT(*) FROM requests q WHERE q.assignee_id = u.user_id AND q.status NOT IN ('resolved','closed')) AS open_assigned
       FROM users u ORDER BY u.role DESC, u.full_name`
  ));
}));

// Create (admin adds a lab member directly)
r.post('/', requireRole('admin'), ah(async (req, res) => {
  requireFields(req.body, ['email', 'password', 'full_name']);
  const role = req.body.role || 'member';
  assertEnum(role, ENUMS.roles, 'role');
  const hash = await bcrypt.hash(req.body.password, 10);
  const result = await query('INSERT INTO users (email, password_hash, full_name, role) VALUES (?,?,?,?)',
    [req.body.email.trim().toLowerCase(), hash, req.body.full_name.trim(), role]);
  await logActivity(req, 'user.create', { type: 'user', id: result.insertId }, { role });
  const [u] = await query(`SELECT ${COLS} FROM users WHERE user_id = ?`, [result.insertId]);
  res.status(201).json(u);
}));

// Update own profile (name, email, password)
r.patch('/me', requireAuth, ah(async (req, res) => {
  const { full_name, email, current_password, new_password } = req.body;
  const sets = [];
  const params = [];
  if (full_name) { sets.push('full_name = ?'); params.push(full_name.trim()); }
  if (email) { sets.push('email = ?'); params.push(email.trim().toLowerCase()); }
  if (new_password) {
    const [row] = await query('SELECT password_hash FROM users WHERE user_id = ?', [req.user.user_id]);
    if (!(await bcrypt.compare(current_password || '', row.password_hash))) {
      throw new HttpError(400, 'Current password is incorrect');
    }
    if (new_password.length < 6) throw new HttpError(400, 'New password must be at least 6 characters');
    sets.push('password_hash = ?');
    params.push(await bcrypt.hash(new_password, 10));
  }
  if (!sets.length) throw new HttpError(400, 'Nothing to update');
  await query(`UPDATE users SET ${sets.join(', ')} WHERE user_id = ?`, [...params, req.user.user_id]);
  await logActivity(req, 'user.update_profile', { type: 'user', id: req.user.user_id },
    { fields: sets.map((s) => s.split(' ')[0]).map((f) => (f === 'password_hash' ? 'password' : f)) });
  const [u] = await query(`SELECT ${COLS} FROM users WHERE user_id = ?`, [req.user.user_id]);
  res.json(u);
}));

// Upload avatar -> stored on local disk under uploads/avatars
r.post('/me/avatar', requireAuth, avatarUpload.single('avatar'), ah(async (req, res) => {
  if (!req.file) throw new HttpError(400, 'No image uploaded');
  const path = publicPath('avatars', req.file);
  removeLocalFile(req.user.avatar_path);
  await query('UPDATE users SET avatar_path = ? WHERE user_id = ?', [path, req.user.user_id]);
  await logActivity(req, 'user.avatar', { type: 'user', id: req.user.user_id }, { path });
  res.json({ avatar_path: path });
}));

// Admin: change name / role of any user
r.patch('/:id', requireRole('admin'), ah(async (req, res) => {
  const { role, full_name } = req.body;
  assertEnum(role, ENUMS.roles, 'role');
  await query('UPDATE users SET role = COALESCE(?, role), full_name = COALESCE(?, full_name) WHERE user_id = ?',
    [role || null, full_name || null, req.params.id]);
  await logActivity(req, 'user.admin_update', { type: 'user', id: Number(req.params.id) }, { role, full_name });
  const [u] = await query(`SELECT ${COLS} FROM users WHERE user_id = ?`, [req.params.id]);
  if (!u) throw new HttpError(404, 'User not found');
  res.json(u);
}));

r.delete('/:id', requireRole('admin'), ah(async (req, res) => {
  if (Number(req.params.id) === req.user.user_id) throw new HttpError(400, 'You cannot delete your own account');
  const [u] = await query('SELECT avatar_path, email FROM users WHERE user_id = ?', [req.params.id]);
  if (!u) throw new HttpError(404, 'User not found');
  await query('DELETE FROM users WHERE user_id = ?', [req.params.id]);
  removeLocalFile(u.avatar_path);
  await logActivity(req, 'user.delete', { type: 'user', id: Number(req.params.id) }, { email: u.email });
  res.json({ ok: true });
}));

export default r;
