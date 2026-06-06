import { spawn } from "node:child_process";

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
  const child = spawn(cmd, args, { cwd, shell: true, stdio: ["pipe", "pipe", "pipe"] });

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
