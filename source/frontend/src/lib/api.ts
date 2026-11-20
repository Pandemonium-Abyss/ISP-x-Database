import { getSession } from "@/lib/auth/session";

// Trailing slashes are stripped so a base of "http://localhost:8100/" and
// "http://localhost:8100" behave the same: everyone's source/.env differs.
const API_URL = (
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8100"
).replace(/\/+$/, "");

const TIMEOUT_MS = 15_000;

export async function apiFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  // The timer covers the request itself; reading the session is a cookie
  // lookup now, so there is nothing left to race it against.
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  const signal = init.signal
    ? AbortSignal.any([init.signal, timeout])
    : timeout;

  const session = getSession();

  const headers = new Headers(init.headers);
  if (session) {
    headers.set("Authorization", `Bearer ${session.accessToken}`);
  }

  const url = `${API_URL}/${path.replace(/^\/+/, "")}`;

  return fetch(url, { ...init, headers, signal });
}

export function apiSendJson(
  path: string,
  method: "POST" | "PUT",
  body: object,
): Promise<Response> {
  return apiFetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// FastAPI puts the useful message in `detail`, and the member rules lean on it
// ("A Lab Owner cannot be deactivated"), so surface that rather than the status.
export async function apiDetail(res: Response, fallback: string) {
  try {
    const body = await res.json();
    if (typeof body?.detail === "string") return body.detail;
  } catch {
    // no JSON body, fall through to the fallback
  }
  return fallback;
}

// Throws with the server's `detail` so callers can show it as is.
export async function apiOrThrow(res: Response, fallback: string) {
  if (!res.ok) throw new Error(await apiDetail(res, fallback));
  return res;
}
