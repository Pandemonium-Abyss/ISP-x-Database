import jwt from 'jsonwebtoken';
import { query } from '../config/mysql.js';
import { HttpError } from '../utils/http.js';

const SECRET = () => process.env.JWT_SECRET || 'dev-secret';
export const COOKIE = 'labrador_token';

export function signToken(user) {
  return jwt.sign({ uid: user.user_id, role: user.role }, SECRET(), { expiresIn: '7d' });
}

export function setAuthCookie(res, token) {
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', maxAge: 7 * 24 * 3600 * 1000 });
}

/** Attach req.user (fresh from MySQL) if a valid cookie is present. */
export async function loadUser(req, _res, next) {
  const token = req.cookies?.[COOKIE];
  if (!token) return next();
  try {
    const { uid } = jwt.verify(token, SECRET());
    const rows = await query(
      'SELECT user_id, email, full_name, role, avatar_path, created_at FROM users WHERE user_id = ?',
      [uid]
    );
    if (rows[0]) req.user = rows[0];
  } catch {
    /* invalid/expired token -> anonymous */
  }
  next();
}

export function requireAuth(req, _res, next) {
  if (!req.user) return next(new HttpError(401, 'Please sign in'));
  next();
}

export const requireRole = (...roles) => (req, _res, next) => {
  if (!req.user) return next(new HttpError(401, 'Please sign in'));
  if (!roles.includes(req.user.role)) return next(new HttpError(403, 'You do not have permission for this action'));
  next();
};

export const isStaff = (user) => user && (user.role === 'staff' || user.role === 'admin');
