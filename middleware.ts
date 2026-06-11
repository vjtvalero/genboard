import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";
import { NextResponse } from "next/server";

// Use the edge-safe config (no Prisma) so middleware can run in the Edge
// Runtime. The Prisma-touching `jwt` callback in lib/auth.ts is intentionally
// excluded here — the token already carries userId/role from when it was minted.
const { auth } = NextAuth(authConfig);

// Protect all (app) routes; redirect unauthenticated users to /login.
export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const { pathname } = req.nextUrl;
  const isLoginRoute = pathname === "/login";

  if (!isLoggedIn && !isLoginRoute) {
    return NextResponse.redirect(new URL("/login", req.nextUrl.origin));
  }
  if (isLoggedIn && isLoginRoute) {
    return NextResponse.redirect(new URL("/tasks", req.nextUrl.origin));
  }
  return NextResponse.next();
});

export const config = {
  // Run on everything except API routes (they self-guard) and static assets.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
