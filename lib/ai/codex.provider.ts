import { AgenticCLIProvider, type CLIInvocation } from "./agentic-cli.provider";
import type { Effort } from "./catalog";

/**
 * OpenAI Codex CLI. `codex exec` runs a single non-interactive session that edits
 * the working tree. Model via `-m`, reasoning effort via the
 * `model_reasoning_effort` config override.
 */
export class CodexCLIProvider extends AgenticCLIProvider {
  name = "codex";

  constructor(
    private readonly model: string,
    private readonly effort: Effort | null,
  ) {
    super();
  }

  private baseArgs(): string[] {
    const args = ["exec", "--dangerously-bypass-approvals-and-sandbox"];
    if (this.model) args.push("-m", this.model);
    return args;
  }

  protected executeInvocation(prompt: string): CLIInvocation {
    const args = this.baseArgs();
    if (this.effort) args.push("-c", `model_reasoning_effort=${this.effort}`);
    return { cmd: "codex", args, stdin: prompt };
  }

  protected reviewInvocation(prompt: string): CLIInvocation {
    return { cmd: "codex", args: this.baseArgs(), stdin: this.reviewStdin(prompt) };
  }
}
