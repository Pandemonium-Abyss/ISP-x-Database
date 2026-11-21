export class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    Object.assign(this, extra);
  }
}

/** Wrap async route handlers so thrown errors reach the error middleware. */
export const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** Require the listed body fields to be present and non-empty. */
export function requireFields(body, fields) {
  const missing = fields.filter((f) => body[f] === undefined || body[f] === null || body[f] === '');
  if (missing.length) throw new HttpError(400, `Missing required field(s): ${missing.join(', ')}`);
}

/** Keep only allowed keys whose value is defined. */
export function pick(obj, keys) {
  const out = {};
  for (const k of keys) if (obj[k] !== undefined) out[k] = obj[k] === '' ? null : obj[k];
  return out;
}

export const ENUMS = {
  roles: ['member', 'staff', 'admin'],
  equipmentStatus: ['available', 'in_use', 'maintenance', 'retired'],
  requestType: ['experiment_setup', 'maintenance', 'access', 'consumables', 'ticket'],
  priority: ['low', 'medium', 'high', 'urgent'],
  requestStatus: ['open', 'in_progress', 'waiting', 'resolved', 'closed'],
  bookingStatus: ['booked', 'cancelled', 'completed'],
};

export function assertEnum(value, list, name) {
  if (value !== undefined && value !== null && !list.includes(value)) {
    throw new HttpError(400, `Invalid ${name}: ${value}`);
  }
}
