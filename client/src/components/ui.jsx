import { useEffect } from 'react';
import { X, Loader2, Inbox } from 'lucide-react';
import { label } from '../lib/format.js';

export function cx(...a) {
  return a.filter(Boolean).join(' ');
}

export function Button({ variant = 'primary', size = 'md', className, icon: Icon, children, loading, ...props }) {
  const v = {
    primary: 'bg-brand-700 text-white hover:bg-brand-800 active:bg-brand-900',
    secondary: 'bg-surface text-ink border border-line hover:border-brand-600 hover:text-brand-800',
    ghost: 'text-muted hover:bg-brand-50 hover:text-brand-800',
    danger: 'bg-surface text-danger border border-danger/30 hover:bg-danger hover:text-white',
    gold: 'bg-tape-400 text-ink hover:bg-tape-100',
  }[variant];
  const s = { sm: 'px-2.5 py-1.5 text-[13px] gap-1.5', md: 'px-3.5 py-2 text-sm gap-2', lg: 'px-5 py-2.5 text-[15px] gap-2' }[size];
  return (
    <button
      className={cx('inline-flex items-center justify-center rounded-md font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50', v, s, className)}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : Icon && <Icon className={size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'} />}
      {children}
    </button>
  );
}

export function Card({ className, children, title, action, padded = true }) {
  return (
    <section className={cx('card', className)}>
      {(title || action) && (
        <header className="flex min-h-12 items-center justify-between gap-3 border-b border-line px-5 py-2.5">
          <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
          {action}
        </header>
      )}
      <div className={padded ? 'p-5' : ''}>{children}</div>
    </section>
  );
}

export function PageHeader({ title, subtitle, actions, eyebrow }) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-sm text-muted">{eyebrow}</div>}
        <h1 className="font-display text-[2.5rem] font-semibold leading-[1.05] text-ink">{title}</h1>
        {subtitle && <p className="mt-2 max-w-[62ch] text-[15px] text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

const TONES = {
  gray: 'bg-bench text-muted ring-line',
  teal: 'bg-brand-50 text-brand-800 ring-brand-100',
  gold: 'bg-tape-50 text-tape-600 ring-tape-100',
  red: 'bg-red-50 text-danger ring-red-100',
  green: 'bg-emerald-50 text-success ring-emerald-100',
  blue: 'bg-sky-50 text-sky-800 ring-sky-100',
  violet: 'bg-violet-50 text-violet-800 ring-violet-100',
};
export function Badge({ tone = 'gray', children, className, dot }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 whitespace-nowrap rounded px-1.5 py-px text-xs font-medium ring-1 ring-inset', TONES[tone], className)}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

/* Status: a quiet dot + word. Colour only where it carries meaning. */
const STATUS_DOT = {
  open: 'bg-brand-600', in_progress: 'bg-violet-500', waiting: 'bg-tape-400 ring-1 ring-tape-600/40', resolved: 'bg-success', closed: 'bg-line',
  available: 'bg-success', in_use: 'bg-brand-600', maintenance: 'bg-tape-400 ring-1 ring-tape-600/40', retired: 'bg-line',
  booked: 'bg-brand-600', cancelled: 'bg-line', completed: 'bg-success',
};
export const StatusBadge = ({ status }) => (
  <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[13px] text-ink">
    <span className={cx('h-2 w-2 shrink-0 rounded-full', STATUS_DOT[status] || 'bg-line')} />
    {label(status)}
  </span>
);

/* Priority: a four-step level meter; urgent becomes red tape so it can't be missed. */
const LEVEL = { low: 1, medium: 2, high: 3, urgent: 4 };
export function PriorityBadge({ priority }) {
  if (priority === 'urgent') return <span className="tape" style={{ '--tape': 'var(--color-danger)', '--tape-ink': '#fff' }}>Urgent</span>;
  const n = LEVEL[priority] || 0;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[13px] text-ink" title={`${label(priority)} priority`}>
      <span className="flex items-end gap-[2px]" aria-hidden>
        {[1, 2, 3, 4].map((i) => (
          <span key={i} style={{ height: 3 + i * 2 }} className={cx('w-[3px] rounded-[1px]', i <= n ? (n === 3 ? 'bg-tape-600' : 'bg-ink/70') : 'bg-line')} />
        ))}
      </span>
      {label(priority)}
    </span>
  );
}

/* Request types are colour-coded with tape, matching the chart colours on Usage & insights. */
export const TYPE_TAPE = {
  experiment_setup: '#a9cbf4', maintenance: '#f6b68c', access: '#97d8bd', consumables: '#f3bad0', ticket: '#f4cf4e',
};
export const TypeBadge = ({ type }) => <span className="tape" style={{ '--tape': TYPE_TAPE[type] }}>{label(type)}</span>;

export function Avatar({ name = '?', src, size = 32 }) {
  const initials = name.replace(/^Dr\.\s*/, '').split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  const hue = [...name].reduce((h, c) => h + c.charCodeAt(0), 0) % 360;
  return src ? (
    <img src={src} alt={name} style={{ width: size, height: size }} className="shrink-0 rounded-full object-cover" />
  ) : (
    <span
      style={{ width: size, height: size, background: `hsl(${hue} 30% 88%)`, color: `hsl(${hue} 40% 26%)`, fontSize: size * 0.38 }}
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold"
    >
      {initials}
    </span>
  );
}

export function Field({ label: l, children, hint, className }) {
  return (
    <label className={cx('block', className)}>
      {l && <span className="label">{l}</span>}
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function Modal({ open, onClose, title, children, wide }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/35 p-4 pt-[8vh]" onMouseDown={onClose}>
      <div role="dialog" aria-modal="true" className={cx('card w-full shadow-[0_24px_60px_-12px_rgb(23_33_43/0.35)]', wide ? 'max-w-2xl' : 'max-w-lg')} onMouseDown={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h3 className="font-display text-xl font-semibold text-ink">{title}</h3>
          <button onClick={onClose} className="rounded p-1 text-muted hover:bg-bench hover:text-ink" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function Empty({ icon: Icon = Inbox, title, children }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
      <Icon className="mb-3 h-7 w-7 text-muted/50" strokeWidth={1.5} />
      <p className="text-sm font-medium text-ink">{title}</p>
      {children && <div className="mt-1 text-sm text-muted">{children}</div>}
    </div>
  );
}

export function Spinner({ className }) {
  return (
    <div className={cx('flex items-center justify-center py-12 text-muted', className)}>
      <Loader2 className="h-5 w-5 animate-spin" />
    </div>
  );
}

/* A readout: the figure is the content, the label sits under it. No icon tile. */
export function Stat({ label: l, value, tone, hint }) {
  const t = { red: 'text-danger', gold: 'text-tape-600', blue: 'text-brand-700' }[tone] || 'text-ink';
  return (
    <div className="min-w-0 border-l-2 border-line py-1 pl-4">
      <div className={cx('font-display tnum text-[2rem] font-semibold leading-none', t)}>{value}</div>
      <div className="mt-1.5 truncate text-[13px] text-muted">{l}</div>
      {hint && <div className="text-xs text-muted/80">{hint}</div>}
    </div>
  );
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="inline-flex border-b border-line" role="tablist">
      {tabs.map(([v, l]) => (
        <button
          key={v}
          role="tab"
          aria-selected={value === v}
          onClick={() => onChange(v)}
          className={cx('-mb-px border-b-2 px-3 py-1.5 text-sm transition-colors',
            value === v ? 'border-brand-700 font-semibold text-ink' : 'border-transparent text-muted hover:text-ink')}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
