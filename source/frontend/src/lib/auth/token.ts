// Reading an access token, with no browser or Node API in sight: the
// middleware (edge runtime) and the browser both go through here.
//
// Nothing in this file verifies anything. The signature is checked by the
// backend on every request - all the frontend needs to know is who the token
// says you are and whether it has run out, so it can send you to /auth
// instead of firing off calls that are bound to come back 401.

export const SESSION_COOKIE = "isp_access_token";

export type Session = {
  accessToken: string;
  user: { id: string; email: string | null };
  // Seconds since the epoch, the way the `exp` claim stores it.
  expiresAt: number;
};

function decodeSegment(segment: string): unknown {
  // JWT payloads are base64url: atob wants plain base64.
  const base64 = segment.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");

  return JSON.parse(
    decodeURIComponent(
      atob(padded)
        .split("")
        .map((c) => `%${c.charCodeAt(0).toString(16).padStart(2, "0")}`)
        .join(""),
    ),
  );
}

// A clock that is a little behind the server's would otherwise send the last
// few seconds of requests off with a token the backend has already retired.
const EXPIRY_SKEW_SECONDS = 10;

// null for anything unusable: not a JWT, no subject, already expired.
export function readToken(token: string | undefined | null): Session | null {
  if (!token) return null;

  const [, payload] = token.split(".");
  if (!payload) return null;

  try {
    const claims = decodeSegment(payload) as {
      sub?: unknown;
      email?: unknown;
      exp?: unknown;
    };

    if (typeof claims.sub !== "string" || typeof claims.exp !== "number") {
      return null;
    }
    if (claims.exp - EXPIRY_SKEW_SECONDS <= Date.now() / 1000) return null;

    return {
      accessToken: token,
      user: {
        id: claims.sub,
        email: typeof claims.email === "string" ? claims.email : null,
      },
      expiresAt: claims.exp,
    };
  } catch {
    return null;
  }
}
