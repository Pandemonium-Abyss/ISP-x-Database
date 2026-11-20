import { NextRequest, NextResponse } from "next/server";

import { SESSION_COOKIE, readToken } from "@/lib/auth/token";

export default async function proxy(request: NextRequest) {
  // Only whether there is a live token, never whether it is genuine - the
  // backend verifies the signature on every call. A forged one gets you a
  // page that then fails every request it makes.
  const session = readToken(request.cookies.get(SESSION_COOKIE)?.value);

  if (!session) {
    const loginUrl = new URL("/auth", request.url);
    const response = NextResponse.redirect(loginUrl);
    // An expired token would otherwise sit there and send them straight back.
    response.cookies.delete(SESSION_COOKIE);
    return response;
  }

  return NextResponse.next({ request });
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/request-table/:path*",
    "/announcement/:path*",
  ],
};
