# CLAUDE.md — Genboard

Orientation for a fresh session. Read this first, then `PLAN.md` for full design and
`README.md` for the generic setup.

## What this is

No-code app-dev tool: a **Project Manager + Senior Engineer** workflow over an AI
engineer. Manage a backlog, run an AI provider in an isolated git worktree, stream
its reasoning, review the produced diff (with an AI critique), then **Approve & Open PR**
(gated behind SE approval). Next.js 14 (App Router) · NextAuth v5 (GitHub OAuth, JWT) ·
Prisma + SQLite · Vercel AI SDK · `simple-git` · `@octokit/rest` · Tailwind.

## How it runs ON THIS MACHINE (read before "starting" anything)

It is **already running** as an always-on **systemd user service** — do not `npm run dev`
yourself; the service owns the web port.

| Thing | Value |
|---|---|
| Service | `genboard` (user unit: `~/.config/systemd/user/genboard.service`), enabled, linger on → survives logout/reboot |
| Command | `next dev -p 47813` via absolute nvm node **v24.12.0** (hardcoded in the unit) |
| Port | **47813** (chosen unusual/unused; trivia app uses 8723) |
| Hot reload | **Yes** — `next dev` Fast Refresh. Editing source files applies live; **no restart needed** for code changes. |
| Public URL | `https://genboard.vjtv.dev` via Cloudflare Tunnel |
| Repo | `/home/vncntjms/genboard`, remote `git@github.com:vjtvalero/genboard.git` |

### Operating it
```bash
systemctl --user status genboard        # state
systemctl --user restart genboard       # hard restart (needed after .env changes)
journalctl --user -u genboard -f        # live logs
```
- **Code edits** → hot-reload automatically. **`.env` edits** → `systemctl --user restart genboard`.
  **Unit file edits** → `systemctl --user daemon-reload && systemctl --user restart genboard`.
- Node version is pinned by absolute path in the unit; if nvm changes, edit `ExecStart`.

## Config & data (this machine)

- Secrets live ONLY in the **gitignored `.env`** (not `.env.local`). Never commit them.
  `AUTH_URL` points at the Cloudflare public URL so OAuth redirects do not fall back to localhost.
- GitHub OAuth is used locally for sign-in, repo discovery, clone/fetch, push, and PR creation.
- SQLite DB: `file:/home/vncntjms/.genboard/genboard.db` (`DATABASE_URL`). The Windows path
  from upstream `.env.example` was changed to this Linux path.
- Managed repo mirrors live under `~/.genboard/repos/<owner>/<repo>.git`; per-run
  editable worktrees live under `~/.genboard/worktrees/<taskId>/<runId>`.
- Execution runs/logs are persisted in SQLite. Execution starts inside the local API/SSE
  request and tails `ExecutionLog` rows so refreshes can reconnect while the same local
  process is still running.
- Users are persisted in SQLite. The first signed-in user becomes admin;
  `GENBOARD_ADMIN_GITHUB_LOGINS=login1,login2` can force admin role assignment.
  PM/SE are switchable workflow modes; admin is only for settings management.
- Repositories are persisted/enabled in SQLite and exposed by membership:
  admins manage them in Settings, PM/SE users only see assigned repositories.
- AI selection persists at `~/.genboard/ai-config.json`; `.env` `AI_PROVIDER`/`AI_CLAUDE_MODEL`
  only seed the first run. Current seed: `claude-cli` / `claude-sonnet-4-6`.
- Schema is managed with **`prisma db push`** (no migration files): `npm run db:push`.

### External pieces owned by the user (may be in progress)
1. GitHub OAuth app callback URL should be
   `https://genboard.vjtv.dev/api/auth/callback/github` for the tunneled service.

## Code map

- `app/` — App Router. `(auth)` login, `(app)` authed UI, `api/` route handlers (SSE streaming).
- `lib/ai/` — provider adapters (`claude-api`, `claude-cli`, `openai`, `google`, `codex`, `agy`);
  two shapes: JSON-patch returners vs. agentic CLIs that edit the working tree directly.
- `lib/git/`, `lib/github/`, `lib/workspace/` — repo ops, Octokit, managed mirror/worktree handling.
- `lib/auth.ts` — NextAuth v5 config. `middleware.ts` — auth gate (the 307 → `/login` redirect).
- `prisma/schema.prisma` — data model. `types/` — shared + next-auth type augmentation.

## Gotchas

- Don't start a second dev server on **47813** — the service holds it.
- A plain `npm install` works here (upstream README suggests `--legacy-peer-deps`; not needed).
- `next@14.2.15` has a flagged advisory + a few audit findings — fine for local, upgrade before real exposure.
