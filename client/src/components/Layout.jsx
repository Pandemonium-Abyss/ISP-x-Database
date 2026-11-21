import { useState } from 'react';
import { NavLink, Outlet, Link, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, ClipboardList, Microscope, CalendarClock, FlaskConical, Megaphone, BarChart3,
  Wrench, ScrollText, Users, Database, Bell, ShoppingCart, Plus, LogOut, UserRound, Menu, X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { Avatar, Button, cx } from './ui.jsx';
import Logo from './Logo.jsx';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/requests', label: 'Requests', icon: ClipboardList },
  { to: '/equipment', label: 'Equipment', icon: Microscope },
  { to: '/bookings', label: 'Bookings', icon: CalendarClock },
  { to: '/consumables', label: 'Consumables', icon: FlaskConical },
  { to: '/announcements', label: 'Announcements', icon: Megaphone },
  { to: '/stats', label: 'Usage & insights', icon: BarChart3 },
];
const STAFF_NAV = [
  { to: '/maintenance', label: 'Maintenance logs', icon: Wrench },
  { to: '/activity', label: 'Activity log', icon: ScrollText },
  { to: '/users', label: 'Lab members', icon: Users },
  { to: '/db', label: 'Database inspector', icon: Database },
];

function NavItem({ item, onClick }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onClick}
      className={({ isActive }) =>
        cx('group flex items-center gap-3 rounded-md px-3 py-[7px] text-[14px] transition-colors',
          isActive ? 'font-semibold text-ink' : 'text-muted hover:bg-bench hover:text-ink')
      }
    >
      {({ isActive }) => (
        <>
          <Icon className={cx('h-[18px] w-[18px] shrink-0', isActive ? 'text-ink' : 'text-muted/80 group-hover:text-ink')} strokeWidth={isActive ? 2.25 : 1.75} />
          {/* the current page is "taped" like a labelled shelf */}
          <span className={cx(isActive && 'tape -mx-1 px-1.5 py-0.5 text-[14px]')}>{item.label}</span>
        </>
      )}
    </NavLink>
  );
}

function IconLink({ to, title, count, tone, children }) {
  return (
    <Link to={to} aria-label={count ? `${title} (${count})` : title} title={title}
      className="relative rounded-md p-2 text-muted transition-colors hover:bg-surface hover:text-ink">
      {children}
      {count > 0 && (
        <span className={cx('tnum absolute -right-0.5 -top-0.5 min-w-[18px] rounded-full px-1 text-center text-[11px] font-semibold leading-[18px] ring-2 ring-bench',
          tone === 'red' ? 'bg-danger text-white' : 'bg-tape-400 text-ink')}>{count}</span>
      )}
    </Link>
  );
}

export default function Layout() {
  const { user, logout, isStaff, badges } = useAuth();
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const nav = useNavigate();
  const close = () => setOpen(false);

  return (
    <div className="flex min-h-full">
      <aside
        className={cx(
          'fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-line bg-surface px-3 pb-4 pt-5 transition-transform lg:translate-x-0',
          open ? 'translate-x-0 shadow-xl' : '-translate-x-full'
        )}
      >
        <Link to="/" onClick={close} className="mb-7 flex items-center gap-2.5 px-2">
          <Logo className="h-9 w-9" />
          <span className="font-display text-[1.6rem] font-bold leading-none tracking-tight text-ink">Labrador</span>
        </Link>
        <nav className="flex flex-1 flex-col gap-px overflow-y-auto" aria-label="Main">
          {NAV.map((n) => <NavItem key={n.to} item={n} onClick={close} />)}
          {isStaff && (
            <>
              <div className="mb-1 mt-6 px-3 text-[13px] font-medium text-muted/80">Staff tools</div>
              {STAFF_NAV.map((n) => <NavItem key={n.to} item={n} onClick={close} />)}
            </>
          )}
        </nav>
        <p className="mt-4 px-3 text-xs leading-relaxed text-muted/80">
          Self-hosted on MySQL 8 and MongoDB 7. Files stay on this server.
        </p>
      </aside>
      {open && <div className="fixed inset-0 z-30 bg-ink/30 lg:hidden" onClick={close} />}

      <div className="flex min-w-0 flex-1 flex-col lg:pl-60">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-1.5 border-b border-line/70 bg-bench/90 px-4 backdrop-blur sm:px-6 lg:px-10">
          <button className="rounded-md p-1.5 text-muted hover:bg-surface lg:hidden" onClick={() => setOpen(!open)} aria-label={open ? 'Close menu' : 'Open menu'}>
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <div className="flex-1" />
          <Button size="sm" icon={Plus} onClick={() => nav('/requests/new')} className="mr-1.5">New request</Button>
          <IconLink to="/cart" title="Consumables cart" count={badges.cart}><ShoppingCart className="h-5 w-5" strokeWidth={1.75} /></IconLink>
          <IconLink to="/notifications" title="Notifications" count={badges.unread} tone="red"><Bell className="h-5 w-5" strokeWidth={1.75} /></IconLink>
          <div className="relative ml-1">
            <button onClick={() => setMenu(!menu)} aria-expanded={menu} className="flex items-center gap-2 rounded-md py-1 pl-1 pr-2 hover:bg-surface">
              <Avatar name={user.full_name} src={user.avatar_path} size={30} />
              <span className="hidden text-left sm:block">
                <span className="block text-sm font-semibold leading-tight">{user.full_name}</span>
                <span className="block text-xs capitalize leading-tight text-muted">{user.role}</span>
              </span>
            </button>
            {menu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
                <div className="card absolute right-0 z-20 mt-1 w-44 overflow-hidden py-1 shadow-lg">
                  <Link to="/profile" onClick={() => setMenu(false)} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-bench"><UserRound className="h-4 w-4" /> Profile</Link>
                  <button onClick={async () => { await logout(); nav('/login'); }} className="flex w-full items-center gap-2 px-3 py-2 text-sm text-danger hover:bg-red-50"><LogOut className="h-4 w-4" /> Sign out</button>
                </div>
              </>
            )}
          </div>
        </header>
        <main className="flex-1 px-4 pb-16 pt-8 sm:px-6 lg:px-10">
          <div className="mx-auto max-w-[1240px]"><Outlet /></div>
        </main>
      </div>
    </div>
  );
}
