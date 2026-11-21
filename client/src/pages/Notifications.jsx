import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck, Trash2, Circle, CheckCircle2 } from 'lucide-react';
import { api } from '../api/client.js';
import { useFetch } from '../lib/useFetch.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../components/Toast.jsx';
import { Badge, Button, Card, PageHeader, Spinner, Empty, cx } from '../components/ui.jsx';
import { timeAgo } from '../lib/format.js';

const TONE = { request: 'blue', order: 'green', booking: 'teal', announcement: 'gold', info: 'gray' };

export default function Notifications() {
  const { refreshBadges } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const { data, loading, reload } = useFetch('/notifications');
  const act = async (fn) => { try { await fn(); reload(); refreshBadges(); } catch (e) { toast.error(e); } };

  return (
    <>
      <PageHeader title="Notifications" subtitle="Status changes, assignments, comments and announcements — stored as documents in MongoDB."
        actions={data?.unread > 0 && <Button variant="secondary" icon={CheckCheck} onClick={() => act(() => api.post('/notifications/read-all'))}>Mark all read</Button>} />
      <Card padded={false}>
        {loading ? <Spinner /> : !data?.items.length ? <Empty icon={Bell} title="You're all caught up" /> : (
          <ul className="divide-y divide-line">
            {data.items.map((n) => (
              <li key={n._id} className={cx('flex items-start gap-3 px-5 py-3.5', !n.isRead && 'bg-tape-50/50')}>
                <button title={n.isRead ? 'Mark unread' : 'Mark read'} className="mt-0.5 text-muted hover:text-brand-700"
                  onClick={() => act(() => api.patch(`/notifications/${n._id}/read`, { isRead: !n.isRead }))}>
                  {n.isRead ? <CheckCircle2 className="h-4 w-4" /> : <Circle className="h-4 w-4 fill-tape-400 text-tape-400" />}
                </button>
                <button className="min-w-0 flex-1 text-left" onClick={async () => {
                  if (!n.isRead) await api.patch(`/notifications/${n._id}/read`, { isRead: true });
                  refreshBadges();
                  if (n.link) nav(n.link);
                }}>
                  <div className="flex items-center gap-2">
                    <span className={cx('text-sm', !n.isRead && 'font-semibold')}>{n.title}</span>
                    <Badge tone={TONE[n.type] || 'gray'}>{n.type}</Badge>
                  </div>
                  {n.message && <p className="mt-0.5 text-sm text-muted">{n.message}</p>}
                  <div className="mt-0.5 text-[11px] text-muted">{timeAgo(n.sentAt)}</div>
                </button>
                <Button size="sm" variant="ghost" icon={Trash2} title="Dismiss" onClick={() => act(() => api.del(`/notifications/${n._id}`))} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
