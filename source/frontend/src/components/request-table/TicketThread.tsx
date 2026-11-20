"use client";

import { useEffect, useRef, useState } from "react";
import Button from "@/components/ui/button";
import { INPUT_LOOK } from "@/components/ui/field";
import { timeAgo } from "@/lib/notification";
import {
  MESSAGE_MAX,
  deleteMessage,
  editMessage,
  getThread,
  postMessage,
  type ThreadMessage,
} from "@/lib/ticket_thread";

// The conversation on one ticket, between whoever filed it and the admins.
export default function TicketThread({
  ticketId,
  currentUserId,
  isAdmin,
}: {
  ticketId: number | string;
  currentUserId: string;
  isAdmin: boolean;
}) {
  const [messages, setMessages] = useState<ThreadMessage[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(
    null,
  );
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    let cancelled = false;
    getThread(ticketId)
      .then((list) => !cancelled && setMessages(list))
      .catch(
        (err) =>
          !cancelled &&
          setLoadError(err instanceof Error ? err.message : "Could not load"),
      );
    return () => {
      cancelled = true;
    };
  }, [ticketId]);

  // Keep the newest message in view as the thread grows.
  const count = messages?.length ?? 0;
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [count]);

  async function send() {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    try {
      const message = await postMessage(ticketId, text);
      setMessages((list) => [...(list ?? []), message]);
      setDraft("");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not send the message.",
      );
    } finally {
      setSending(false);
    }
  }

  async function saveEdit() {
    if (!editing || !editing.text.trim()) return;
    setError(null);
    try {
      const saved = await editMessage(
        ticketId,
        editing.id,
        editing.text.trim(),
      );
      setMessages(
        (list) => list?.map((m) => (m.id === saved.id ? saved : m)) ?? null,
      );
      setEditing(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not save the message.",
      );
    }
  }

  async function remove(id: string) {
    setError(null);
    try {
      await deleteMessage(ticketId, id);
      setMessages((list) => list?.filter((m) => m.id !== id) ?? null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not delete the message.",
      );
    }
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
      <h2 className="text-base font-bold text-black">Discussion</h2>

      <ol
        ref={listRef}
        aria-label="Messages"
        className="flex min-h-40 flex-1 flex-col gap-3 overflow-y-auto scrollbar-thin rounded-[20px] bg-gray-50 p-3"
      >
        {loadError && <li className="text-sm text-red-500">{loadError}</li>}
        {!loadError && messages === null && (
          <li className="text-sm text-gray-500">Loading…</li>
        )}
        {messages?.length === 0 && (
          <li className="m-auto text-center text-sm text-gray-500">
            No messages yet. Ask a question or add details here.
          </li>
        )}

        {messages?.map((message) => {
          const mine = message.by === currentUserId;
          const isEditing = editing?.id === message.id;

          return (
            <li
              key={message.id}
              className={`flex max-w-[85%] flex-col gap-1 ${mine ? "self-end items-end" : "self-start items-start"}`}
            >
              <p className="text-xs text-gray-500">
                <span className="font-semibold text-gray-700">
                  {mine ? "You" : (message.by_username ?? "Deleted user")}
                </span>{" "}
                ·{" "}
                <time
                  dateTime={message.at}
                  title={new Date(message.at).toLocaleString()}
                >
                  {timeAgo(message.at)}
                </time>
                {message.edited_at && " · edited"}
              </p>

              {isEditing ? (
                <div className="flex w-72 max-w-full flex-col gap-2">
                  <textarea
                    value={editing.text}
                    maxLength={MESSAGE_MAX}
                    onChange={(e) =>
                      setEditing({ id: message.id, text: e.target.value })
                    }
                    aria-label="Edit message"
                    className={`${INPUT_LOOK.filled} min-h-16 resize-none bg-white`}
                  />
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline-white"
                      size="sm"
                      onClick={() => setEditing(null)}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="green"
                      size="sm"
                      onClick={saveEdit}
                      disabled={!editing.text.trim()}
                    >
                      Save
                    </Button>
                  </div>
                </div>
              ) : (
                <p
                  className={`rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap wrap-break-word ${
                    mine
                      ? "rounded-br-sm bg-(--primary-color-2) text-white"
                      : "rounded-bl-sm bg-white text-black shadow-sm"
                  }`}
                >
                  {message.text}
                </p>
              )}

              {!isEditing && (mine || isAdmin) && (
                <div className="flex gap-3 text-xs text-gray-500">
                  {mine && (
                    <button
                      type="button"
                      className="hover:underline"
                      onClick={() =>
                        setEditing({ id: message.id, text: message.text })
                      }
                    >
                      Edit
                    </button>
                  )}
                  <button
                    type="button"
                    className="hover:text-red-600 hover:underline"
                    onClick={() => remove(message.id)}
                  >
                    Delete
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ol>

      <div className="flex flex-col gap-2">
        <textarea
          value={draft}
          maxLength={MESSAGE_MAX}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends, Shift+Enter starts a new line.
            if (
              e.key === "Enter" &&
              !e.shiftKey &&
              !e.nativeEvent.isComposing
            ) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder="Write a message…"
          aria-label="New message"
          rows={2}
          className={`${INPUT_LOOK.filled} resize-none`}
        />
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-gray-400">
            Enter to send · Shift+Enter for a new line
          </p>
          <Button
            variant={sending ? "busy" : "green"}
            className="h-8 px-5 text-sm font-semibold"
            onClick={send}
            disabled={sending || !draft.trim()}
          >
            {sending ? "Sending…" : "Send"}
          </Button>
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
      </div>
    </div>
  );
}
