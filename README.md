# Genboard

No-code app development tool — a **Project Manager + Senior Engineer** collaboration
over an AI engineer. Manage a backlog, run the AI on a linked local repo, stream its
reasoning live, review the produced diff (with an AI critique), then **Approve & Push**
— gated behind Senior-Engineer approval.

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
2. **Settings** → paste the local path of a clone of one of your repos →
   *Validate* → *Save* (it must be a git repository).
3. Pick the repo in the top switcher.
4. **PM mode**: create a task with a prompt → open it → **Execute** → watch the
   stream → **View Diff →**.
5. **SE mode**: open the result diff → *Run AI Review* → *Approve* or
   *Request Changes*.
6. **Approve & Push** (enabled only after SE approval) → commits and pushes to
   origin; the commit SHA links to GitHub.

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

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Production build (runs `prisma generate`) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:push` | Sync Prisma schema → SQLite |

## Running on this machine (live deployment)

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
- **Public URL:** <https://genboard.vjtv.dev> via Cloudflare Tunnel (token-managed; ingress
  configured in the Cloudflare Zero Trust dashboard → `genboard.vjtv.dev → HTTP localhost:47813`).
- **Env (gitignored `.env`):** includes `AUTH_TRUST_HOST=true` and
  `AUTH_URL=https://genboard.vjtv.dev` so OAuth works behind the proxy.
- **Database:** `file:/home/vncntjms/.genboard/genboard.db`; schema applied with
  `npm run db:push`.
- **GitHub OAuth callback** must be `https://genboard.vjtv.dev/api/auth/callback/github`.
