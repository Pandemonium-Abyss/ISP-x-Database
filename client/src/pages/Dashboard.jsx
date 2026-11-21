import { Link } from 'react-router-dom';
import { Pin, ChevronRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useFetch } from '../lib/useFetch.js';
import { Card, Spinner, StatusBadge, PriorityBadge, TypeBadge, Empty, cx } from '../components/ui.jsx';
import { fmtDateTime, timeAgo, label } from '../lib/format.js';

const ACTION_TEXT = {
  'request.create': 'filed a request', 'request.update': 'updated a request', 'request.delete': 'deleted a request',
  'order.submit': 'placed a consumables order', 'booking.create': 'booked equipment', 'booking.cancelled': 'cancelled a booking',
  'booking.reschedule': 'rescheduled a booking', 'comment.create': 'commented on a request', 'maintenance.create': 'logged maintenance',
  'equipment.update': 'updated equipment', 'equipment.create': 'added equipment', 'announcement.create': 'posted an announcement',
  'consumable.update': 'updated stock', 'user.register': 'joined the lab',
};

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** A count in the summary sentence, taped and linked to the list it describes. */
function Taped({ to, n, children, color, ink }) {
  if (!n) return <span className="text-muted">{children}</span>;
  return (
    <Link to={to} className="tape mx-px align-[0.08em] text-[0.82em] hover:brightness-95" style={{ '--tape': color, '--tape-ink': ink }}>
      {children}
    </Link>
  );
}

export default function Dashboard() {
  const { user, isStaff } = useAuth();
  const { data, loading } = useFetch('/dashboard');
  if (loading || !data) return <Spinner />;
  const { counts, myRequests, queue, equipment, lowStock, myBookings, announcements, recentActivity } = data;
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const first = user.full_name.replace(/^Dr\.\s*/, '').split(' ')[0];

  return (
    <>
      <header className="mb-10 max-w-[48rem]">
        <p className="text-sm text-muted">{new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        <h1 className="mt-1 font-display text-[clamp(2.5rem,5vw,3.6rem)] font-semibold leading-[1] text-ink">{greet}, {first}</h1>
        <p className="mt-5 text-[clamp(1.1rem,1.6vw,1.3rem)] leading-[1.7] text-ink/90">
          The lab has <Taped to="/requests" n={counts.open_requests} color="#dfe5e8">{plural(counts.open_requests, 'open request')}</Taped>
          {' '}— <Taped to="/requests?priority=urgent" n={counts.urgent_open} color="var(--color-danger)" ink="#fff">{counts.urgent_open ? `${counts.urgent_open} urgent` : 'none urgent'}</Taped>
          {' '}and <Taped to="/requests?assigned=none" n={counts.unassigned} color="var(--color-tape-400)">{counts.unassigned ? `${counts.unassigned} nobody has picked up` : 'all picked up'}</Taped>.
          {' '}<Taped to="/consumables?low=1" n={counts.low_stock} color="#f6b68c">{plural(counts.low_stock, 'consumable')}</Taped> {counts.low_stock === 1 ? 'is' : 'are'} running low,
          and <Taped to="/bookings" n={counts.bookings_24h} color="#a9cbf4">{plural(counts.bookings_24h, 'booking')}</Taped> start in the next 24 hours.
        </p>
      </header>

      <div className="grid gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-8">
          {isStaff && (
            <Card title="Your queue" action={<Link to="/requests?assigned=none" className="text-sm font-medium text-brand-700 hover:underline">All unassigned</Link>} padded={false}>
              <p className="border-b border-line px-5 py-2 text-[13px] text-muted">Unassigned requests and requests assigned to you, most urgent first.</p>
              <RequestRows rows={queue} who="requester_name" empty="Nothing waiting. The queue is clear." />
            </Card>
          )}
          <Card title="Requests you filed" action={<Link to="/requests?mine=1" className="text-sm font-medium text-brand-700 hover:underline">See all</Link>} padded={false}>
            <RequestRows rows={myRequests} who="assignee_name" empty="You have no open requests." />
          </Card>

          <section>
            <SectionHead title="Equipment right now" to="/equipment" link="Equipment" />
            <div className="grid overflow-hidden rounded-md border border-line bg-line [gap:1px] sm:grid-cols-2 xl:grid-cols-3">
              {equipment.map((e) => {
                const status = e.in_use_by ? 'in_use' : e.status;
                return (
                  <Link key={e.equipment_id} to={`/equipment/${e.equipment_id}`}
                    className="group flex items-start justify-between gap-3 bg-surface px-4 py-3 transition-colors hover:bg-brand-50/60">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold group-hover:text-brand-800">{e.name}</span>
                      <span className="block truncate text-[13px] text-muted">{e.in_use_by ? `In use by ${e.in_use_by}` : e.location}</span>
                    </span>
                    <span className="sr-only">{label(status)}</span>
                    <span aria-hidden className={cx('mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full',
                      { available: 'bg-success', in_use: 'bg-brand-600', maintenance: 'bg-tape-400 ring-1 ring-tape-600/50', retired: 'bg-line' }[status])} title={label(status)} />
                  </Link>
                );
              })}
            </div>
            <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-muted">
              {[['bg-success', 'Available'], ['bg-brand-600', 'In use'], ['bg-tape-400 ring-1 ring-tape-600/50', 'Maintenance']].map(([c, l]) => (
                <span key={l} className="inline-flex items-center gap-1.5"><span className={cx('h-2 w-2 rounded-full', c)} />{l}</span>
              ))}
            </p>
          </section>
        </div>

        <aside className="space-y-9">
          <section>
            <SectionHead title="Notice board" to="/announcements" link="All posts" />
            {announcements.length === 0 ? <p className="text-sm text-muted">No announcements yet.</p> : (
              <ul className="space-y-5">
                {announcements.map((a) => (
                  <li key={a._id}>
                    <div className="flex items-start gap-1.5">
                      {a.pinned && <Pin className="mt-1 h-3.5 w-3.5 shrink-0 fill-tape-400 text-tape-600" aria-label="Pinned" />}
                      <span className="text-[15px] font-semibold leading-snug">{a.title}</span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-muted">{a.body}</p>
                    <div className="mt-1 text-xs text-muted/90">{a.authorName}, {timeAgo(a.createdAt)}</div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <SectionHead title="Your bookings" to="/bookings" link="Bookings" />
            {myBookings.length === 0 ? (
              <p className="text-sm text-muted">Nothing booked. <Link to="/equipment" className="font-medium text-brand-700 underline">Book an instrument</Link></p>
            ) : (
              <ul className="divide-y divide-line">
                {myBookings.map((b) => (
                  <li key={b.booking_id} className="flex items-baseline justify-between gap-3 py-2 text-sm">
                    <span className="truncate font-medium">{b.equipment_name}</span>
                    <span className="tnum shrink-0 text-[13px] text-muted">{fmtDateTime(b.start_time)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {lowStock.length > 0 && (
            <section>
              <SectionHead title="Running low" to="/consumables?low=1" link="Inventory" />
              <ul className="divide-y divide-line">
                {lowStock.map((c) => (
                  <li key={c.consumable_id} className="flex items-baseline justify-between gap-3 py-2 text-sm">
                    <span className="truncate">{c.name}</span>
                    <span className={cx('tnum shrink-0 text-[13px] font-semibold', c.stock_quantity === 0 ? 'text-danger' : 'text-tape-600')}>
                      {c.stock_quantity === 0 ? 'Out of stock' : `${c.stock_quantity} left`}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <SectionHead title="Recent activity" />
            <ol className="space-y-3">
              {recentActivity.map((a) => (
                <li key={a._id} className="grid grid-cols-[1fr_auto] gap-x-3 text-sm">
                  <span>
                    <span className="font-medium">{a.userName || 'Someone'}</span>{' '}
                    <span className="text-muted">{ACTION_TEXT[a.action] || a.action}</span>
                    {a.entity?.type === 'request' && a.entity.id && (
                      <> <Link to={`/requests/${a.entity.id}`} className="tnum font-medium text-brand-700 hover:underline">#{a.entity.id}</Link></>
                    )}
                  </span>
                  <span className="whitespace-nowrap text-xs text-muted/90">{timeAgo(a.timestamp)}</span>
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>
    </>
  );
}

function SectionHead({ title, to, link }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3 border-b-2 border-ink pb-1.5">
      <h2 className="font-display text-xl font-semibold">{title}</h2>
      {to && <Link to={to} className="text-sm font-medium text-brand-700 hover:underline">{link}</Link>}
    </div>
  );
}

function RequestRows({ rows, who, empty }) {
  if (!rows.length) return <Empty title={empty} />;
  return (
    <ul className="divide-y divide-line">
      {rows.map((r) => (
        <li key={r.request_id}>
          <Link to={`/requests/${r.request_id}`} className="group grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-x-3 px-4 py-3 sm:px-5 transition-colors hover:bg-brand-50/50 sm:grid-cols-[3rem_minmax(0,1fr)_6.5rem_7rem_1rem]">
            <span className="tnum text-[13px] text-muted">#{r.request_id}</span>
            <span className="min-w-0">
              <span className="block truncate text-[15px] font-medium group-hover:text-brand-800">{r.title}</span>
              <span className="mt-1 flex min-w-0 items-center gap-2 text-[13px] text-muted">
                <TypeBadge type={r.type} />
                <span className="truncate">
                  {who === 'assignee_name' ? (r[who] ? `With ${r[who]}` : 'Not picked up yet') : r[who] ? `From ${r[who]}` : ''}, {timeAgo(r.created_at)}
                </span>
              </span>
            </span>
            <span className="justify-self-start"><PriorityBadge priority={r.priority} /></span>
            <span className="hidden sm:block"><StatusBadge status={r.status} /></span>
            <ChevronRight className="hidden h-4 w-4 text-muted/60 group-hover:text-brand-700 sm:block" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
