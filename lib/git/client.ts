import simpleGit, { type SimpleGit } from "simple-git";

/** Build a simple-git client rooted at an absolute repo path. */
export function gitClient(repoPath: string): SimpleGit {
  return simpleGit({ baseDir: repoPath, maxConcurrentProcesses: 1 });
}
