import { NextResponse } from "next/server";
import { auth } from "./auth";
import type { Session } from "next-auth";
import { getUserByLogin, hasRole, isUserRole } from "@/lib/users";
import type { User } from "@prisma/client";
import type { UserRole } from "@/types";

export function json<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json(data, init);
}

export function unauthorized(message = "Not authenticated") {
  return NextResponse.json({ error: message }, { status: 401 });
}
export function forbidden(message = "Forbidden") {
  return NextResponse.json({ error: message }, { status: 403 });
}
export function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}
export function notFound(message = "Not found") {
  return NextResponse.json({ error: message }, { status: 404 });
}
export function conflict(message: string) {
  return NextResponse.json({ error: message }, { status: 409 });
}
export function serverError(message: string) {
  return NextResponse.json({ error: message }, { status: 500 });
}

/** Returns the session, or null. Routes should branch with `unauthorized()`. */
export async function getSession(): Promise<Session | null> {
  return auth();
}

export interface AuthContext {
  session: Session;
  user: User;
}

export async function requireUser(): Promise<AuthContext | NextResponse> {
  const session = await getSession();
  if (!session) return unauthorized();
  if (!session.githubLogin) {
    return unauthorized("Missing GitHub login. Sign out and sign back in.");
  }

  const user = await getUserByLogin(session.githubLogin);
  if (!user) {
    return unauthorized("User is not registered. Sign out and sign back in.");
  }

  return { session, user };
}

export async function requireRole(
  allowed: UserRole[],
): Promise<AuthContext | NextResponse> {
  const ctx = await requireUser();
  if (ctx instanceof Response) return ctx;

  const role = isUserRole(ctx.user.role) ? ctx.user.role : "pm";
  if (!hasRole(role, allowed)) {
    return forbidden(`Requires one of: ${allowed.join(", ")}`);
  }

  return ctx;
}
