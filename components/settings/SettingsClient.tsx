"use client";

import { useEffect, useState } from "react";
import type { RepoSummary, UserRole, UserSummary } from "@/types";

interface AIConfig {
  settings: { provider: string; model: string; effort: string | null };
  catalog: { name: string; label: string; envKey: string | null }[];
  available: Record<string, boolean>;
  modelsFetchedAt?: number | null;
}

interface Limits {
  maxFiles: number;
  maxFileBytes: number;
  maxTotalBytes: number;
}

interface UsersPayload {
  currentUser: UserSummary;
  users: UserSummary[];
}

interface KeyStatus {
  provider: string;
  label: string;
  envKey: string | null;
  source: "stored" | "env" | "none";
  masked: string | null;
}

interface CliStatus {
  provider: string;
  label: string;
  command: string;
  source: "stored" | "env" | "path" | "none";
  resolvedPath: string | null;
  override: string | null;
}

interface ReposPayload {
  repos: RepoSummary[];
}

export default function SettingsClient() {
  const [ai, setAi] = useState<AIConfig | null>(null);
  const [modelsRefreshing, setModelsRefreshing] = useState(false);
  const [limits, setLimits] = useState<Limits | null>(null);
  const [usersPayload, setUsersPayload] = useState<UsersPayload | null>(null);
  const [keys, setKeys] = useState<KeyStatus[] | null>(null);
  const [keyDrafts, setKeyDrafts] = useState<Record<string, string>>({});
  const [keyBusy, setKeyBusy] = useState<string | null>(null);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [keyTesting, setKeyTesting] = useState<string | null>(null);
  const [keyTests, setKeyTests] = useState<Record<string, { ok: boolean; message: string }>>({});
  const [clis, setClis] = useState<CliStatus[] | null>(null);
  const [cliDrafts, setCliDrafts] = useState<Record<string, string>>({});
  const [cliBusy, setCliBusy] = useState<string | null>(null);
  const [cliError, setCliError] = useState<string | null>(null);
  const [availableRepos, setAvailableRepos] = useState<RepoSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [usersLoading, setUsersLoading] = useState(true);
  const [reposLoading, setReposLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userError, setUserError] = useState<string | null>(null);
  const [repoError, setRepoError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [aiRes, cfgRes] = await Promise.all([
        fetch("/api/ai-config"),
        fetch("/api/config"),
      ]);
      if (!aiRes.ok) throw new Error((await aiRes.json()).error ?? "Failed to load AI config");
      setAi(await aiRes.json());
      if (cfgRes.ok) setLimits((await cfgRes.json()).limits ?? null);

      const usersRes = await fetch("/api/users");
      if (usersRes.ok) {
        setUsersPayload(await usersRes.json());
        const keysRes = await fetch("/api/ai-keys");
        if (keysRes.ok) setKeys((await keysRes.json()).keys ?? []);
        const clisRes = await fetch("/api/cli-paths");
        if (clisRes.ok) setClis((await clisRes.json()).clis ?? []);
        const reposRes = await fetch("/api/repos/available");
        if (reposRes.ok) {
          const reposPayload = (await reposRes.json()) as ReposPayload;
          setAvailableRepos(reposPayload.repos ?? []);
        } else {
          setRepoError((await reposRes.json()).error ?? "Failed to load repositories");
        }
      } else if (usersRes.status !== 403) {
        setUserError((await usersRes.json()).error ?? "Failed to load users");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
      setUsersLoading(false);
      setReposLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function updateRole(userId: string, role: UserRole) {
    setUserError(null);
    const previous = usersPayload;
    if (previous) {
      setUsersPayload({
        ...previous,
        users: previous.users.map((u) => (u.id === userId ? { ...u, role } : u)),
      });
    }

    const res = await fetch(`/api/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    const data = await res.json();
    if (!res.ok) {
      if (previous) setUsersPayload(previous);
      setUserError(data.error ?? "Failed to update role");
      return;
    }
    if (previous) {
      setUsersPayload({
        ...previous,
        users: previous.users.map((u) => (u.id === userId ? data.user : u)),
      });
    }
  }

  async function saveKey(provider: string, key: string) {
    setKeyError(null);
    setKeyBusy(provider);
    try {
      const res = await fetch("/api/ai-keys", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, key }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save key");
      setKeys(data.keys ?? null);
      setKeyDrafts((prev) => ({ ...prev, [provider]: "" }));
      // Reflect new availability in the top-nav switcher and provider list.
      load();
    } catch (e) {
      setKeyError((e as Error).message);
    } finally {
      setKeyBusy(null);
    }
  }

  async function testKey(provider: string, draft: string) {
    setKeyTesting(provider);
    setKeyTests((prev) => {
      const next = { ...prev };
      delete next[provider];
      return next;
    });
    try {
      const res = await fetch("/api/ai-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, key: draft }),
      });
      const data = await res.json();
      const result = res.ok
        ? data.result
        : { ok: false, message: data.error ?? "Test failed" };
      setKeyTests((prev) => ({ ...prev, [provider]: result }));
    } catch (e) {
      setKeyTests((prev) => ({ ...prev, [provider]: { ok: false, message: (e as Error).message } }));
    } finally {
      setKeyTesting(null);
    }
  }

  async function saveCliPath(provider: string, value: string) {
    setCliError(null);
    setCliBusy(provider);
    try {
      const res = await fetch("/api/cli-paths", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, path: value }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save path");
      setClis(data.clis ?? null);
      setCliDrafts((prev) => ({ ...prev, [provider]: "" }));
      // Reflect new availability in the top-nav switcher and provider list.
      load();
    } catch (e) {
      setCliError((e as Error).message);
    } finally {
      setCliBusy(null);
    }
  }

  async function refreshModels() {
    setError(null);
    setModelsRefreshing(true);
    try {
      const res = await fetch("/api/ai-config/refresh", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to refresh models");
      setAi((prev) => (prev ? { ...prev, ...data } : prev));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setModelsRefreshing(false);
    }
  }

  function repoUrl(repo: RepoSummary, suffix = "") {
    return `/api/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}${suffix}`;
  }

  async function enableRepo(repo: RepoSummary) {
    setRepoError(null);
    const res = await fetch("/api/repos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repoFullName: repo.fullName }),
    });
    const data = await res.json();
    if (!res.ok) {
      setRepoError(data.error ?? "Failed to enable repository");
      return;
    }
    setAvailableRepos((prev) =>
      prev.map((item) =>
        item.fullName === repo.fullName
          ? {
              ...item,
              id: data.repository.id,
              enabled: true,
              membershipUserIds: Array.from(
                new Set([...(item.membershipUserIds ?? []), usersPayload?.currentUser.id ?? ""]),
              ).filter(Boolean),
            }
          : item,
      ),
    );
  }

  async function setRepoEnabled(repo: RepoSummary, enabled: boolean) {
    setRepoError(null);
    const previous = availableRepos;
    setAvailableRepos((prev) =>
      prev.map((item) =>
        item.fullName === repo.fullName ? { ...item, enabled } : item,
      ),
    );
    const res = await fetch(repoUrl(repo), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
    const data = await res.json();
    if (!res.ok) {
      setAvailableRepos(previous);
      setRepoError(data.error ?? "Failed to update repository");
    }
  }

  async function toggleRepoAccess(repo: RepoSummary, userId: string, access: boolean) {
    setRepoError(null);
    const previous = availableRepos;
    setAvailableRepos((prev) =>
      prev.map((item) => {
        if (item.fullName !== repo.fullName) return item;
        const ids = new Set(item.membershipUserIds ?? []);
        if (access) ids.add(userId);
        else ids.delete(userId);
        return { ...item, membershipUserIds: Array.from(ids) };
      }),
    );
    const res = await fetch(repoUrl(repo, "/members"), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, access }),
    });
    const data = await res.json();
    if (!res.ok) {
      setAvailableRepos(previous);
      setRepoError(data.error ?? "Failed to update repository access");
      return;
    }
    setAvailableRepos((prev) =>
      prev.map((item) =>
        item.fullName === repo.fullName
          ? { ...item, membershipUserIds: data.membershipUserIds ?? [] }
          : item,
      ),
    );
  }

  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="text-xl font-semibold">Settings</h1>

      <section className="mt-5 rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">AI Provider</h2>
          {ai && (
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-neutral-500">
                Models {formatAgo(ai.modelsFetchedAt)}
              </span>
              <button
                onClick={refreshModels}
                disabled={modelsRefreshing}
                title="Re-pull the latest models from the providers"
                className="rounded-md border border-neutral-700 px-2.5 py-1 text-xs text-neutral-300 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {modelsRefreshing ? "Refreshing…" : "Refresh models"}
              </button>
            </div>
          )}
        </div>
        {loading && <p className="mt-2 text-xs text-neutral-500">Loading...</p>}
        {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
        {ai && (
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
        )}
        <p className="mt-2 text-xs text-neutral-500">
          Switch provider / model / effort from the top-nav controls. Manage API
          keys below; CLI providers authenticate via their own CLI login.
        </p>
        <p className="mt-2 text-xs text-neutral-500">
          Repositories are cached as bare mirrors in <code>~/.genboard/repos</code>;
          each task run gets an isolated worktree in <code>~/.genboard/worktrees</code>.
        </p>
      </section>

      {keys && (
        <section className="mt-6 rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">API Keys</h2>
            <span className="rounded bg-neutral-800 px-2 py-0.5 text-xs text-neutral-400">
              admin
            </span>
          </div>
          {keyError && <p className="mb-2 text-sm text-red-400">{keyError}</p>}
          <ul className="divide-y divide-neutral-800">
            {keys.map((k) => {
              const draft = keyDrafts[k.provider] ?? "";
              const busy = keyBusy === k.provider;
              const testing = keyTesting === k.provider;
              const test = keyTests[k.provider];
              const canTest = draft.trim().length > 0 || k.source !== "none";
              return (
                <li key={k.provider} className="py-3">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm">{k.label}</span>
                    {k.source === "stored" && (
                      <span className="rounded bg-emerald-900/40 px-1.5 py-0.5 text-[11px] text-emerald-300">
                        stored · {k.masked}
                      </span>
                    )}
                    {k.source === "env" && (
                      <span className="rounded bg-sky-900/40 px-1.5 py-0.5 text-[11px] text-sky-300">
                        from {k.envKey} · {k.masked}
                      </span>
                    )}
                    {k.source === "none" && (
                      <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-[11px] text-neutral-400">
                        not set
                      </span>
                    )}
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      type="password"
                      autoComplete="off"
                      placeholder={k.source === "stored" ? "Replace stored key…" : `Paste ${k.envKey}…`}
                      value={draft}
                      onChange={(e) =>
                        setKeyDrafts((prev) => ({ ...prev, [k.provider]: e.target.value }))
                      }
                      className="flex-1 rounded-md border border-neutral-700 bg-neutral-950 px-3 py-1.5 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-neutral-500"
                    />
                    <button
                      onClick={() => saveKey(k.provider, draft)}
                      disabled={busy || draft.trim().length === 0}
                      className="accent-bg rounded-md px-3 py-1.5 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {busy ? "Saving…" : "Save"}
                    </button>
                    <button
                      onClick={() => testKey(k.provider, draft)}
                      disabled={testing || !canTest}
                      title={canTest ? "Validate against the provider (no tokens used)" : "No key to test"}
                      className="rounded-md border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {testing ? "Testing…" : "Test"}
                    </button>
                    {k.source === "stored" && (
                      <button
                        onClick={() => saveKey(k.provider, "")}
                        disabled={busy}
                        className="rounded-md border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800 disabled:opacity-50"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  {test && (
                    <p className={`mt-1.5 text-xs ${test.ok ? "text-emerald-400" : "text-red-400"}`}>
                      {test.ok ? "✓ " : "✗ "}
                      {test.message}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-xs text-neutral-500">
            Stored keys are saved (gitignored) to <code>~/.genboard/secrets.json</code> and
            override the matching environment variable. They take effect immediately — no
            restart needed. Clearing a stored key falls back to its env var if set.
          </p>
        </section>
      )}

      {clis && (
        <section className="mt-6 rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">CLI Paths</h2>
            <span className="rounded bg-neutral-800 px-2 py-0.5 text-xs text-neutral-400">
              admin
            </span>
          </div>
          {cliError && <p className="mb-2 text-sm text-red-400">{cliError}</p>}
          <ul className="divide-y divide-neutral-800">
            {clis.map((c) => {
              const draft = cliDrafts[c.provider] ?? "";
              const busy = cliBusy === c.provider;
              return (
                <li key={c.provider} className="py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm">{c.label}</span>
                    <code className="rounded bg-neutral-800 px-1.5 py-0.5 text-[11px] text-neutral-400">
                      {c.command}
                    </code>
                    {c.source === "stored" && (
                      <span className="rounded bg-emerald-900/40 px-1.5 py-0.5 text-[11px] text-emerald-300">
                        pinned{c.resolvedPath ? "" : " · not found"}
                      </span>
                    )}
                    {c.source === "env" && (
                      <span className="rounded bg-sky-900/40 px-1.5 py-0.5 text-[11px] text-sky-300">
                        from {c.command.toUpperCase()}_BIN{c.resolvedPath ? "" : " · not found"}
                      </span>
                    )}
                    {c.source === "path" && (
                      <span className="rounded bg-emerald-900/40 px-1.5 py-0.5 text-[11px] text-emerald-300">
                        detected
                      </span>
                    )}
                    {c.source === "none" && (
                      <span className="rounded bg-amber-900/40 px-1.5 py-0.5 text-[11px] text-amber-300">
                        not found
                      </span>
                    )}
                  </div>
                  {(c.resolvedPath || c.override) && (
                    <div className="mt-1 truncate font-mono text-[11px] text-neutral-500">
                      {c.resolvedPath ?? c.override}
                    </div>
                  )}
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      type="text"
                      autoComplete="off"
                      spellCheck={false}
                      placeholder={`Absolute path to ${c.command}…`}
                      value={draft}
                      onChange={(e) =>
                        setCliDrafts((prev) => ({ ...prev, [c.provider]: e.target.value }))
                      }
                      className="flex-1 rounded-md border border-neutral-700 bg-neutral-950 px-3 py-1.5 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-neutral-500"
                    />
                    <button
                      onClick={() => saveCliPath(c.provider, draft)}
                      disabled={busy || draft.trim().length === 0}
                      className="accent-bg rounded-md px-3 py-1.5 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {busy ? "Saving…" : "Pin"}
                    </button>
                    {c.source === "stored" && (
                      <button
                        onClick={() => saveCliPath(c.provider, "")}
                        disabled={busy}
                        className="rounded-md border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800 disabled:opacity-50"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-xs text-neutral-500">
            Genboard auto-detects CLIs on <code>PATH</code> (plus <code>~/.local/bin</code>
            and the service node&apos;s bin dir). Pin an absolute path here only to override
            that — saved to <code>~/.genboard/cli-paths.json</code>, effective immediately,
            ahead of the <code>&lt;CMD&gt;_BIN</code> env var.
          </p>
        </section>
      )}

      {usersPayload && (
        <section className="mt-6 rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Repositories</h2>
            <span className="rounded bg-neutral-800 px-2 py-0.5 text-xs text-neutral-400">
              admin
            </span>
          </div>
          {repoError && <p className="mb-2 text-sm text-red-400">{repoError}</p>}
          {reposLoading ? (
            <p className="text-xs text-neutral-500">Loading repositories...</p>
          ) : (
            <ul className="divide-y divide-neutral-800">
              {availableRepos.map((repo) => {
                const memberIds = new Set(repo.membershipUserIds ?? []);
                const localStatus = repo.cloned ? "cached locally" : "not cached yet";
                return (
                  <li key={repo.fullName} className="py-3">
                    <div className="flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-mono text-sm">{repo.fullName}</div>
                        <div className="text-xs text-neutral-500">
                          {repo.private ? "private" : "public"} · default {repo.defaultBranch} · {localStatus}
                        </div>
                      </div>
                      {repo.enabled ? (
                        <button
                          onClick={() => setRepoEnabled(repo, false)}
                          className="rounded-md border border-neutral-700 px-2.5 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800"
                        >
                          Disable
                        </button>
                      ) : (
                        <button
                          onClick={() => enableRepo(repo)}
                          className="accent-bg rounded-md px-2.5 py-1.5 text-xs font-medium text-white"
                        >
                          Enable
                        </button>
                      )}
                    </div>
                    {repo.enabled && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {usersPayload.users.map((user) => (
                          <label
                            key={user.id}
                            className="inline-flex items-center gap-1.5 rounded bg-neutral-950 px-2 py-1 text-xs text-neutral-300"
                          >
                            <input
                              type="checkbox"
                              checked={user.role === "admin" || memberIds.has(user.id)}
                              disabled={user.role === "admin"}
                              onChange={(e) => toggleRepoAccess(repo, user.id, e.target.checked)}
                            />
                            @{user.githubLogin}
                          </label>
                        ))}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-2 text-xs text-neutral-500">
            Enabled repositories appear in the repo switcher for admins and assigned users.
            Repo operations use your local Genboard session and managed cache.
          </p>
        </section>
      )}

      {usersPayload && (
        <section className="mt-6 rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Users</h2>
            <span className="rounded bg-neutral-800 px-2 py-0.5 text-xs text-neutral-400">
              admin
            </span>
          </div>
          {userError && <p className="mb-2 text-sm text-red-400">{userError}</p>}
          {usersLoading ? (
            <p className="text-xs text-neutral-500">Loading users...</p>
          ) : (
            <ul className="divide-y divide-neutral-800">
              {usersPayload.users.map((user) => (
                <li key={user.id} className="flex items-center gap-3 py-3">
                  {user.avatarUrl && (
                    <img
                      src={user.avatarUrl}
                      alt=""
                      className="h-8 w-8 rounded-full bg-neutral-800"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      @{user.githubLogin}
                    </div>
                    <div className="truncate text-xs text-neutral-500">
                      {user.name ?? user.email ?? "No profile details"}
                    </div>
                  </div>
                  <select
                    value={user.role}
                    onChange={(e) => updateRole(user.id, e.target.value as UserRole)}
                    className="rounded-md border border-neutral-700 bg-neutral-950 px-2.5 py-1.5 text-xs focus:outline-none"
                  >
                    <option value="pm">PM</option>
                    <option value="se">SE</option>
                    <option value="admin">Admin</option>
                  </select>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs text-neutral-500">
            Users appear here after they sign in with GitHub.
          </p>
        </section>
      )}
    </div>
  );
}

function formatAgo(ts: number | null | undefined): string {
  if (!ts) return "not loaded yet";
  const secs = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (secs < 60) return "updated just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `updated ${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `updated ${hrs}h ago`;
  return `updated ${Math.round(hrs / 24)}d ago`;
}
