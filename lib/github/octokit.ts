import { Octokit } from "@octokit/rest";

/** Build an Octokit client from a session access token. */
export function octokitFromToken(token: string): Octokit {
  return new Octokit({ auth: token });
}
