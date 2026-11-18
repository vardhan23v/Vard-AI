/** `vard run "…"` and `/task`: an agent task with inline approvals, then merge/discard/keep. */
import type { Proposal } from "../../memory";
import type { Event } from "../../protocol";
import { newId } from "../client";
import { chooseModel, providerWithKey, type Ctx } from "../context";
import { offerMemories } from "./memory";
import { colorDiff, describeToolInput, explainError, indent, TokenPrinter } from "../render";

export type TaskFlags = {
  model?: string;
  provider?: string;
  plan?: boolean;
  verify?: string;
  worktree?: boolean;
  maxSteps?: number;
  /** false: don't read or learn project memory. */
  memory?: boolean;
  /** Save suggested memories without asking (for scripts). */
  remember?: boolean;
};

export type TaskOutcome = {
  code: number;
  taskId: string;
  /** Set while the task's worktree is still around (kept, not merged or discarded). */
  kept?: { branch: string; path: string };
  /** Memories the agent suggested (or saved automatically). */
  proposals?: Proposal[];
};

const STATE_LABEL: Record<string, string> = {
  planning: "Planning…",
  acting: "Working…",
  observing: "Reading results…",
  verifying: "Verifying…",
};

export function gitRoot(cwd: string): string | null {
  const r = Bun.spawnSync(["git", "rev-parse", "--show-toplevel"], { cwd, stdout: "pipe", stderr: "pipe" });
  return r.exitCode === 0 ? r.stdout.toString().trim() : null;
}

export async function runTask(ctx: Ctx, prompt: string, flags: TaskFlags): Promise<TaskOutcome> {
  const { theme: t, out } = ctx;
  const useWorktree = flags.worktree !== false;
  const root = gitRoot(ctx.cwd);
  const taskId = newId("cli");
  if (useWorktree && !root) {
    ctx.err.write(
      t.danger("This folder isn't a git repository.") +
        " The agent works on its own branch, so it needs git. Run `git init`, or pass --no-worktree to edit files in place.\n",
    );
    return { code: 1, taskId };
  }
  const choice = chooseModel(ctx, flags);
  const provider = providerWithKey(ctx, choice);
  const planFirst = flags.plan ?? ctx.config.load().planFirst;

  const printer = new TokenPrinter(out, t);
  let label = "Starting…";
  // Text streamed since the last tool call; the plan and final summary often repeat it verbatim.
  let streamed = "";
  const already = (text: string) => !!text.trim() && streamed.trim() === text.trim();
  let worktree: { branch: string; path: string } | undefined;
  const proposals: Proposal[] = [];
  // Approvals are answered one at a time, in order.
  let queue = Promise.resolve();

  const pause = () => {
    ctx.spinner.stop();
    printer.end();
  };

  const onEvent = (e: Event) => {
    switch (e.type) {
      case "state":
        if (STATE_LABEL[e.state]) {
          label = STATE_LABEL[e.state];
          ctx.spinner.start(label);
        } else ctx.spinner.stop();
        break;
      case "token":
        ctx.spinner.stop();
        streamed += e.text;
        printer.write(e.text);
        break;
      case "tool_call": {
        pause();
        streamed = "";
        if (e.tool === "todo_write") break;
        const d = describeToolInput(e.tool, e.input);
        out.write(`  ${t.cerulean("▸")} ${e.tool}${d ? " " + t.muted(d) : ""}\n`);
        ctx.spinner.start(label);
        break;
      }
      case "tool_result":
        if (!e.ok) {
          pause();
          out.write(`    ${t.danger("✗")} ${t.muted(e.output.split("\n")[0].slice(0, 160))}\n`);
          ctx.spinner.start(label);
        }
        break;
      case "plan":
        pause();
        if (!already(e.plan)) out.write(`\n${t.star(t.bold("Plan"))}\n${indent(e.plan.trim())}\n`);
        out.write("\n");
        streamed = "";
        break;
      case "todos":
        pause();
        for (const td of e.todos) {
          const mark = td.status === "completed" ? t.sage("✓") : td.status === "in_progress" ? t.star("●") : t.muted("○");
          out.write(`    ${mark} ${td.status === "completed" ? t.muted(td.content) : td.content}\n`);
        }
        ctx.spinner.start(label);
        break;
      case "verify":
        pause();
        if (e.status === "running") out.write(`  ${t.cerulean("⟳")} verify ${t.muted(e.command)}\n`);
        else if (e.status === "passed") out.write(`  ${t.sage("✓")} verify passed\n`);
        else {
          out.write(`  ${t.danger("✗")} verify failed\n`);
          if (e.output) out.write(t.muted(indent(e.output.trim().split("\n").slice(-15).join("\n"), "      ")) + "\n");
        }
        ctx.spinner.start(label);
        break;
      case "retry":
        pause();
        ctx.err.write(
          t.muted(
            /tool call|failed_generation/i.test(e.message)
              ? `  The model sent a malformed tool call; asking it to try again (${e.attempt}/${e.maxAttempts})\n`
              : `  Rate-limited; retrying in ${Math.ceil(e.delayMs / 1000)}s (${e.attempt}/${e.maxAttempts})\n`,
          ),
        );
        ctx.spinner.start("Waiting to retry…");
        break;
      case "worktree":
        if (e.action === "created" && e.branch && e.path) {
          worktree = { branch: e.branch, path: e.path };
          pause();
          out.write(t.muted(`Working on branch ${e.branch}\n`));
        }
        break;
      case "memory_proposal":
        proposals.push(...e.items);
        break;
      case "approval_request":
        queue = queue.then(() => answer(e)).catch((err) => ctx.err.write(t.danger(`${err}\n`)));
        break;
      case "error":
        pause();
        ctx.err.write(t.danger(`Error: ${explainError(e.message)}\n`));
        break;
    }
  };

  const answer = async (e: Extract<Event, { type: "approval_request" }>) => {
    pause();
    if (e.kind === "plan") {
      const a = await ctx.prompter.choose(
        `${t.star("Approve this plan?")} ${t.muted("[y] yes  [e] edit  [n] no")}`,
        [
          { key: "y", label: "approve" },
          { key: "e", label: "edit" },
          { key: "n", label: "reject" },
        ],
      );
      if (a === "y") await ctx.client.approve(taskId, e.approvalId, "allow_once");
      else if (a === "e") {
        const plan = await ctx.prompter.editText(e.plan ?? "");
        await ctx.client.approve(taskId, e.approvalId, "allow_once", { plan });
      } else {
        const reason = (await ctx.prompter.line("What should change? (optional) ")) ?? "";
        await ctx.client.approve(taskId, e.approvalId, "deny", reason.trim() ? { reason: reason.trim() } : {});
      }
    } else {
      const d = describeToolInput(e.tool ?? "", e.input);
      out.write(`  ${t.star("?")} ${t.bold(e.tool ?? "tool")} ${d}\n    ${t.muted(e.reason)}\n`);
      const a = await ctx.prompter.choose(`  ${t.muted("[a] allow once  [A] always in this project  [d] deny")}`, [
        { key: "a", label: "allow once" },
        { key: "A", label: "always" },
        { key: "d", label: "deny" },
      ]);
      await ctx.client.approve(taskId, e.approvalId, a === "a" ? "allow_once" : a === "A" ? "always" : "deny");
    }
    ctx.spinner.start(label);
  };

  out.write(`${t.star("✦")} ${t.bold("Task")} ${t.muted(`· ${choice.model}${planFirst ? " · plan first" : ""}`)}\n`);
  ctx.prompter.onInterrupt(() => {
    pause();
    out.write(t.muted("Stopping the task…\n"));
    void ctx.client.cancel(taskId);
  });
  let done;
  try {
    done = await ctx.client.startTask(
      {
        taskId,
        projectRoot: useWorktree ? root! : ctx.cwd,
        prompt,
        provider,
        planFirst,
        useWorktree,
        verifyCommand: flags.verify,
        maxSteps: flags.maxSteps,
        useMemory: flags.memory !== false,
        learn: flags.memory !== false,
      },
      onEvent,
    );
    await queue;
  } finally {
    ctx.prompter.onInterrupt(null);
    pause();
  }

  out.write("\n");
  const showSummary = done.summary && !already(done.summary);
  if (done.status === "done") out.write(`${t.sage("✓")} ${t.bold("Done")}${showSummary ? `\n${indent(done.summary.trim())}` : ""}\n`);
  else if (done.status === "blocked") out.write(`${t.danger("■")} ${t.bold("Stopped")}: ${done.reason ?? done.summary}\n`);
  else out.write(t.muted("Task cancelled.\n"));
  if (done.usage) out.write(t.muted(`${done.steps ?? 0} steps · ${done.usage.totalTokens.toLocaleString()} tokens\n`));
  const code = done.status === "done" ? 0 : done.status === "blocked" ? 1 : 2;

  let kept: { branch: string; path: string } | undefined;
  if (worktree && !done.diffStat?.trim()) {
    await ctx.client.discard(taskId).catch(() => {});
    out.write(t.muted("No file changes; removed the task's branch.\n"));
  } else if (worktree) {
    out.write(`\n${t.bold("Changes")}\n${indent(done.diffStat!.trim())}\n`);
    kept = await reviewChanges(ctx, taskId, worktree);
  }
  await offerMemories(ctx, proposals, { remember: flags.remember, taskId });
  return { code, taskId, kept, proposals };
}

/** Merge / discard / view / keep loop. Returns the worktree if it was kept. */
export async function reviewChanges(ctx: Ctx, taskId: string, wt: { branch: string; path: string }) {
  const t = ctx.theme;
  if (!ctx.prompter.interactive) {
    ctx.out.write(t.muted(`Kept on branch ${wt.branch} (${wt.path}). Merge with: git merge ${wt.branch}\n`));
    return wt;
  }
  for (;;) {
    const a = await ctx.prompter.choose(`${t.star("Merge these changes?")} ${t.muted("[m] merge  [v] view diff  [d] discard  [k] keep for later")}`, [
      { key: "m", label: "merge" },
      { key: "v", label: "view diff" },
      { key: "d", label: "discard" },
      { key: "k", label: "keep" },
    ]);
    try {
      if (a === "v") {
        const { diff } = await ctx.client.diff(taskId);
        ctx.out.write(colorDiff(diff, t) + "\n");
        continue;
      }
      if (a === "m") {
        await ctx.client.merge(taskId);
        ctx.out.write(`${t.sage("✓")} Merged ${wt.branch} into your branch.\n`);
        return undefined;
      }
      if (a === "d") {
        await ctx.client.discard(taskId);
        ctx.out.write(t.muted("Discarded.\n"));
        return undefined;
      }
      ctx.out.write(t.muted(`Kept on branch ${wt.branch} (${wt.path}).\n`));
      return wt;
    } catch (e) {
      ctx.err.write(t.danger(`${(e as Error).message}\n`));
    }
  }
}
