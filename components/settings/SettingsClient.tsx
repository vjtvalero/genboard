"use client";

import { useEffect, useState } from "react";
import type { RepoSummary } from "@/types";

interface AIConfig {
  settings: { provider: string; model: string; effort: string | null };
  catalog: { name: string; label: string; envKey: string | null }[];
  available: Record<string, boolean>;
}
interface Limits {
  maxFiles: number;
  maxFileBytes: number;
  maxTotalBytes: number;
}

function RepoRow({
  repo,
  onChange,
}: {
  repo: RepoSummary;
  onChange: () => void;
}) {
  const [path, setPath] = useState(repo.linkedPath ?? "");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function validate() {
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch("/api/workspace/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ localPath: path }),
      });
      const data = await res.json();
      setStatus(data.ok ? "✓ Valid git repository" : `✗ ${data.reason}`);
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch("/api/workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoFullName: repo.fullName, localPath: path }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus(`✗ ${data.error}`);
      } else {
        setStatus("✓ Linked");
        onChange();
      }
    } finally {
      setBusy(false);
    }
  }

  async function unlink() {
    setBusy(true);
    try {
      await fetch("/api/workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoFullName: repo.fullName, remove: true }),
      });
      setPath("");
      setStatus(null);
      onChange();
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-3">
      <div className="flex items-center gap-2">
        <span className={repo.linkedPath ? "text-emerald-400" : "text-neutral-600"}>●</span>
        <span className="font-mono text-sm">{repo.fullName}</span>
        {repo.private && (
          <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] text-neutral-400">
            private
          </span>
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <input
          value={path}
          onChange={(e) => setPath(e.target.value)}
          placeholder="C:\path\to\local\clone"
          className="min-w-[280px] flex-1 rounded-md border border-neutral-700 bg-neutral-950 px-2.5 py-1.5 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-neutral-500"
        />
        <button
          onClick={validate}
          disabled={busy || !path}
          className="rounded-md border border-neutral-700 px-2.5 py-1.5 text-xs hover:bg-neutral-800 disabled:opacity-50"
        >
          Validate
        </button>
        <button
          onClick={save}
          disabled={busy || !path}
          className="accent-bg rounded-md px-2.5 py-1.5 text-xs font-medium text-white disabled:opacity-50"
        >
          Save
        </button>
        {repo.linkedPath && (
          <button
            onClick={unlink}
            disabled={busy}
            className="rounded-md border border-neutral-700 px-2.5 py-1.5 text-xs text-rose-300 hover:bg-neutral-800 disabled:opacity-50"
          >
            Unlink
          </button>
        )}
      </div>
      {status && <p className="mt-1.5 text-xs text-neutral-400">{status}</p>}
    </li>
  );
}

export default function SettingsClient() {
  const [repos, setRepos] = useState<RepoSummary[]>([]);
  const [ai, setAi] = useState<AIConfig | null>(null);
  const [limits, setLimits] = useState<Limits | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  async function load() {
    try {
      const [reposRes, aiRes, cfgRes] = await Promise.all([
        fetch("/api/repos"),
        fetch("/api/ai-config"),
        fetch("/api/config"),
      ]);
      if (!reposRes.ok) throw new Error((await reposRes.json()).error ?? "Failed to load repos");
      setRepos((await reposRes.json()).repos ?? []);
      if (aiRes.ok) setAi(await aiRes.json());
      if (cfgRes.ok) setLimits((await cfgRes.json()).limits ?? null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = repos.filter((r) =>
    r.fullName.toLowerCase().includes(filter.toLowerCase()),
  );

  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="text-xl font-semibold">Settings</h1>

      {/* AI config — selection lives in the top-nav switcher; this is a summary */}
      <section className="mt-5 rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
        <h2 className="text-sm font-semibold">AI Provider</h2>
        {ai ? (
          <>
            <dl className="mt-2 grid grid-cols-2 gap-y-1 text-sm">
              <dt className="text-neutral-500">Active</dt>
              <dd className="font-mono">
                {ai.settings.provider} · {ai.settings.model}
                {ai.settings.effort ? ` · ${ai.settings.effort}` : ""}
              </dd>
              {limits && (
                <>
                  <dt className="text-neutral-500">File limits</dt>
                  <dd className="font-mono text-xs">
                    {limits.maxFiles} files · {Math.round(limits.maxFileBytes / 1000)}KB/file
                  </dd>
                </>
              )}
            </dl>
            <ul className="mt-3 space-y-1 text-xs">
              {ai.catalog.map((p) => (
                <li key={p.name} className="flex items-center gap-2">
                  <span className={ai.available[p.name] ? "text-emerald-400" : "text-neutral-600"}>
                    ●
                  </span>
                  <span className="font-mono">{p.label}</span>
                  <span className="text-neutral-500">
                    {p.envKey
                      ? ai.available[p.name]
                        ? `${p.envKey} set`
                        : `${p.envKey} missing`
                      : "CLI login"}
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="mt-2 text-xs text-neutral-500">Loading…</p>
        )}
        <p className="mt-2 text-xs text-neutral-500">
          Switch provider / model / effort from the top-nav controls. API keys live
          in <code>.env.local</code>; restart the dev server after changing them.
        </p>
      </section>

      {/* Repo → local path mappings */}
      <section className="mt-6">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Linked Repositories</h2>
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter…"
            className="rounded-md border border-neutral-700 bg-neutral-950 px-2.5 py-1 text-xs focus:outline-none"
          />
        </div>
        <p className="mb-3 text-xs text-neutral-500">
          Link each GitHub repo to a local clone. Genboard reads and writes files
          there; commits and pushes use that working tree.
        </p>

        {loading && <p className="text-sm text-neutral-500">Loading repositories…</p>}
        {error && <p className="text-sm text-red-400">{error}</p>}

        <ul className="space-y-2">
          {filtered.map((r) => (
            <RepoRow key={r.fullName} repo={r} onChange={load} />
          ))}
        </ul>
      </section>
    </div>
  );
}
