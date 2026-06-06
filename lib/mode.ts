import { cookies } from "next/headers";
import type { Mode } from "@/types";

const MODE_COOKIE = "genboard_mode";

export function isMode(value: unknown): value is Mode {
  return value === "pm" || value === "se";
}

/** Default landing per mode: PM → backlog, SE → review queue (same /tasks page, mode-aware). */
export function defaultLandingForMode(mode: Mode): string {
  return mode === "se" ? "/tasks?view=review" : "/tasks";
}

/** Server-side: read the persisted mode preference (defaults to "pm"). */
export function getMode(): Mode {
  const value = cookies().get(MODE_COOKIE)?.value;
  return isMode(value) ? value : "pm";
}

export const MODE_COOKIE_NAME = MODE_COOKIE;
