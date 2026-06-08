# CLAUDE.md — Genboard

Orientation for a fresh session. Read this first, then `PLAN.md` for full design and
`README.md` for the generic setup.

## What this is

No-code app-dev tool: a **Project Manager + Senior Engineer** workflow over an AI
engineer. Manage a backlog, run an AI provider on a linked **local git repo**, stream
its reasoning, review the produced diff (with an AI critique), then **Approve & Push**
(gated behind SE approval). Next.js 14 (App Router) · NextAuth v5 (GitHub OAuth, JWT) ·
Prisma + SQLite · Vercel AI SDK · `simple-git` · `@octokit/rest` · Tailwind.

## How it runs ON THIS MACHINE (read before "starting" anything)

It is **already running** as an always-on **systemd user service** — do not `npm run dev`
yourself; the service owns the port.

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

### Cloudflare Tunnel
Runs as the **system** service `cloudflared.service` with `tunnel run --token …`
(token-managed). Tunnel ID `a9a17576-a6e3-4753-bb38-c1350cac47b4`. Ingress is configured
**in the Cloudflare Zero Trust dashboard** (Networks → Tunnels → Public Hostnames),
**not** in a local `config.yml` — there is no local cloudflared config/cert on this box.
Public hostname maps `genboard.vjtv.dev → HTTP localhost:47813`.

## Config & data (this machine)

- Secrets live ONLY in the **gitignored `.env`** (not `.env.local`). Never commit them.
  Notable keys set for the tunnel: `AUTH_TRUST_HOST=true`, `AUTH_URL=https://genboard.vjtv.dev`.
- SQLite DB: `file:/home/vncntjms/.genboard/genboard.db` (`DATABASE_URL`). The Windows path
  from upstream `.env.example` was changed to this Linux path.
- AI selection persists at `~/.genboard/ai-config.json`; `.env` `AI_PROVIDER`/`AI_CLAUDE_MODEL`
  only seed the first run. Current seed: `claude-cli` / `claude-sonnet-4-6`.
- Schema is managed with **`prisma db push`** (no migration files): `npm run db:push`.

### External pieces owned by the user (may be in progress)
1. Cloudflare public-hostname ingress (dashboard) → `genboard.vjtv.dev` → `localhost:47813`.
2. GitHub OAuth app (`AUTH_GITHUB_ID` `Ov23lij7qnxlys677QB0`) callback URL must be
   `https://genboard.vjtv.dev/api/auth/callback/github` or login fails.

## Code map

- `app/` — App Router. `(auth)` login, `(app)` authed UI, `api/` route handlers (SSE streaming).
- `lib/ai/` — provider adapters (`claude-api`, `claude-cli`, `openai`, `google`, `codex`, `agy`);
  two shapes: JSON-patch returners vs. agentic CLIs that edit the working tree directly.
- `lib/git/`, `lib/github/`, `lib/workspace/` — repo ops, Octokit, linked-repo handling.
- `lib/auth.ts` — NextAuth v5 config. `middleware.ts` — auth gate (the 307 → `/login` redirect).
- `prisma/schema.prisma` — data model. `types/` — shared + next-auth type augmentation.

## Gotchas

- Don't start a second dev server on **47813** — the service holds it.
- A plain `npm install` works here (upstream README suggests `--legacy-peer-deps`; not needed).
- `next@14.2.15` has a flagged advisory + a few audit findings — fine for local, upgrade before real exposure.
