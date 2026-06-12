import { spawn } from "node:child_process";
import { accessSync, constants } from "node:fs";
import os from "node:os";
import path from "node:path";
import { getCliPathOverride } from "./cli-paths";

/** The `<CMD>_BIN` override env var name for a CLI command (e.g. `CLAUDE_BIN`). */
function binEnvKey(cmd: string): string {
  return `${cmd.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_BIN`;
}

/**
 * The explicit binary pinned for a CLI command, in precedence order: a path
 * stored in Settings, then the `<CMD>_BIN` env var. Undefined means "auto-detect
 * by searching the augmented PATH for the bare command name".
 */
function pinnedBinary(cmd: string): string | undefined {
  return getCliPathOverride(cmd) || process.env[binEnvKey(cmd)] || undefined;
}

/**
 * Resolve a bare CLI name to an explicit binary. Honors a Settings override and
 * the `<CMD>_BIN` env var (e.g. `CLAUDE_BIN`) so deployments — like the systemd
 * user service, whose PATH excludes `~/.local/bin` — can pin the exact binary.
 * Falls back to the bare name (resolved via the augmented PATH by the shell).
 */
function resolveCommand(cmd: string): string {
  return pinnedBinary(cmd) || cmd;
}

/**
 * PATH augmented with the locations CLI tools are commonly installed into but
 * which a minimal service environment may omit: the user's `~/.local/bin`
 * (native installers) and the dir of the running Node binary (npm global bins).
 */
function augmentedPath(): string {
  const home = os.homedir();
  const extra = [path.join(home, ".local", "bin"), path.dirname(process.execPath)];
  return [...extra, process.env.PATH ?? ""].filter(Boolean).join(path.delimiter);
}

function isExecutable(p: string): boolean {
  try {
    accessSync(p, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * `which`-style lookup mirroring how {@link spawnStream} resolves a CLI: a
 * `<CMD>_BIN` override that looks like a path pins the exact binary; otherwise
 * the (possibly renamed) command is searched across the augmented PATH. Returns
 * the absolute path to the executable, or null when it cannot be found — used to
 * report CLI-provider availability before a run rather than failing at exec time.
 */
export function resolveCliBinary(cmd: string): string | null {
  const override = pinnedBinary(cmd);
  if (override && (path.isAbsolute(override) || override.includes("/") || override.includes("\\"))) {
    return isExecutable(override) ? override : null;
  }
  const name = override || cmd;
  const exts =
    process.platform === "win32"
      ? (process.env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM").split(";")
      : [""];
  for (const dir of augmentedPath().split(path.delimiter)) {
    if (!dir) continue;
    for (const ext of exts) {
      const candidate = path.join(dir, name + ext);
      if (isExecutable(candidate)) return candidate;
    }
  }
  return null;
}

export type CliSource = "stored" | "env" | "path" | "none";

export interface CliResolution {
  /** Where the effective binary comes from. "none" = not found. */
  source: CliSource;
  /** The absolute path actually resolved, or null if nothing executable matched. */
  resolvedPath: string | null;
  /** The configured override (stored path or env value), if any. */
  override: string | null;
}

/** Report how a CLI command resolves — for the Settings UI. */
export function resolveCliInfo(cmd: string): CliResolution {
  const stored = getCliPathOverride(cmd) ?? null;
  const env = process.env[binEnvKey(cmd)] ?? null;
  const resolvedPath = resolveCliBinary(cmd);
  let source: CliSource;
  if (stored) source = "stored";
  else if (env) source = "env";
  else if (resolvedPath) source = "path";
  else source = "none";
  return { source, resolvedPath, override: stored ?? env };
}

/**
 * Spawn a CLI, stream its stdout+stderr as tokens, and return the accumulated
 * **stdout** (the parse target). The prompt is delivered via stdin so no
 * untrusted data is placed on the shell command line. `shell: true` is used so
 * Windows can resolve `.cmd`/`.exe` shims on PATH.
 */
export async function* spawnStream(
  cmd: string,
  args: string[],
  cwd: string,
  stdin?: string,
): AsyncGenerator<string, string, unknown> {
  const child = spawn(resolveCommand(cmd), args, {
    cwd,
    shell: true,
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, PATH: augmentedPath() },
  });

  if (stdin !== undefined) {
    child.stdin.write(stdin);
  }
  child.stdin.end();

  const queue: string[] = [];
  let stdout = "";
  let stderr = "";
  let resolveNext: (() => void) | null = null;
  let ended = false;
  let errored: Error | null = null;

  const wake = () => {
    const r = resolveNext;
    resolveNext = null;
    r?.();
  };

  child.stdout.on("data", (d: Buffer) => {
    const s = d.toString();
    stdout += s;
    queue.push(s);
    wake();
  });
  child.stderr.on("data", (d: Buffer) => {
    const s = d.toString();
    stderr += s;
    queue.push(s); // shown in the terminal panel, not parsed
    wake();
  });
  child.on("error", (e) => {
    errored = e;
    wake();
  });
  child.on("close", (code) => {
    if (code !== 0 && !errored) {
      errored = new Error(
        `${cmd} exited with code ${code}${stderr.trim() ? `: ${stderr.trim()}` : ""}`,
      );
    }
    ended = true;
    wake();
  });

  while (true) {
    if (queue.length > 0) {
      yield queue.shift() as string;
      continue;
    }
    if (ended) break;
    if (errored) break;
    await new Promise<void>((resolve) => {
      resolveNext = resolve;
    });
  }

  if (errored) throw errored;
  return stdout;
}
