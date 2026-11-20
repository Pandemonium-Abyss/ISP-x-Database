"use client";

import { apiFetch, apiOrThrow, apiSendJson } from "@/lib/api";

export const MESSAGE_MAX = 2000;

export type ThreadMessage = {
  id: string;
  by: string;
  // null once that account is deleted
  by_username: string | null;
  text: string;
  at: string;
  edited_at: string | null;
};

function base(ticketId: number | string) {
  return `/ticket/${encodeURIComponent(String(ticketId))}/thread`;
}

export async function getThread(
  ticketId: number | string,
): Promise<ThreadMessage[]> {
  const res = await apiOrThrow(
    await apiFetch(base(ticketId)),
    "Could not load the discussion.",
  );
  return ((await res.json()) as { Messages: ThreadMessage[] }).Messages;
}

export async function postMessage(
  ticketId: number | string,
  text: string,
): Promise<ThreadMessage> {
  const res = await apiOrThrow(
    await apiSendJson(base(ticketId), "POST", { text }),
    "Could not send the message.",
  );
  return ((await res.json()) as { Message: ThreadMessage }).Message;
}

export async function editMessage(
  ticketId: number | string,
  messageId: string,
  text: string,
): Promise<ThreadMessage> {
  const res = await apiOrThrow(
    await apiSendJson(
      `${base(ticketId)}/${encodeURIComponent(messageId)}`,
      "PUT",
      { text },
    ),
    "Could not save the message.",
  );
  return ((await res.json()) as { Message: ThreadMessage }).Message;
}

export async function deleteMessage(
  ticketId: number | string,
  messageId: string,
): Promise<void> {
  await apiOrThrow(
    await apiFetch(`${base(ticketId)}/${encodeURIComponent(messageId)}`, {
      method: "DELETE",
    }),
    "Could not delete the message.",
  );
}
