"use client";

import { apiFetch, apiOrThrow } from "@/lib/api";
import { buildQuery } from "@/lib/query";
import { getUserId } from "@/lib/cache/cache";

// One field of a change. Values keep their type (text, number, true/false,
// a list, a date as an ISO string, or a nested object for equipment specs).
export type AuditChange = {
  field: string;
  from: unknown;
  to: unknown;
};

// One entry per change to one record, stored in MongoDB, holding every field
// that changed. Written by the endpoint that made the change.
export type AuditLog = {
  id: string;
  table: string;
  row_id: string;
  action: "created" | "updated" | "deleted";
  changes: AuditChange[];
  by_whom: string | null;
  // null once the account behind by_whom is deleted.
  by_username: string | null;
  occurred_at: string;
};

export type AuditLogsResponse = {
  AuditLogs: AuditLog[];
};

export type AuditLogQuery = {
  limit?: number;
  offset?: number;
  from_table?: string;
  row_id?: string;
  by_whom?: string;
};

const CACHE_TTL = 1000;

type CacheEntry = {
  data: AuditLogsResponse;
  expiresAt: number;
};

const auditLogCache = new Map<string, CacheEntry>();

// drop all cached logs, used on sign-out
export function clearAuditLogCache() {
  auditLogCache.clear();
}

// normal network request, also used by pagination
export async function getAuditLogs(
  query: AuditLogQuery = {},
): Promise<AuditLogsResponse> {
  const qs = buildQuery(query).toString();
  const res = await apiFetch(`/audit-log/${qs ? `?${qs}` : ""}`);
  await apiOrThrow(res, `HTTP ${res.status}`);

  return res.json();
}

// show cached data immediately, then replace it with fresh data.
export async function loadAuditLogs(
  query: AuditLogQuery,
  onData: (data: AuditLogsResponse, stale: boolean) => void,
  onError: (error: unknown) => void,
): Promise<void> {
  const userId = await getUserId();
  const key = userId ? `${userId}:${JSON.stringify(query)}` : null;
  const saved = key ? auditLogCache.get(key) : undefined;

  // expired entries are intentionally still displayed.
  if (saved) onData(saved.data, saved.expiresAt <= Date.now());

  try {
    const fresh = await getAuditLogs(query);

    if (key) {
      auditLogCache.set(key, {
        data: fresh,
        expiresAt: Date.now() + CACHE_TTL,
      });
    }

    onData(fresh, false);
  } catch (error) {
    onError(error);
  }
}
