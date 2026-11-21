import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../config/mysql.js';
import { signToken, setAuthCookie, COOKIE, requireAuth } from '../middleware/auth.js';
import { ah, HttpError, requireFields } from '../utils/http.js';
import { logActivity, notify } from '../services/activity.js';

const r = Router();

r.post('/register', ah(async (req, res) => {
  requireFields(req.body, ['email', 'password', 'full_name']);
  const { email, password, full_name } = req.body;
  if (String(password).length < 6) throw new HttpError(400, 'Password must be at least 6 characters');
  const hash = await bcrypt.hash(password, 10);
  const result = await query(
    'INSERT INTO users (email, password_hash, full_name, role) VALUES (?, ?, ?, ?)',
    [email.trim().toLowerCase(), hash, full_name.trim(), 'member']
  );
  const [user] = await query('SELECT user_id, email, full_name, role, avatar_path, created_at FROM users WHERE user_id = ?', [result.insertId]);
  setAuthCookie(res, signToken(user));
  req.user = user;
  await logActivity(req, 'user.register', { type: 'user', id: user.user_id });
  await notify(user.user_id, {
    type: 'info', title: 'Welcome to Labrador 🐾',
    message: 'Start on the dashboard to see what is happening in the lab, or file your first request.',
    link: '/',
  });
  res.status(201).json(user);
}));

r.post('/login', ah(async (req, res) => {
  requireFields(req.body, ['email', 'password']);
  const [row] = await query('SELECT * FROM users WHERE email = ?', [req.body.email.trim().toLowerCase()]);
  if (!row || !(await bcrypt.compare(req.body.password, row.password_hash))) {
    await logActivity(req, 'user.login_failed', { type: 'user' }, { email: req.body.email });
    throw new HttpError(401, 'Invalid email or password');
  }
  const { password_hash, ...user } = row;
  setAuthCookie(res, signToken(user));
  req.user = user;
  await logActivity(req, 'user.login', { type: 'user', id: user.user_id });
  res.json(user);
}));

r.post('/logout', (req, res) => {
  if (req.user) logActivity(req, 'user.logout', { type: 'user', id: req.user.user_id });
  res.clearCookie(COOKIE);
  res.json({ ok: true });
});

r.get('/me', requireAuth, (req, res) => res.json(req.user));

export default r;
