import { AgenticCLIProvider, type CLIInvocation } from "./agentic-cli.provider";

/**
 * Google Antigravity CLI. `agy -p` runs a single non-interactive prompt; the
 * agent edits the working tree itself. The prompt is delivered via stdin.
 *
 * NOTE: Antigravity's exact non-interactive flag/stdin behavior is version-
 * dependent — confirm `agy -p` reads stdin (or adjust to pass the prompt inline)
 * against the installed CLI.
 */
export class AntigravityCLIProvider extends AgenticCLIProvider {
  name = "agy";

  private args(): string[] {
    return ["--print", "--dangerously-skip-permissions"];
  }

  protected executeInvocation(prompt: string): CLIInvocation {
    return { cmd: "agy", args: this.args(), stdin: prompt };
  }

  protected reviewInvocation(prompt: string): CLIInvocation {
    return { cmd: "agy", args: this.args(), stdin: this.reviewStdin(prompt) };
  }
}
