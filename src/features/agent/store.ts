/**
 * Live state of agent tasks, folded from sidecar events.
 * One subscription for the whole app; components read a task with useTask().
 */
import { useCallback, useSyncExternalStore } from "react";
import { onAgentEvent, send, type AgentEvent } from "@/lib/agent-client";
import { updateTask } from "./projects";

type Ev<T extends AgentEvent["type"]> = Extract<AgentEvent, { type: T }>;

export type TimelineItem =
  | { kind: "text"; text: string; ts: number }
  | { kind: "tool"; callId: string; tool: string; input: unknown; result?: { ok: boolean; output: string }; ts: number }
  | { kind: "approval"; event: Ev<"approval_request">; decision?: string }
  | { kind: "verify"; event: Ev<"verify"> }
  | { kind: "error"; message: string; ts: number };

export type LiveTask = {
  taskId: string;
  state?: Ev<"state">["state"];
  plan?: string;
  todos: Ev<"todos">["todos"];
  timeline: TimelineItem[];
  pending?: Ev<"approval_request">;
  worktree?: { path?: string; branch?: string; action: string };
  diff?: { diff: string; stat: string };
  done?: Ev<"done">;
  usage?: Ev<"usage">["total"];
};

const tasks = new Map<string, LiveTask>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function get(taskId: string): LiveTask {
  let t = tasks.get(taskId);
  if (!t) {
    t = { taskId, todos: [], timeline: [] };
    tasks.set(taskId, t);
  }
  return t;
}

function apply(t: LiveTask, e: AgentEvent): LiveTask {
  const timeline = [...t.timeline];
  switch (e.type) {
    case "state":
      void updateTask(t.taskId, { status: e.state });
      return { ...t, state: e.state };
    case "token": {
      const last = timeline[timeline.length - 1];
      if (last?.kind === "text") timeline[timeline.length - 1] = { ...last, text: last.text + e.text };
      else timeline.push({ kind: "text", text: e.text, ts: e.ts });
      return { ...t, timeline };
    }
    case "tool_call":
      timeline.push({ kind: "tool", callId: e.callId, tool: e.tool, input: e.input, ts: e.ts });
      return { ...t, timeline };
    case "tool_result": {
      const i = timeline.findIndex((x) => x.kind === "tool" && x.callId === e.callId);
      if (i >= 0) timeline[i] = { ...(timeline[i] as Extract<TimelineItem, { kind: "tool" }>), result: { ok: e.ok, output: e.output } };
      return { ...t, timeline };
    }
    case "approval_request":
      timeline.push({ kind: "approval", event: e });
      return { ...t, timeline, pending: e, plan: e.kind === "plan" ? (e.plan ?? t.plan) : t.plan };
    case "plan":
      void updateTask(t.taskId, { plan: e.plan });
      return { ...t, plan: e.plan };
    case "todos":
      return { ...t, todos: e.todos };
    case "verify": {
      const i = timeline.findIndex((x) => x.kind === "verify" && x.event.status === "running" && x.event.command === e.command);
      if (i >= 0 && e.status !== "running") timeline[i] = { kind: "verify", event: e };
      else timeline.push({ kind: "verify", event: e });
      return { ...t, timeline };
    }
    case "usage":
      return { ...t, usage: e.total };
    case "worktree":
      if (e.action !== "created") void updateTask(t.taskId, { status: e.action });
      return { ...t, worktree: { path: e.path ?? t.worktree?.path, branch: e.branch ?? t.worktree?.branch, action: e.action } };
    case "diff":
      return { ...t, diff: { diff: e.diff, stat: e.stat } };
    case "done":
      void updateTask(t.taskId, {
        status: e.status,
        summary: e.summary,
        diff_stat: e.diffStat ?? null,
        steps: e.steps ?? null,
        input_tokens: e.usage?.inputTokens ?? null,
        output_tokens: e.usage?.outputTokens ?? null,
      });
      return { ...t, done: e, pending: undefined };
    case "error":
      timeline.push({ kind: "error", message: e.message, ts: e.ts });
      return { ...t, timeline };
    default:
      return t;
  }
}

let started = false;
export function startTaskStore() {
  if (started) return;
  started = true;
  onAgentEvent((e) => {
    if (!e.taskId || e.id.startsWith("chat-")) return;
    tasks.set(e.taskId, apply(get(e.taskId), e));
    emit();
  });
}

export function useTask(taskId: string | undefined): LiveTask | undefined {
  return useSyncExternalStore(
    useCallback((cb: () => void) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    }, []),
    () => (taskId ? tasks.get(taskId) : undefined),
  );
}

export function isRunning(t?: LiveTask) {
  return !!t && !t.done && !!t.state && !["done", "blocked", "cancelled"].includes(t.state);
}

// ---- actions ----
export const taskActions = {
  approve(taskId: string, approvalId: string, decision: "allow_once" | "always" | "deny", extra?: { reason?: string; plan?: string }) {
    const t = get(taskId);
    tasks.set(taskId, {
      ...t,
      pending: undefined,
      timeline: t.timeline.map((x) =>
        x.kind === "approval" && x.event.approvalId === approvalId ? { ...x, decision } : x,
      ),
    });
    emit();
    return send({ type: "task.approve", taskId, approvalId, decision, ...extra });
  },
  cancel: (taskId: string) => send({ type: "task.cancel", taskId }),
  diff: (taskId: string) => send({ type: "task.diff", taskId }),
  merge: (taskId: string) => send({ type: "task.merge", taskId }),
  discard: (taskId: string) => send({ type: "task.discard", taskId }),
};
