/**
 * Dispatches ready subtasks (all dependencies completed) to workers, at most `maxAgents` at a time.
 * Each subtask gets its own AbortController (linked to the run's), a time limit and a retry
 * budget. A failure only blocks the subtasks that depend on it. Pausing stops new dispatches;
 * running agents wait at their next step (see AgentEnv.gate).
 */
import { propagateBlocked, readySubtasks } from "./dependencies";
import type { SubtaskResult, SubtaskState } from "./schema";

export type Outcome =
  | { status: "completed"; result: SubtaskResult }
  | { status: "failed"; error: string; retryable: boolean }
  | { status: "conflict"; files: string[] }
  | { status: "needs_input"; question: string }
  | { status: "cancelled" };

export interface SchedulerHooks {
  maxAgents: number;
  retries: number;
  timeoutMs: (s: SubtaskState) => number;
  run: (s: SubtaskState, signal: AbortSignal) => Promise<Outcome>;
  onChange: (s: SubtaskState, why?: string) => void;
  paused: () => boolean;
  /** Resolves when the run is resumed (or aborted). */
  resumed: () => Promise<void>;
  budgetLeft: () => boolean;
  signal: AbortSignal;
}

export class Scheduler {
  private controllers = new Map<string, { ctrl: AbortController; reason?: "user" | "timeout" }>();
  private wakeUp: () => void = () => {};
  /** Highest number of subtasks that ran at once (for tests and the log). */
  peak = 0;

  constructor(private h: SchedulerHooks) {}

  /** Re-evaluate now (after a control action). */
  poke() {
    this.wakeUp();
  }

  /** Cancels one running subtask (its dependents become blocked). */
  cancel(id: string): boolean {
    const c = this.controllers.get(id);
    if (!c) return false;
    c.reason = "user";
    c.ctrl.abort();
    return true;
  }

  running(): string[] {
    return [...this.controllers.keys()];
  }

  async run(subs: SubtaskState[]): Promise<void> {
    const h = this.h;
    const active = new Map<string, Promise<void>>();
    const onAbort = () => this.wakeUp();
    h.signal.addEventListener("abort", onAbort);
    try {
      for (;;) {
        for (const b of propagateBlocked(subs)) h.onChange(b, `blocked by ${b.blockedBy?.join(", ")}`);
        if (h.signal.aborted) {
          for (const s of subs) if (s.status === "pending") this.set(s, { status: "cancelled" });
          await Promise.allSettled(active.values());
          return;
        }
        if (!h.paused()) {
          if (!h.budgetLeft()) {
            for (const s of subs)
              if (s.status === "pending") this.set(s, { status: "skipped", error: "the run's token budget is used up" });
          } else
            for (const s of readySubtasks(subs)) {
              if (active.size >= h.maxAgents) break;
              active.set(s.id, this.dispatch(s).finally(() => active.delete(s.id)));
              this.peak = Math.max(this.peak, active.size);
            }
        }
        if (!active.size) {
          const waiting = subs.some((s) => s.status === "pending");
          if (waiting && h.paused()) {
            await Promise.race([h.resumed(), this.wakeSignal()]);
            continue;
          }
          return;
        }
        await Promise.race([...active.values(), this.wakeSignal()]);
      }
    } finally {
      h.signal.removeEventListener("abort", onAbort);
    }
  }

  private wakeSignal(): Promise<void> {
    return new Promise((r) => (this.wakeUp = r));
  }

  private set(s: SubtaskState, patch: Partial<SubtaskState>, why?: string) {
    Object.assign(s, patch);
    this.h.onChange(s, why);
  }

  private async dispatch(s: SubtaskState): Promise<void> {
    const h = this.h;
    const ctrl = new AbortController();
    const entry: { ctrl: AbortController; reason?: "user" | "timeout" } = { ctrl };
    this.controllers.set(s.id, entry);
    const ms = h.timeoutMs(s);
    const timer = setTimeout(() => {
      entry.reason = "timeout";
      ctrl.abort();
    }, ms);
    this.set(s, { status: "running", attempts: s.attempts + 1, startedAt: Date.now(), endedAt: undefined, error: undefined, question: undefined });
    let out: Outcome;
    try {
      out = await h.run(s, AbortSignal.any([h.signal, ctrl.signal]));
    } catch (e) {
      out = { status: "failed", error: (e as Error)?.message ?? String(e), retryable: true };
    } finally {
      clearTimeout(timer);
      this.controllers.delete(s.id);
    }
    if (out.status === "cancelled" && entry.reason === "timeout")
      out = { status: "failed", error: `timed out after ${Math.round(ms / 60_000) || 1} min`, retryable: true };
    const canRetry = s.attempts <= h.retries && !h.signal.aborted;
    const ended = { endedAt: Date.now() };
    switch (out.status) {
      case "completed":
        return this.set(s, { status: "completed", result: out.result, note: undefined, ...ended });
      case "cancelled":
        return this.set(s, { status: "cancelled", error: entry.reason === "user" ? "cancelled by you" : "cancelled", ...ended });
      case "needs_input":
        return this.set(s, { status: "needs_attention", question: out.question, ...ended }, "needs input");
      case "conflict": {
        const note = `Your previous attempt conflicted with work merged meanwhile (${out.files.join(", ")}). Start again from the current code and make your change fit it.`;
        if (canRetry) return this.set(s, { status: "pending", note, error: `merge conflict in ${out.files.join(", ")}` }, "retrying after a merge conflict");
        return this.set(s, { status: "needs_attention", error: `merge conflict in ${out.files.join(", ")}`, ...ended });
      }
      case "failed":
        if (canRetry && out.retryable)
          return this.set(s, { status: "pending", note: `Your previous attempt failed: ${out.error}`, error: out.error }, "retrying");
        return this.set(s, { status: "failed", error: out.error, ...ended });
    }
  }
}
