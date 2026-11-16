import { getSession } from "@/lib/auth/session";

// signed in user id, null if no session or lookup fail
export async function getUserId(): Promise<string | null> {
  try {
    return getSession()?.user.id ?? null;
  } catch {
    return null;
  }
}

// offset and limit from first arg, null if no limit
export function getPaging(
  args: unknown[],
): { offset: number; limit: number } | null {
  const { limit, offset } = (args[0] ?? {}) as {
    limit?: number;
    offset?: number;
  };

  return limit === undefined ? null : { offset: offset ?? 0, limit };
}

// ignore pagination (offset and limit) but keep all other params
export function withoutPagination<
  T extends { limit?: number; offset?: number },
>(params?: T): string {
  const rest = { ...params } as Record<string, unknown>;
  delete rest.limit;
  delete rest.offset;
  return JSON.stringify(rest);
}
