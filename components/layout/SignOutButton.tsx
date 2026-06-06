"use client";

import { signOut } from "next-auth/react";

export default function SignOutButton() {
  return (
    <button
      onClick={() => signOut({ redirectTo: "/login" })}
      className="rounded-md px-2 py-1.5 text-sm text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
    >
      Sign out
    </button>
  );
}
