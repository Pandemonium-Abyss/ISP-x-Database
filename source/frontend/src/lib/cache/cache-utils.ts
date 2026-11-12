import { getSession } from "@/lib/auth/session";

// signed in user id, null if no session or lookup fail
export async function getUserId(): Promise<string | null> {
  try {
    return getSession()?.user.id ?? null;
  } catch {
    return null;
  }
}

// ignore pagination (offset and limit) but keep all other params
export function withoutPagination<
  T extends { limit?: number; offset?: number },
>(params?: T): string {
  const { limit, offset, ...rest } = params ?? ({} as T);
  return JSON.stringify(rest);
}
