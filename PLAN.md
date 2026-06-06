# Genboard — No-Code App Development Tool

## What It Does

A web UI for managing app code without touching the terminal, modeled as a **Project Manager + Senior Engineer collaboration**:
1. Select a GitHub repo from a dropdown (lists your GitHub repos via OAuth)
2. **PM mode** — manage a backlog: create tasks with a text prompt, order them, set priority, track status (by hand)
3. Click **Execute** (from either mode) — streams the AI's reasoning live in a terminal panel, then applies code changes to your local repo
4. **SE mode** — review the produced diff with an AI critique, leave comments, then **Approve** or **Request Changes**
5. Click **Approve & Push** to commit and push to origin — **gated**: only enabled once the SE has approved the result

The linear pipeline is therefore a **loop**:
`backlog → execute → in_review → (changes_requested → re-execute) | (approved → push)`

---

## Roles & Collaboration (Hybrid Modes)

A **single** user switches between two **modes** in the UI — there are no separate accounts or RBAC; the existing single-user GitHub OAuth is unchanged. Roles are a **UI lens + workflow state**.

| Role | Owns | AI assist | Can Execute? |
|---|---|---|---|
| **Project Manager (PM)** | The todo list / backlog — create, order, prioritize, track status (manual; no AI decomposition) | None for backlog | ✅ |
| **Senior Engineer (SE)** | Reviewing the code diff a run produced; verdict = Approve / Request Changes | AI diff critique (structured findings) | ✅ |

Rules:
- **Both modes can Execute.** The mode that ran a result is recorded (`Result.executedBy`) for audit only — never enforced server-side.
- **SE approval is a hard gate.** `POST /api/results/[resultId]/approve` returns `409` unless an `approved` review exists for that result.
- **Re-execute** always creates a *new* `Result` and returns the task to `in_review`; prior reviews stay attached to their own result for history.
- **Request Changes** routes the task + SE comments back into the PM backlog (`status: changes_requested`) so the PM can edit the prompt and re-run.

### Task lifecycle (state machine)

```
[backlog] --Execute--> [running] --AI error--> [failed] --> [backlog]
                           |
                    patches applied
                           v
                      [executed] --auto--> [in_review]
                                              |
                          ┌───────────────────┴───────────────────┐
                   SE: Request Changes                       SE: Approve
                          v                                       v
                 [changes_requested]                         [approved]
                  (SE comments shown                             |
                   in PM backlog)                        Approve & Push (gated)
                          |                                       v
                   re-execute → new Result                    [pushed]
                          └──────────> [in_review]            (commitSha)
```

---

## Tech Stack

| Concern | Choice |
|---|---|
| Framework | Next.js (App Router) + TypeScript |
| Auth | NextAuth.js v5 beta — GitHub OAuth |
| Database | SQLite via Prisma (`~/.genboard/genboard.db`) |
| AI | Vercel AI SDK + `@ai-sdk/anthropic` (swappable via `AI_PROVIDER` env var) |
| Git | `simple-git` |
| Styling | Tailwind CSS |
| Diff display | `react-diff-view` + `diff` npm package |
| GitHub API | `@octokit/rest` |

---

## Key Architecture Decisions

### 1. Repo Workspace — Manual Path Mapping
User links each GitHub repo to a local folder they've already cloned. Stored in `~/.genboard/workspaces.json` as `{ "owner/repo": "/abs/local/path" }`. A Settings page lets users add/remove mappings with local path validation.

### 2. AI Output Format — Full File Replacements
The AI returns complete new file content (`{ path, content }[]`), not a unified diff. The app diffs original vs. new using the `diff` package for display. Avoids patch offset failures.

### 3. Streaming Execution
The Execute endpoint returns a **Server-Sent Events (SSE) stream**. The UI shows a terminal-style panel with live AI token output. When the stream ends, the server has already applied the file changes and saved the result — the client receives a final `{ type: "done", resultId }` event and shows a "View Diff →" button.

### 4. AI Provider Abstraction
```
AI_PROVIDER=claude-api   → ClaudeAPIProvider  (Vercel AI SDK + Anthropic)
AI_PROVIDER=claude-cli   → ClaudeCodeCLIProvider  (shells out to `claude` CLI)
```
Factory in `lib/ai/registry.ts`. Both implement the same `AIProvider` interface.

### 5. Rollback Safety
Before writing any AI patch to disk, the original file content is snapshotted in the `Result.patchesJson` column. A `POST /api/results/[resultId]/rollback` endpoint restores originals.

### 6. Security
All AI-returned file paths are resolved relative to the repo root and validated against path traversal before any write (`path.resolve` + `startsWith` check).

### 7. Roles as UI Modes, Not Accounts
PM and SE are a UI lens + workflow state on top of the existing single-user OAuth — no second account, no server-side RBAC. The acting mode is recorded for audit (`Result.executedBy`, `ActivityEvent.actorMode`) but never used to authorize. This keeps auth untouched while still giving a real two-role workflow.

### 8. SE Review Reuses the AI Provider Layer
The SE's AI critique is **not** a new subsystem: `AIProvider` gains `reviewDiff()`, which reuses the same SSE streaming machinery as `execute` but with a review system prompt that returns a JSON `AIReview` block (`{ summary, findings[] }`) instead of patches — mirroring the existing patch-extraction approach. The `ai-review` endpoint feeds it `DiffFile[]` from `lib/git/diff.ts`.

### 9. Push Gate via Review State
`POST /api/results/[resultId]/approve` refuses (`409`) unless `result.reviewStatus === "approved"`. Re-executing a task always creates a *new* `Result` (resetting to `in_review`); prior reviews remain attached to their own result for history.

---

## Directory Structure

```
genboard/
├── prisma/
│   └── schema.prisma              # Task, Result models; SQLite datasource
├── app/
│   ├── layout.tsx                 # Root layout + SessionProvider
│   ├── page.tsx                   # Redirect to /tasks or /login
│   ├── globals.css
│   ├── (auth)/
│   │   └── login/page.tsx         # GitHub sign-in page
│   ├── (app)/                     # Protected route group
│   │   ├── layout.tsx             # App shell: top nav (+ ModeSwitcher) + sidebar
│   │   ├── tasks/page.tsx         # Backlog (PM) / review queue (SE) — mode-aware
│   │   ├── tasks/[taskId]/page.tsx           # Task detail + Execute + stream panel + ActivityTrail
│   │   ├── tasks/[taskId]/diff/page.tsx      # Diff view + ReviewPanel + (gated) Approve & Push
│   │   └── settings/page.tsx      # Link repos to local paths
│   └── api/
│       ├── auth/[...nextauth]/route.ts
│       ├── repos/route.ts                        # GET: list GitHub repos
│       ├── workspace/route.ts                    # GET/POST: workspaces.json
│       ├── workspace/validate/route.ts           # POST: validate local git path
│       ├── tasks/route.ts                        # GET list (sort/filter), POST create
│       ├── tasks/reorder/route.ts                # POST: persist manual backlog order
│       ├── tasks/[taskId]/route.ts               # GET, PATCH (priority/status), DELETE
│       ├── tasks/[taskId]/execute/route.ts       # POST: SSE stream + AI + file writes (+ mode)
│       ├── tasks/[taskId]/activity/route.ts      # GET: ActivityEvent[] trail
│       ├── results/[resultId]/route.ts           # GET: result + diff data
│       ├── results/[resultId]/ai-review/route.ts # POST: SSE stream AI critique → aiReviewJson
│       ├── results/[resultId]/review/route.ts    # POST: SE verdict (approve / request changes)
│       ├── results/[resultId]/approve/route.ts   # POST: git commit + push (review-gated)
│       └── results/[resultId]/rollback/route.ts  # POST: restore originals
├── lib/
│   ├── auth.ts                    # NextAuth config; JWT callbacks surface access_token
│   ├── db.ts                      # Prisma client singleton
│   ├── mode.ts                    # Mode helpers (read/write PM|SE preference)
│   ├── ai/
│   │   ├── types.ts               # AIProvider interface (execute + reviewDiff)
│   │   ├── registry.ts            # getProvider(name) factory
│   │   ├── claude-api.provider.ts # streamText + JSON patch/review extraction
│   │   └── claude-cli.provider.ts # child_process.spawn("claude", ["--print", ...])
│   ├── git/
│   │   ├── client.ts              # simple-git factory
│   │   ├── diff.ts                # getDiff(localPath) → unified diff strings
│   │   ├── commit.ts              # stageAll + commit + push
│   │   └── validate.ts            # isGitRepo(absPath): boolean
│   ├── github/
│   │   ├── octokit.ts             # Octokit factory from session token
│   │   └── repos.ts               # listReposForUser(token)
│   └── workspace/
│       ├── config.ts              # read/write ~/.genboard/workspaces.json
│       └── files.ts               # readRepoFiles(): glob + .gitignore filter + size limits
├── components/
│   ├── layout/
│   │   ├── RepoSwitcher.tsx       # Dropdown: GitHub repos with linked status
│   │   ├── ModeSwitcher.tsx       # PM ⇄ SE toggle (persists preference)
│   │   └── Sidebar.tsx            # Task nav with status/priority chips
│   ├── tasks/
│   │   ├── TaskList.tsx           # Backlog: reorder + priority + status grouping
│   │   ├── TaskDetail.tsx         # Prompt textarea + Execute button + SSE stream panel
│   │   ├── ActivityTrail.tsx      # Per-task event log (who did what)
│   │   └── CreateTaskModal.tsx
│   └── diff/
│       ├── DiffViewer.tsx         # react-diff-view, file tabs, finding anchors
│       ├── ReviewPanel.tsx        # AI critique + comments + Approve / Request Changes
│       └── ApproveBar.tsx         # Commit message input + (gated) Approve & Push button
├── types/index.ts                 # Shared TypeScript types
├── middleware.ts                  # Protect (app) routes, redirect to /login
└── .env.local                     # Secrets (never commit)
```

---

## Data Models

### Prisma Schema

```prisma
model Task {
  id             String   @id @default(cuid())
  repoFullName   String   // "owner/repo"
  title          String
  prompt         String
  status         String   @default("backlog")
  // backlog | running | executed | in_review | changes_requested | approved | pushed | failed
  priority       String   @default("medium")   // low | medium | high | urgent
  order          Int      @default(0)           // manual backlog ordering within a repo
  latestResultId String?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  results        Result[]
  events         ActivityEvent[]
}

model Result {
  id           String   @id @default(cuid())
  taskId       String
  task         Task     @relation(fields: [taskId], references: [id], onDelete: Cascade)
  patchesJson  String   // JSON: { path, originalContent, newContent }[]
  diffJson     String   @default("[]")    // JSON: DiffFile[] for display
  executedBy   String   @default("pm")    // "pm" | "se" — which mode ran it (audit)
  reviewStatus String   @default("pending") // pending | approved | changes_requested
  aiReviewJson String   @default("null")  // cached AIReview: { summary, findings[] }
  approved     Boolean  @default(false)
  commitSha    String?
  createdAt    DateTime @default(now())
  review       Review?
}

model Review {
  id           String   @id @default(cuid())
  resultId     String   @unique
  result       Result   @relation(fields: [resultId], references: [id], onDelete: Cascade)
  decision     String                       // approved | changes_requested
  summary      String   @default("")        // SE's overall note
  commentsJson String   @default("[]")      // ReviewComment[]: { path, line?, body }
  createdAt    DateTime @default(now())
}

model ActivityEvent {
  id        String   @id @default(cuid())
  taskId    String
  task      Task     @relation(fields: [taskId], references: [id], onDelete: Cascade)
  kind      String   // created | executed | ai_reviewed | approved | changes_requested | pushed | reordered
  actorMode String   // "pm" | "se"
  detail    String   @default("")
  createdAt DateTime @default(now())
}
```

### TypeScript Types (`types/index.ts`)

```typescript
export interface AIProvider {
  name: string;
  execute(req: AIRequest): AsyncIterable<string> | Promise<AIResponse>;
  reviewDiff(req: AIReviewRequest): AsyncIterable<string> | Promise<AIReview>; // SE assist
}

export interface AIRequest {
  prompt: string;
  repoFullName: string;
  files: FileContext[];
}

export interface AIReviewRequest {
  prompt: string;        // original task prompt, for context
  repoFullName: string;
  diff: DiffFile[];      // what changed
}

export interface AIResponse {
  patches: FilePatch[];
  rawText: string;
}

export interface FileContext  { path: string; content: string; }
export interface FilePatch    { path: string; originalContent: string; newContent: string; }

export interface DiffFile {
  path: string;
  hunks: string;   // unified diff string for this file
  additions: number;
  deletions: number;
}

// Collaboration types
export type Mode = "pm" | "se";
export type TaskStatus =
  | "backlog" | "running" | "executed" | "in_review"
  | "changes_requested" | "approved" | "pushed" | "failed";
export type Priority = "low" | "medium" | "high" | "urgent";
export type ReviewDecision = "approved" | "changes_requested";

export interface ReviewComment { path: string; line?: number; body: string; }

export interface AIReviewFinding {
  path: string;
  line?: number;
  severity: "info" | "warning" | "critical";
  message: string;
}
export interface AIReview { summary: string; findings: AIReviewFinding[]; }
```

---

## Execute Endpoint — SSE Flow

```
POST /api/tasks/[taskId]/execute
  │
  ├── 1. Load task from DB, verify session owns the repo
  ├── 2. Look up local path from ~/.genboard/workspaces.json
  ├── 3. Enumerate files (glob → .gitignore filter → size/count limits)
  ├── 4. streamText(claude, { system: "...", messages: [prompt + file context] })
  │       └── Stream each token → SSE event { type: "token", text: "..." }
  ├── 5. Accumulate full response; extract JSON patches block from end
  ├── 6. For each patch: validate path, snapshot original, write new content to disk
  ├── 7. git diff HEAD → build DiffFile[] using `diff` package
  ├── 8. Save Result row (patchesJson + diffJson), update task status
  └── 9. SSE event { type: "done", resultId: "..." }

Client:
  EventSource → appends tokens to <pre> panel
  On "done" → shows "View Diff →" button → navigates to /tasks/[taskId]/diff
```

---

## Build Phases

| # | Phase | Key deliverable | Complexity |
|---|---|---|---|
| 1 | Scaffold + GitHub OAuth | Working sign-in with GitHub | Low |
| 2 | Prisma + SQLite | DB migrations, client singleton | Low |
| 3 | Workspace config + GitHub repo list | Repo switcher, Settings page | Medium |
| 4 | Tasks CRUD + UI | Task list, task detail, create modal | Low |
| 5 | AI provider layer | `AIProvider` interface, `ClaudeAPIProvider` | **High** |
| 6 | Execute endpoint + SSE + file writes | Live stream panel, rollback | **High** |
| 7 | Diff view + Approve & Push | `DiffViewer`, commit + push | Medium |
| 8 | Error handling + polish | Loading states, edge cases | Medium |
| 9 | Settings page | Provider selector, API key, file limits | Low |
| 10 | Collab schema + types | `Review`, `ActivityEvent`, Task/Result fields, migration, `Mode`/status types | Low |
| 11 | Mode switch | `ModeSwitcher`, `lib/mode.ts`, shell theming, default landing per mode | Low |
| 12 | PM backlog | Ordering + priority + status grouping + `tasks/reorder` API | Medium |
| 13 | State machine | Execute → `in_review`; status transitions + activity log | Medium |
| 14 | AI review assist | `reviewDiff` in providers + `ai-review` SSE endpoint | **High** |
| 15 | SE review UI + gate | `ReviewPanel`, `review` endpoint, push gate in `ApproveBar`/approve route | **High** |
| 16 | Loop + polish | Changes-requested → re-execute loop, activity trail, empty/edge states | Medium |

---

## npm Packages

```
next react react-dom typescript tailwindcss
next-auth@beta @auth/prisma-adapter
prisma @prisma/client
ai @ai-sdk/anthropic zod
simple-git @octokit/rest
diff react-diff-view
ignore glob
```

---

## Environment Variables (`.env.local`)

```bash
# NextAuth
AUTH_SECRET=                     # generate: npx auth secret
AUTH_GITHUB_ID=                  # GitHub OAuth App → client id
AUTH_GITHUB_SECRET=              # GitHub OAuth App → client secret

# Prisma
DATABASE_URL=file:C:/Users/<you>/.genboard/genboard.db

# AI
AI_PROVIDER=claude-api           # or "claude-cli"
AI_CLAUDE_MODEL=claude-sonnet-4-6
ANTHROPIC_API_KEY=sk-ant-...
```

**GitHub OAuth App settings** (create at https://github.com/settings/developers):
- Homepage URL: `http://localhost:3000`
- Callback URL: `http://localhost:3000/api/auth/callback/github`
- Scopes needed: `read:user user:email repo`

---

## Verification Checklist

- [ ] `npm run dev` → `http://localhost:3000` redirects to `/login`
- [ ] GitHub OAuth sign-in completes, session persists
- [ ] Settings page: paste local repo path → validates as git repo → saves
- [ ] Repo switcher shows GitHub repos with linked/unlinked indicator
- [ ] Create task → prompt → Execute → terminal panel streams AI tokens live
- [ ] After stream ends, "View Diff →" appears; diff page shows file hunks
- [ ] Approve & Push → success toast with commit SHA and GitHub link
- [ ] Commit visible in GitHub repo

### Collaboration (PM + SE)

- [ ] Mode switch: toggle PM ⇄ SE in nav; preference persists across reload; each mode lands on its view
- [ ] PM backlog: create 3 tasks, reorder them (persists after refresh), set priorities, confirm status grouping
- [ ] Execute from both modes: `Result.executedBy` reflects the mode; task moves to `in_review`
- [ ] Push gate: on a fresh result, **Approve & Push is disabled** and `approve` API returns `409`
- [ ] AI review: "Run AI Review" streams tokens, then renders findings linked to the right file/line
- [ ] Request Changes loop: SE comment → task `changes_requested` in PM backlog with note → edit prompt → re-execute → new result back in `in_review`
- [ ] Approve + push: SE Approve → Approve & Push enables → push succeeds → task `pushed`
- [ ] Activity trail: task detail shows ordered events with actor mode
