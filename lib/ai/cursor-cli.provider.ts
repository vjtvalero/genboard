import { AgenticCLIProvider, type CLIInvocation } from "./agentic-cli.provider";

/**
 * Cursor Agent CLI. `agent -p --force --trust` runs headless and edits the
 * working tree. Model via `--model`. The prompt is delivered via stdin; diff is
 * derived from git afterward.
 */
export class CursorCLIProvider extends AgenticCLIProvider {
  name = "cursor-cli";

  constructor(private readonly model: string) {
    super();
  }

  private baseArgs(): string[] {
    const args = ["-p", "--force", "--trust"];
    if (this.model && this.model !== "auto") args.push("--model", this.model);
    return args;
  }

  protected executeInvocation(prompt: string): CLIInvocation {
    const args = [
      ...this.baseArgs(),
      "--output-format",
      "stream-json",
      "--stream-partial-output",
    ];
    return { cmd: "agent", args, stdin: prompt };
  }

  protected reviewInvocation(prompt: string): CLIInvocation {
    return {
      cmd: "agent",
      args: [...this.baseArgs(), "--mode", "ask"],
      stdin: this.reviewStdin(prompt),
    };
  }
}
