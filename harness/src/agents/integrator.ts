/**
 * Brings each agent's work into the run's integration branch, one at a time.
 *
 * 1. Commit the agent's worktree.
 * 2. Check for conflicts with `git merge-tree --write-tree` (no changes to any checkout).
 * 3. Merge into the integration worktree with --no-ff.
 * A conflict is never forced or resolved silently: the caller retries the subtask on top of the
 * latest integration branch, or asks the user.
 */
import { git, gitOk } from "../util";
import { commitWorktree, type Worktree } from "../worktree";

const ID = ["-c", "user.name=Vard", "-c", "user.email=agent@vard.local"];

export type IntegrateResult =
  | { status: "merged"; files: string[]; stat: string; commit: string }
  | { status: "empty"; files: []; stat: "" }
  | { status: "conflict"; files: string[] };

export class Integrator {
  private lock: Promise<unknown> = Promise.resolve();
  constructor(readonly integration: Worktree) {}

  /** Serialises integrations. */
  private exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.lock.then(fn, fn);
    this.lock = next.catch(() => {});
    return next;
  }

  async head(): Promise<string> {
    return (await gitOk(this.integration.path, ["rev-parse", "HEAD"])).trim();
  }

  /** Files that conflict when merging `branch` into the integration branch ([] when clean). */
  async conflicts(branch: string): Promise<string[]> {
    const r = await git(this.integration.path, ["merge-tree", "--write-tree", "--name-only", "--no-messages", "HEAD", branch]);
    if (r.code === 0) return [];
    if (r.code === 1) return r.stdout.split("\n").slice(1).map((l) => l.trim()).filter(Boolean);
    throw new Error(`git merge-tree failed: ${(r.stderr || r.stdout).trim()}`);
  }

  integrate(sub: Worktree, message: string): Promise<IntegrateResult> {
    return this.exclusive(async () => {
      await commitWorktree(sub, message);
      const ahead = (await gitOk(sub.path, ["rev-list", "--count", `${sub.base}..HEAD`])).trim();
      if (ahead === "0") return { status: "empty", files: [], stat: "" };
      const conflicts = await this.conflicts(sub.branch);
      if (conflicts.length) return { status: "conflict", files: conflicts };
      const before = await this.head();
      const r = await git(this.integration.path, [...ID, "merge", "--no-ff", "--no-edit", "-m", message, sub.branch]);
      if (r.code !== 0) {
        await git(this.integration.path, ["merge", "--abort"]);
        const files = (await git(this.integration.path, ["diff", "--name-only", "--diff-filter=U"])).stdout.split("\n").filter(Boolean);
        return { status: "conflict", files: files.length ? files : ["(merge failed)"] };
      }
      const after = await this.head();
      const files = (await gitOk(this.integration.path, ["diff", "--name-only", before, after])).split("\n").filter(Boolean);
      const stat = (await gitOk(this.integration.path, ["diff", "--stat", "--no-color", before, after])).trim();
      return { status: "merged", files, stat, commit: after };
    });
  }

  /** Combined diff of the run so far against where it started. */
  async diff(): Promise<{ diff: string; stat: string }> {
    const base = this.integration.base;
    const diff = await gitOk(this.integration.path, ["diff", "--no-color", "--no-ext-diff", base, "HEAD"]);
    const stat = (await gitOk(this.integration.path, ["diff", "--stat", "--no-color", base, "HEAD"])).trim();
    return { diff, stat };
  }
}
