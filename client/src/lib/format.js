export const fmtDate = (d) => (d ? new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
export const fmtDateTime = (d) =>
  d ? new Date(d).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
export const fmtTime = (d) => (d ? new Date(d).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '');
export const money = (n) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const label = (s) => (s ? s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()) : '');

export function timeAgo(d) {
  if (!d) return '';
  const secs = Math.round((Date.now() - new Date(d).getTime()) / 1000);
  const abs = Math.abs(secs);
  if (abs < 45) return 'just now';
  const steps = [['month', 2629800], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60], ['second', 1]];
  const [name, size] = steps.find(([, sz]) => abs >= sz);
  const n = Math.round(abs / size);
  const txt = `${n} ${name}${n > 1 ? 's' : ''}`;
  return secs < 0 ? `in ${txt}` : `${txt} ago`;
}

/** value for <input type="datetime-local"> from a Date/ISO string, in local time */
export function toLocalInput(d) {
  const x = new Date(d);
  const pad = (n) => String(n).padStart(2, '0');
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}T${pad(x.getHours())}:${pad(x.getMinutes())}`;
}

export const REQUEST_TYPES = [
  ['experiment_setup', 'Experiment setup'],
  ['maintenance', 'Equipment maintenance'],
  ['access', 'Access permission'],
  ['ticket', 'Internal ticket'],
  ['consumables', 'Consumables order'],
];
export const PRIORITIES = ['urgent', 'high', 'medium', 'low'];
export const REQUEST_STATUSES = ['open', 'in_progress', 'waiting', 'resolved', 'closed'];
export const EQUIPMENT_STATUSES = ['available', 'in_use', 'maintenance', 'retired'];
