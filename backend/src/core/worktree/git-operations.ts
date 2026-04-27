import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

function git(args: string[], cwd: string): string {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf-8', timeout: 30_000 }).trim();
  } catch (err: any) {
    throw new Error(`git ${args.join(' ')} failed in ${cwd}: ${err.message}`);
  }
}

/** Find the git repo root directory by walking up from startPath. */
export function findGitRoot(startPath: string): string | null {
  try {
    const root = git(['rev-parse', '--show-toplevel'], startPath);
    return existsSync(root) ? root : null;
  } catch {
    return null;
  }
}

/** Check if a directory is inside a git repo. */
export function isGitRepo(dir: string): boolean {
  return findGitRoot(dir) !== null;
}

/** Get the current branch name. */
export function getCurrentBranch(repoRoot: string): string {
  return git(['rev-parse', '--abbrev-ref', 'HEAD'], repoRoot);
}

/** Create a git worktree: git worktree add -B <branch> <path> <baseBranch> */
export function createGitWorktree(
  repoRoot: string,
  worktreePath: string,
  branch: string,
  baseBranch: string,
): void {
  git(['worktree', 'add', '-B', branch, worktreePath, baseBranch], repoRoot);
}

/** Remove a git worktree: git worktree remove --force <path> */
export function removeGitWorktree(repoRoot: string, worktreePath: string): void {
  git(['worktree', 'remove', '--force', worktreePath], repoRoot);
}

/** Delete a branch: git branch -D <branch> */
export function deleteBranch(repoRoot: string, branch: string): void {
  try {
    git(['branch', '-D', branch], repoRoot);
  } catch {
    // Branch may not exist — ignore
  }
}

/** Check for uncommitted changes in a directory. */
export function hasUncommittedChanges(worktreePath: string): boolean {
  try {
    const status = git(['status', '--porcelain'], worktreePath);
    return status.length > 0;
  } catch {
    return false;
  }
}

/** List all worktrees under a repo. */
export function listGitWorktrees(repoRoot: string): Array<{ path: string; branch: string }> {
  try {
    const output = git(['worktree', 'list', '--porcelain'], repoRoot);
    const worktrees: Array<{ path: string; branch: string }> = [];
    let currentPath = '';
    let currentBranch = '';

    for (const line of output.split('\n')) {
      if (line.startsWith('worktree ')) {
        currentPath = line.slice('worktree '.length);
      } else if (line.startsWith('branch ')) {
        currentBranch = line.slice('branch '.length).replace('refs/heads/', '');
      } else if (line === '' && currentPath) {
        worktrees.push({ path: currentPath, branch: currentBranch });
        currentPath = '';
        currentBranch = '';
      }
    }
    if (currentPath) {
      worktrees.push({ path: currentPath, branch: currentBranch });
    }
    return worktrees;
  } catch {
    return [];
  }
}
