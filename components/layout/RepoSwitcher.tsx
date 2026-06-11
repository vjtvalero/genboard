"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { RepoSummary } from "@/types";

export default function RepoSwitcher({ selectedRepo }: { selectedRepo: string | null }) {
  const router = useRouter();
  const [repos, setRepos] = useState<RepoSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/repos")
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error ?? "Failed to load repos");
        return r.json();
      })
      .then((data) => {
        if (!cancelled) setRepos(data.repos ?? []);
      })
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  function selectRepo(fullName: string) {
    document.cookie = `genboard_repo=${encodeURIComponent(fullName)}; path=/; max-age=31536000`;
    router.refresh();
  }

  if (loading) {
    return <div className="text-sm text-neutral-500">Loading repos…</div>;
  }
  if (error) {
    return <div className="text-sm text-red-400">Repos: {error}</div>;
  }

  return (
    <select
      value={selectedRepo ?? ""}
      onChange={(e) => selectRepo(e.target.value)}
      className="max-w-xs rounded-md border border-neutral-700 bg-neutral-900 px-2.5 py-1.5 text-sm text-neutral-100 focus:outline-none focus:ring-1 focus:ring-neutral-500"
    >
      <option value="" disabled>
        Select a repository…
      </option>
      {repos.map((r) => (
        <option key={r.fullName} value={r.fullName}>
          {r.cloned ? "● " : "○ "}
          {r.fullName}
        </option>
      ))}
    </select>
  );
}
