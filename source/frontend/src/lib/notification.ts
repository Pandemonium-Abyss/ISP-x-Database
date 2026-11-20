"use client";

import { apiFetch, apiOrThrow } from "@/lib/api";

export type NotificationType =
  | "task_assigned"
  | "task_status"
  | "ticket_created"
  | "ticket_status"
  | "announcement";

export type Notification = {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  // In-app path such as /request-table/task/12
  link: string | null;
  actor: { id: string; username: string };
  read: boolean;
  created_at: string;
};

// Not cached like the other lists: the whole point is to see new ones.
export async function getUnreadCount(): Promise<number> {
  const res = await apiOrThrow(
    await apiFetch("/notification/unread-count"),
    "Could not load notifications",
  );
  return ((await res.json()) as { Unread: number }).Unread;
}

export async function getNotifications(
  limit = 20,
): Promise<{ items: Notification[]; unread: number }> {
  const res = await apiOrThrow(
    await apiFetch(`/notification/?limit=${limit}`),
    "Could not load notifications",
  );
  const body = (await res.json()) as {
    Notifications: Notification[];
    Unread: number;
  };
  return { items: body.Notifications, unread: body.Unread };
}

export async function markRead(id: string): Promise<void> {
  await apiOrThrow(
    await apiFetch(`/notification/${encodeURIComponent(id)}/read`, {
      method: "PUT",
    }),
    "Could not mark it read",
  );
}

export async function markAllRead(): Promise<void> {
  await apiOrThrow(
    await apiFetch("/notification/read-all", { method: "PUT" }),
    "Could not mark them read",
  );
}

// "just now", "5m ago", "3h ago", "2d ago", then the date.
export function timeAgo(iso: string, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}
