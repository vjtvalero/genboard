import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

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
