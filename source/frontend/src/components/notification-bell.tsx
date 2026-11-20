"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  getNotifications,
  getUnreadCount,
  markAllRead,
  markRead,
  timeAgo,
  type Notification,
} from "@/lib/notification";
import { onTaskChange } from "@/lib/task";
import { onTicketChange } from "@/lib/ticket";

// A count is one indexed query, so polling it is cheap. Only while the tab
// is visible - nobody needs a hidden tab asking every 30 seconds.
const POLL_MS = 30_000;

const TYPE_LABEL: Record<Notification["type"], string> = {
  task_assigned: "Task",
  task_status: "Task",
  ticket_created: "Ticket",
  ticket_status: "Ticket",
  announcement: "Announcement",
};

function BellIcon() {
  const mask = "url(/bell.svg)";
  return (
    <span
      aria-hidden="true"
      className="size-6 bg-(--primary-color-deep)"
      style={{
        maskImage: mask,
        maskRepeat: "no-repeat",
        maskPosition: "center",
        maskSize: "contain",
        WebkitMaskImage: mask,
        WebkitMaskRepeat: "no-repeat",
        WebkitMaskPosition: "center",
        WebkitMaskSize: "contain",
      }}
    />
  );
}

export default function NotificationBell() {
  const router = useRouter();
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const refreshCount = useCallback(() => {
    if (document.visibilityState !== "visible") return;
    // A failed poll keeps the last count rather than flashing an error.
    getUnreadCount().then(setUnread).catch(() => {});
  }, []);

  const loadList = useCallback(() => {
    setError(null);
    getNotifications()
      .then(({ items, unread }) => {
        setItems(items);
        setUnread(unread);
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Could not load notifications"),
      );
  }, []);

  // Count: on mount, on an interval, when the tab comes back, and after this
  // browser changes a task or ticket (which may have notified someone here).
  useEffect(() => {
    refreshCount();
    const timer = window.setInterval(refreshCount, POLL_MS);
    document.addEventListener("visibilitychange", refreshCount);
    const offTask = onTaskChange(refreshCount);
    const offTicket = onTicketChange(refreshCount);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshCount);
      offTask();
      offTicket();
    };
  }, [refreshCount]);

  // Close on a click outside or Escape.
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) loadList();
  }

  async function openItem(item: Notification) {
    setOpen(false);
    if (!item.read) {
      // Optimistic: the badge drops right away, and a failure only means it
      // shows as unread again on the next load.
      setUnread((n) => Math.max(0, n - 1));
      setItems((list) =>
        list?.map((n) => (n.id === item.id ? { ...n, read: true } : n)) ?? null,
      );
      markRead(item.id).catch(() => {});
    }
    if (item.link) router.push(item.link);
  }

  async function readAll() {
    try {
      await markAllRead();
      setUnread(0);
      setItems((list) => list?.map((n) => ({ ...n, read: true })) ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not mark them read");
    }
  }

  const badge = unread > 99 ? "99+" : String(unread);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="relative flex size-9 items-center justify-center rounded-full hover:bg-(--primary-color-3-hover)"
      >
        <BellIcon />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-xs font-bold leading-5 text-white">
            {badge}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 top-11 z-20 flex max-h-[70vh] w-[min(22rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl bg-white text-left text-black shadow-2xl"
        >
          <div className="flex items-center justify-between border-b border-(--panel-bg-hover) px-4 py-3">
            <h2 className="text-base font-bold">Notifications</h2>
            <button
              type="button"
              onClick={readAll}
              disabled={unread === 0}
              className="text-sm text-(--primary-color-deep) hover:underline disabled:cursor-default disabled:opacity-40 disabled:no-underline"
            >
              Mark all as read
            </button>
          </div>

          <div className="flex-1 overflow-y-auto scrollbar-thin">
            {error && <p className="px-4 py-6 text-center text-sm text-red-700">{error}</p>}

            {!error && items === null && (
              <p className="px-4 py-6 text-center text-sm text-gray-500">Loading…</p>
            )}

            {!error && items?.length === 0 && (
              <p className="px-4 py-6 text-center text-sm text-gray-500">
                You&apos;re all caught up.
              </p>
            )}

            {!error && items && items.length > 0 && (
              <ul>
                {items.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => openItem(item)}
                      className={`flex w-full gap-3 px-4 py-3 text-left hover:bg-(--panel-bg) ${item.read ? "" : "bg-(--panel-bg)/60"}`}
                    >
                      <span
                        aria-hidden="true"
                        className={`mt-1.5 size-2 shrink-0 rounded-full ${item.read ? "bg-transparent" : "bg-(--primary-color-1)"}`}
                      />
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className={`text-sm ${item.read ? "" : "font-semibold"}`}>
                          {item.title}
                        </span>
                        <span className="text-xs text-gray-500">
                          {TYPE_LABEL[item.type]} · {item.actor.username} ·{" "}
                          {timeAgo(item.created_at)}
                        </span>
                        {!item.read && <span className="sr-only">Unread</span>}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
