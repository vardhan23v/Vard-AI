import type { AgentRun, SubtaskState, TeamState } from "@/features/agent/store";

export const ROLE_LABEL: Record<string, string> = {
  planner: "Planner",
  frontend: "Frontend",
  backend: "Backend",
  database: "Database",
  testing: "Testing",
  reviewer: "Reviewer",
};

export const PHASE_LABEL: Record<TeamState["phase"], string> = {
  planning: "Planning",
  awaiting_approval: "Waiting for your approval",
  running: "Running",
  paused: "Paused",
  attention: "Needs your attention",
  reviewing: "Reviewing",
  done: "Finished",
  failed: "Stopped",
  cancelled: "Cancelled",
};

export const SUBTASK_LABEL: Record<SubtaskState["status"], string> = {
  pending: "Waiting",
  running: "Running",
  integrating: "Merging",
  completed: "Done",
  failed: "Failed",
  blocked: "Blocked",
  needs_attention: "Needs you",
  cancelled: "Cancelled",
  skipped: "Skipped",
};

export const AGENT_LABEL: Record<AgentRun["status"], string> = {
  created: "Starting",
  running: "Running",
  paused: "Paused",
  waiting_approval: "Waiting for approval",
  completed: "Done",
  failed: "Failed",
  cancelled: "Cancelled",
};

export type Tone = "ok" | "bad" | "attention" | "live" | "muted";
export const TONE_CLASS: Record<Tone, string> = {
  ok: "border-diff-add/50 text-diff-add",
  bad: "border-destructive/50 text-destructive",
  attention: "border-primary/60 text-primary",
  live: "border-agent/60 text-agent-foreground",
  muted: "border-border text-muted-foreground",
};

export const subtaskTone = (s: SubtaskState["status"]): Tone =>
  s === "completed"
    ? "ok"
    : s === "failed"
      ? "bad"
      : s === "needs_attention" || s === "blocked"
        ? "attention"
        : s === "running" || s === "integrating"
          ? "live"
          : "muted";

export const agentTone = (s: AgentRun["status"]): Tone =>
  s === "completed"
    ? "ok"
    : s === "failed"
      ? "bad"
      : s === "waiting_approval" || s === "paused"
        ? "attention"
        : s === "running" || s === "created"
          ? "live"
          : "muted";

/** Dependency layers: each layer's subtasks depend only on earlier layers. */
export function layers(subs: SubtaskState[]): SubtaskState[][] {
  const out: SubtaskState[][] = [];
  const placed = new Set<string>();
  const ids = new Set(subs.map((s) => s.id));
  let rest = [...subs];
  while (rest.length) {
    const layer = rest.filter((s) =>
      [...s.dependsOn, ...s.implicitDeps].every((d) => placed.has(d) || !ids.has(d)),
    );
    if (!layer.length) {
      out.push(rest);
      break;
    }
    out.push(layer);
    layer.forEach((s) => placed.add(s.id));
    rest = rest.filter((s) => !placed.has(s.id));
  }
  return out;
}

export const fmtTokens = (n: number) =>
  n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(n % 1_000_000 ? 1 : 0)}M`
    : n >= 10_000
      ? `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}k`
      : n.toLocaleString();

export function elapsed(from: number, to = Date.now()) {
  const s = Math.max(0, Math.round((to - from) / 1000));
  return s < 60
    ? `${s}s`
    : s < 3600
      ? `${Math.floor(s / 60)}m ${s % 60}s`
      : `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}
