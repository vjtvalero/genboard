# Genboard

No-code app development tool — a **Project Manager + Senior Engineer** collaboration
over an AI engineer. Manage a backlog, run the AI in isolated git worktrees, stream its
reasoning live, review the produced diff (with an AI critique), then **Approve & Open PR**
— opens a pull request gated behind Senior-Engineer approval.

See [`PLAN.md`](./PLAN.md) for the full design.

## Stack

Next.js 14 (App Router) · NextAuth v5 (GitHub OAuth, JWT strategy) · Prisma + SQLite ·
Vercel AI SDK + `@ai-sdk/anthropic` · `simple-git` · `@octokit/rest` ·
`react-diff-view` · Tailwind CSS.

## Setup

1. **Install** (already done if `node_modules` exists):

   ```bash
   npm install --legacy-peer-deps
   ```

2. **GitHub OAuth App** — create one at
   <https://github.com/settings/developers>:
   - Homepage URL: `http://localhost:3000`
   - Callback URL: `http://localhost:3000/api/auth/callback/github`
   - Scopes used: `read:user user:email repo`

   OAuth is used locally for sign-in, repository discovery, clone/fetch, push,
   and pull-request creation.

3. **Secrets** — create `.env.local` (it overrides the committed `.env` placeholders):

   ```bash
   AUTH_SECRET=            # npx auth secret
   AUTH_GITHUB_ID=         # OAuth App client id
   AUTH_GITHUB_SECRET=     # OAuth App client secret
   DATABASE_URL="file:C:/Users/<you>/.genboard/genboard.db"
   AI_PROVIDER=claude-api  # or claude-cli
   AI_CLAUDE_MODEL=claude-sonnet-4-6
   ANTHROPIC_API_KEY=sk-ant-...
   ```

4. **Database** — create the SQLite schema:

   ```bash
   npx prisma db push
   ```

5. **Run**:

   ```bash
   npm run dev
   ```

   Open <http://localhost:3000> → it redirects to `/login`.

## First-run flow

1. Sign in with GitHub.
2. The first signed-in user becomes admin. Admins manage users and repository
   access from **Settings**.
3. Admins enable repositories and assign user access from **Settings → Repositories**.
4. Pick an enabled repo in the top switcher.
5. **PM mode**: create a task, select a branch, add a prompt → open it →
   **Execute** → watch the stream → **View Diff →**.
6. On first execution, Genboard caches a bare mirror at
   `~/.genboard/repos/<owner>/<repo>.git` and creates an isolated worktree under
   `~/.genboard/worktrees/<taskId>/<runId>`.
   Execution is queued in the database and streamed from persisted log rows, so
   browser refreshes can reconnect to an active run.
7. **SE mode**: open the result diff → *Run AI Review* → *Approve* or
   *Request Changes*.
8. **Approve & Open PR** (enabled only after SE approval) → commits to a
   `genboard/<resultId>` branch, pushes it, and opens a GitHub pull request
   against the selected task branch.

PM and SE are switchable workflow modes in the header, and either mode can
execute a task locally. Admin is only for settings/user/repository management.
You can force admin assignment for specific GitHub logins with
`GENBOARD_ADMIN_GITHUB_LOGINS=login1,login2`.

Repositories are also persisted in the local database. Only enabled repositories
appear in the switcher, and PM/SE users only see repositories assigned to them.
Admins can see every enabled repository.

## AI provider / model / effort

Pick the **provider → model → effort** from the switcher in the top nav. The
choice is a global default stored in `~/.genboard/ai-config.json`. Six providers
across two execution shapes (`lib/ai/`):

| Provider | Shape | Auth | Notes |
|---|---|---|---|
| `claude-api` | API (returns JSON patches) | `ANTHROPIC_API_KEY` | Vercel AI SDK + Anthropic; effort = adaptive thinking |
| `openai` | API | `OPENAI_API_KEY` | effort = `reasoningEffort` (reasoning models) |
| `google` | API | `GOOGLE_GENERATIVE_AI_API_KEY` | effort = Gemini thinking budget |
| `claude-cli` | CLI (returns JSON patches) | `claude` login | headless `claude --print` |
| `codex` | CLI (**edits the working tree**) | `codex` login | `codex exec`; diff captured from git afterward |
| `agy` | CLI (**edits the working tree**) | `agy` login | Google Antigravity `agy -p` |

Effort levels are model-specific — the switcher only offers (and only sends) a
level the selected model supports. `AI_PROVIDER` / `AI_CLAUDE_MODEL` in `.env`
only seed the first run; after that the switcher owns the selection.

For the agentic CLIs (`codex`, `agy`) the agent edits files itself; Genboard
snapshots the git state before the run and derives the diff/rollback from the
working tree afterward.

Repositories are cached by Genboard as bare mirrors under `~/.genboard/repos`.
Task runs use temporary editable worktrees under `~/.genboard/worktrees`, so you
do not need to point the app at existing clones.

Execution runs and terminal output are persisted in SQLite (`ExecutionRun` and
`ExecutionLog`). Execution runs in the local web process and uses your local
provider/API/CLI setup; the browser tails stored events so refreshes can
reconnect to an active run.

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Production build (runs `prisma generate`) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:push` | Sync Prisma schema → SQLite |

## Running on this machine

> This host runs Genboard differently from the generic **Setup** above: secrets are in
> `.env` (not `.env.local`), the port is **47813** (not 3000), and it runs as an always-on
> service rather than a manual `npm run dev`. See [`CLAUDE.md`](./CLAUDE.md) for the full
> operator notes.

- **Always-on service.** Managed by a systemd **user** unit
  `~/.config/systemd/user/genboard.service` (enabled, linger on → survives reboot/logout).
  It runs `next dev -p 47813` with an absolute nvm node path, so **Fast Refresh stays
  active** — edit source and it hot-reloads with no restart.

  ```bash
  systemctl --user status genboard      # state
  systemctl --user restart genboard     # hard restart (needed after .env changes)
  journalctl --user -u genboard -f      # live logs
  ```

- **Port:** `47813` (local: <http://localhost:47813>).
- **Public URL:** <https://genboard.vjtv.dev> via Cloudflare Tunnel.
- **Env (gitignored `.env`):** local secrets and provider settings. `AUTH_URL`
  should be the public URL when using the tunnel.
- **Database:** `file:/home/vncntjms/.genboard/genboard.db`; schema applied with
  `npm run db:push`.
- **GitHub OAuth callback** should match the public URL:
  `https://genboard.vjtv.dev/api/auth/callback/github`.
