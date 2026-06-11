"use client";

import { useRouter } from "next/navigation";
import type { Mode, UserRole } from "@/types";

export default function ModeSwitcher({
  mode,
  role,
  canSwitch,
}: {
  mode: Mode;
  role: UserRole;
  canSwitch: boolean;
}) {
  const router = useRouter();

  function setMode(next: Mode) {
    if (next === mode) return;
    document.cookie = `genboard_mode=${next}; path=/; max-age=31536000`;
    router.push(next === "se" ? "/tasks?view=review" : "/tasks");
    router.refresh();
  }

  if (!canSwitch) {
    return (
      <div className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm font-medium text-neutral-300">
        {role === "se" ? "SE" : "PM"}
      </div>
    );
  }

  return (
    <div className="flex items-center rounded-lg border border-neutral-700 bg-neutral-900 p-0.5 text-sm">
      {(["pm", "se"] as Mode[]).map((m) => {
        const active = m === mode;
        return (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={
              "rounded-md px-3 py-1 font-medium transition " +
              (active
                ? "accent-bg text-white"
                : "text-neutral-400 hover:text-neutral-100")
            }
            title={m === "pm" ? "Project Manager" : "Senior Engineer"}
          >
            {m.toUpperCase()}
          </button>
        );
      })}
    </div>
  );
}
