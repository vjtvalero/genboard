import { NextResponse } from "next/server";
import { auth } from "./auth";
import type { Session } from "next-auth";

export function json<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json(data, init);
}

export function unauthorized(message = "Not authenticated") {
  return NextResponse.json({ error: message }, { status: 401 });
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
