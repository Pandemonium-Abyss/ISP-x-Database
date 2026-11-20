"use client";

import { SESSION_COOKIE, readToken, type Session } from "@/lib/auth/token";

export type { Session };

// The token is kept in a cookie rather than localStorage because the Next
// middleware has to see it to guard a page before it renders. It is not
// HttpOnly - the page that signs you in is the one that stores it - which is
// where the Supabase browser client kept its session too.
function writeCookie(value: string, maxAgeSeconds: number) {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie =
    `${SESSION_COOKIE}=${value}; Path=/; Max-Age=${maxAgeSeconds}` +
    `; SameSite=Lax${secure}`;
}

function readCookie(): string | null {
  if (typeof document === "undefined") return null;

  const match = document.cookie
    .split("; ")
    .find((pair) => pair.startsWith(`${SESSION_COOKIE}=`));

  return match ? match.slice(SESSION_COOKIE.length + 1) : null;
}

// Synchronous, unlike the Supabase client it replaces: the token is right
// there in the cookie, so nothing can hang waiting for it.
export function getSession(): Session | null {
  return readToken(readCookie());
}

export function clearSession() {
  writeCookie("", 0);
}

type LoginResponse = {
  access_token: string;
  expires_in: number;
  user_id: string;
  email: string;
};

const API_URL = (
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8100"
).replace(/\/+$/, "");

// POST /auth/login on the backend, which hands back a token signed with the
// key only it holds. Throws with whatever the backend said went wrong.
export async function signInWithPassword(
  email: string,
  password: string,
): Promise<Session> {
  const response = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    const detail = await response
      .json()
      .then((body) => (typeof body?.detail === "string" ? body.detail : null))
      .catch(() => null);

    throw new Error(detail ?? "Could not sign in");
  }

  const body = (await response.json()) as LoginResponse;

  writeCookie(body.access_token, body.expires_in);

  const session = readToken(body.access_token);
  if (!session) throw new Error("The server returned a token we cannot read");

  return session;
}
