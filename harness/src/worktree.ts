/**
 * One git worktree per agent task: branch `vard/<task-id>` checked out at
 * `<project>/.vard/worktrees/<task-id>`, so parallel tasks never collide and the
 * user's checkout is untouched until they merge.
 */
import fs from "node:fs";
import path from "node:path";
import { ensureVardDir } from "./policy";
import { git, gitOk } from "./util";

export interface Worktree {
  taskId: string;
  projectRoot: string;
  path: string;
  branch: string;
  /** Commit the worktree was created from. */
  base: string;
}

export async function isGitRepo(dir: string): Promise<boolean> {
  const r = await git(dir, ["rev-parse", "--is-inside-work-tree"]).catch(() => null);
  return !!r && r.code === 0 && r.stdout.trim() === "true";
}

export async function createWorktree(projectRoot: string, taskId: string): Promise<Worktree> {
  if (!/^[A-Za-z0-9._-]+$/.test(taskId)) throw new Error(`invalid task id: ${taskId}`);
  const top = (await gitOk(projectRoot, ["rev-parse", "--show-toplevel"])).trim();
  const head = await git(top, ["rev-parse", "--verify", "HEAD"]);
  if (head.code !== 0) throw new Error("the project has no commits yet; make an initial commit first");
  const base = head.stdout.trim();
  const dir = path.join(ensureVardDir(top), "worktrees", taskId);
  const branch = `vard/${taskId}`;
  if (fs.existsSync(dir)) throw new Error(`worktree already exists: ${dir}`);
  fs.mkdirSync(path.dirname(dir), { recursive: true });
  await gitOk(top, ["worktree", "add", "-b", branch, dir, base]);
  return { taskId, projectRoot: top, path: dir, branch, base };
}

/** Diff of everything in the worktree (committed, staged, unstaged and new files) against base. */
export async function worktreeDiff(wt: Worktree): Promise<{ diff: string; stat: string }> {
  // Intent-to-add makes untracked files show up in `git diff` without staging their content.
  await git(wt.path, ["add", "-A", "--intent-to-add"]);
  const diff = await gitOk(wt.path, ["diff", "--no-color", "--no-ext-diff", wt.base]);
  const stat = await gitOk(wt.path, ["diff", "--stat", "--no-color", wt.base]);
  return { diff, stat: stat.trim() };
}

/** Commit any pending work on the task branch. Returns false if there was nothing to commit. */
export async function commitWorktree(wt: Worktree, message: string): Promise<boolean> {
  await gitOk(wt.path, ["add", "-A"]);
  const st = await gitOk(wt.path, ["status", "--porcelain"]);
  if (!st.trim()) return false;
  await gitOk(wt.path, [
    "-c",
    "user.name=Vard",
    "-c",
    "user.email=agent@vard.local",
    "commit",
    "--no-verify",
    "-m",
    message,
  ]);
  return true;
}

/** Commit the task's work and merge its branch into whatever the main checkout has checked out. */
export async function mergeWorktree(wt: Worktree, message = `vard: task ${wt.taskId}`): Promise<string> {
  await commitWorktree(wt, message);
  const r = await git(wt.projectRoot, [
    "-c",
    "user.name=Vard",
    "-c",
    "user.email=agent@vard.local",
    "merge",
    "--no-ff",
    "--no-edit",
    "-m",
    `Merge ${wt.branch}`,
    wt.branch,
  ]);
  if (r.code !== 0) {
    await git(wt.projectRoot, ["merge", "--abort"]);
    throw new Error(`merge failed: ${(r.stderr || r.stdout).trim()}`);
  }
  return r.stdout.trim();
}

export async function discardWorktree(wt: Worktree): Promise<void> {
  await git(wt.projectRoot, ["worktree", "remove", "--force", wt.path]);
  if (fs.existsSync(wt.path)) fs.rmSync(wt.path, { recursive: true, force: true });
  await git(wt.projectRoot, ["worktree", "prune"]);
  await git(wt.projectRoot, ["branch", "-D", wt.branch]);
}
