/**
 * Live state of agent tasks, folded from sidecar events.
 * One subscription for the whole app; components read a task with useTask().
 *
 * Team runs: events carrying an `agentId` go to that agent's own timeline; orch_* events build
 * `team`. Every team event has a per-task `seq`, so duplicates (after a reconnect and an
 * orch.status snapshot) are dropped.
 */
import { useCallback, useSyncExternalStore } from "react";
import { onAgentEvent, send, type AgentEvent } from "@/lib/agent-client";
import { updateTask } from "./projects";
import { startBrowserStore } from "@/features/browser/useBrowser";

type Ev<T extends AgentEvent["type"]> = Extract<AgentEvent, { type: T }>;

export type TimelineItem =
  | { kind: "text"; text: string; ts: number }
  | {
      kind: "tool";
      callId: string;
      tool: string;
      input: unknown;
      result?: { ok: boolean; output: string };
      ts: number;
      /** Set for tools from MCP servers. */
      mcp?: { serverId: string; serverName: string; tool: string };
    }
  | { kind: "approval"; event: Ev<"approval_request">; decision?: string }
  | { kind: "verify"; event: Ev<"verify"> }
  | { kind: "error"; message: string; ts: number };

type OrchState = Ev<"orch_snapshot">["state"];
export type TeamState = Omit<OrchState, "seq"> & {
  lastSeq: number;
  /** Each agent's own timeline (text, tool calls, approvals, errors). */
  timelines: Record<string, TimelineItem[]>;
};
export type SubtaskState = OrchState["subtasks"][number];
export type AgentRun = OrchState["agents"][number];
export type ReviewResult = OrchState["reviews"][number];

export type LiveTask = {
  taskId: string;
  state?: Ev<"state">["state"];
  plan?: string;
  todos: Ev<"todos">["todos"];
  timeline: TimelineItem[];
  /** The approval shown first (the oldest open one). */
  pending?: Ev<"approval_request">;
  /** All open approvals (team runs can have several at once). */
  approvals: Ev<"approval_request">[];
  worktree?: { path?: string; branch?: string; action: string };
  diff?: { diff: string; stat: string };
  done?: Ev<"done">;
  usage?: Ev<"usage">["total"];
  /** Memories the agent suggested (or saved automatically) after finishing. */
  proposals?: Ev<"memory_proposal">["items"];
  /** How much project memory went into the agent's context. */
  recall?: { count: number; total: number };
  /** Skills chosen for this task. */
  skills?: Ev<"skills_activated">["skills"];
  /** Set for team runs. */
  team?: TeamState;
  /** The codebase overview the agent got from the code index. */
  code?: { overview: string; indexing: boolean };
  /** Browser work in this task (all agents): sessions, reports and dev servers. */
  browser?: {
    sessions: Record<string, Ev<"browser_session">["session"]>;
    reports: (Ev<"browser_report">["report"] & { sessionId: string; agentId?: string })[];
    servers: Record<string, Ev<"dev_server">["server"]>;
  };
};

const tasks = new Map<string, LiveTask>();
const listeners = new Set<() => void>();
let version = 0;
const emit = () => {
  version++;
  listeners.forEach((l) => l());
};

function get(taskId: string): LiveTask {
  let t = tasks.get(taskId);
  if (!t) {
    t = { taskId, todos: [], timeline: [], approvals: [] };
    tasks.set(taskId, t);
  }
  return t;
}

/** Folds a timeline event into a timeline; returns null for other events. */
function foldTimeline(list: TimelineItem[], e: AgentEvent): TimelineItem[] | null {
  const timeline = [...list];
  switch (e.type) {
    case "token": {
      const last = timeline[timeline.length - 1];
      if (last?.kind === "text")
        timeline[timeline.length - 1] = { ...last, text: last.text + e.text };
      else timeline.push({ kind: "text", text: e.text, ts: e.ts });
      return timeline;
    }
    case "tool_call":
      timeline.push({
        kind: "tool",
        callId: e.callId,
        tool: e.tool,
        input: e.input,
        ts: e.ts,
        mcp: e.mcp,
      });
      return timeline;
    case "tool_result": {
      const i = timeline.findIndex((x) => x.kind === "tool" && x.callId === e.callId);
      if (i >= 0)
        timeline[i] = {
          ...(timeline[i] as Extract<TimelineItem, { kind: "tool" }>),
          result: { ok: e.ok, output: e.output },
        };
      return timeline;
    }
    case "approval_request":
      timeline.push({ kind: "approval", event: e });
      return timeline;
    case "verify": {
      const i = timeline.findIndex(
        (x) => x.kind === "verify" && x.event.status === "running" && x.event.command === e.command,
      );
      if (i >= 0 && e.status !== "running") timeline[i] = { kind: "verify", event: e };
      else timeline.push({ kind: "verify", event: e });
      return timeline;
    }
    case "error":
      timeline.push({ kind: "error", message: e.message, ts: e.ts });
      return timeline;
    default:
      return null;
  }
}

const PHASE_STATUS: Record<OrchState["phase"], Ev<"state">["state"]> = {
  planning: "planning",
  awaiting_approval: "awaiting_plan_approval",
  running: "acting",
  paused: "acting",
  attention: "acting",
  reviewing: "verifying",
  done: "done",
  failed: "blocked",
  cancelled: "cancelled",
};

const emptyTeam = (): TeamState => ({
  goal: "",
  phase: "planning",
  subtasks: [],
  agents: [],
  messages: [],
  integrations: [],
  reviews: [],
  usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
  options: { maxAgents: 0, maxSubtasks: 0, retries: 0, review: true, tokenBudget: 0 },
  startedAt: Date.now(),
  lastSeq: 0,
  timelines: {},
});

const upsert = <T>(list: T[], item: T, key: (x: T) => string) => {
  const i = list.findIndex((x) => key(x) === key(item));
  if (i === -1) return [...list, item];
  const next = [...list];
  next[i] = item;
  return next;
};

function sumUsage(agents: AgentRun[]) {
  return agents.reduce(
    (u, a) => ({
      inputTokens: u.inputTokens + a.usage.inputTokens,
      outputTokens: u.outputTokens + a.usage.outputTokens,
      totalTokens: u.totalTokens + a.usage.totalTokens,
    }),
    { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
  );
}

function openApproval(t: LiveTask, e: Ev<"approval_request">): LiveTask {
  const approvals = [...t.approvals.filter((a) => a.approvalId !== e.approvalId), e];
  return { ...t, approvals, pending: approvals[0] };
}

/** Team events: orch_* and anything an agent emitted. Returns null for other events. */
function applyTeam(t: LiveTask, e: AgentEvent): LiveTask | null {
  const isOrch = e.type.startsWith("orch_") || e.type === "agent_message";
  if (!isOrch && !e.agentId) return null;
  let team = t.team ?? emptyTeam();
  if (e.type === "orch_snapshot") {
    const { seq, ...state } = e.state;
    team = {
      ...state,
      lastSeq: Math.max(team.lastSeq, e.seq ?? seq, seq),
      timelines: team.timelines,
    };
    void updateTask(t.taskId, { status: PHASE_STATUS[state.phase] });
    return { ...t, team, state: PHASE_STATUS[state.phase] };
  }
  if (e.seq !== undefined) {
    if (e.seq <= team.lastSeq) return t; // already applied
    team = { ...team, lastSeq: e.seq };
  }
  if (e.agentId) {
    const id = e.agentId;
    const folded = foldTimeline(team.timelines[id] ?? [], e);
    if (folded) team = { ...team, timelines: { ...team.timelines, [id]: folded } };
    const next = { ...t, team };
    return e.type === "approval_request" ? openApproval(next, e) : next;
  }
  switch (e.type) {
    case "orch_phase": {
      void updateTask(t.taskId, { status: PHASE_STATUS[e.phase] });
      return {
        ...t,
        team: { ...team, phase: e.phase, reason: e.reason },
        state: PHASE_STATUS[e.phase],
      };
    }
    case "orch_plan":
      return { ...t, team: { ...team, graph: e.graph }, plan: t.plan };
    case "orch_task":
      return { ...t, team: { ...team, subtasks: upsert(team.subtasks, e.subtask, (s) => s.id) } };
    case "orch_agent": {
      const agents = upsert(team.agents, e.agent, (a) => a.agentId);
      return { ...t, team: { ...team, agents, usage: sumUsage(agents) } };
    }
    case "orch_integration":
      return { ...t, team: { ...team, integrations: [...team.integrations, e.record] } };
    case "orch_review":
      return { ...t, team: { ...team, reviews: [...team.reviews, e.review] } };
    case "agent_message":
      return { ...t, team: { ...team, messages: [...team.messages, e.message].slice(-500) } };
    default:
      return { ...t, team };
  }
}

function applyBrowser(t: LiveTask, e: AgentEvent): LiveTask | null {
  const b = t.browser ?? { sessions: {}, reports: [], servers: {} };
  switch (e.type) {
    case "code_context":
      return { ...t, code: { overview: e.overview, indexing: !!e.indexing } };
    case "browser_session":
      return { ...t, browser: { ...b, sessions: { ...b.sessions, [e.session.id]: e.session } } };
    case "browser_report":
      return {
        ...t,
        browser: {
          ...b,
          reports: [
            ...b.reports,
            { ...e.report, sessionId: e.sessionId, agentId: e.agentId },
          ].slice(-20),
        },
      };
    case "dev_server":
      return { ...t, browser: { ...b, servers: { ...b.servers, [e.server.id]: e.server } } };
    default:
      return null;
  }
}

function apply(t: LiveTask, e: AgentEvent): LiveTask {
  const br = applyBrowser(t, e);
  if (br) return br;
  const team = applyTeam(t, e);
  if (team) return team;
  if (e.seq !== undefined && t.team) {
    // Orchestrator-level events (plan approval, verify, errors) are numbered too.
    if (e.seq <= t.team.lastSeq) return t;
    t = { ...t, team: { ...t.team, lastSeq: e.seq } };
  }
  const folded = foldTimeline(t.timeline, e);
  if (folded) {
    const next = { ...t, timeline: folded };
    if (e.type === "approval_request")
      return { ...openApproval(next, e), plan: e.kind === "plan" ? (e.plan ?? t.plan) : t.plan };
    return next;
  }
  switch (e.type) {
    case "state":
      void updateTask(t.taskId, { status: e.state });
      return { ...t, state: e.state };
    case "plan":
      void updateTask(t.taskId, { plan: e.plan });
      return { ...t, plan: e.plan };
    case "todos":
      return { ...t, todos: e.todos };
    case "usage":
      return { ...t, usage: e.total };
    case "worktree":
      if (e.action !== "created") void updateTask(t.taskId, { status: e.action });
      return {
        ...t,
        worktree: {
          path: e.path ?? t.worktree?.path,
          branch: e.branch ?? t.worktree?.branch,
          action: e.action,
        },
      };
    case "diff":
      return { ...t, diff: { diff: e.diff, stat: e.stat } };
    case "memory_proposal":
      return { ...t, proposals: e.items };
    case "memory_recall":
      return { ...t, recall: { count: e.count, total: e.total } };
    case "skills_activated":
      return { ...t, skills: e.skills };
    case "done":
      void updateTask(t.taskId, {
        status: e.status,
        summary: e.summary,
        diff_stat: e.diffStat ?? null,
        steps: e.steps ?? null,
        input_tokens: e.usage?.inputTokens ?? null,
        output_tokens: e.usage?.outputTokens ?? null,
      });
      return { ...t, done: e, pending: undefined, approvals: [] };
    default:
      return t;
  }
}

let started = false;
export function startTaskStore() {
  if (started) return;
  started = true;
  startBrowserStore();
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

/** Every task this app session has seen (re-renders on any change). */
export function useLiveTasks(): LiveTask[] {
  useSyncExternalStore(
    useCallback((cb: () => void) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    }, []),
    () => version,
  );
  return [...tasks.values()];
}

export function isRunning(t?: LiveTask) {
  return !!t && !t.done && !!t.state && !["done", "blocked", "cancelled"].includes(t.state);
}

// ---- actions ----
export const taskActions = {
  approve(
    taskId: string,
    approvalId: string,
    decision: "allow_once" | "always" | "deny",
    extra?: { reason?: string; plan?: string; graph?: unknown },
  ) {
    const t = get(taskId);
    const mark = (list: TimelineItem[]) =>
      list.map((x) =>
        x.kind === "approval" && x.event.approvalId === approvalId ? { ...x, decision } : x,
      );
    const approvals = t.approvals.filter((a) => a.approvalId !== approvalId);
    tasks.set(taskId, {
      ...t,
      approvals,
      pending: approvals[0],
      timeline: mark(t.timeline),
      team: t.team
        ? {
            ...t.team,
            timelines: Object.fromEntries(
              Object.entries(t.team.timelines).map(([k, v]) => [k, mark(v)]),
            ),
          }
        : undefined,
    });
    emit();
    return send({ type: "task.approve", taskId, approvalId, decision, ...extra });
  },
  cancel: (taskId: string) => send({ type: "task.cancel", taskId }),
  diff: (taskId: string) => send({ type: "task.diff", taskId }),
  merge: (taskId: string) => send({ type: "task.merge", taskId }),
  discard: (taskId: string) => send({ type: "task.discard", taskId }),
  /** Team runs. */
  control: (
    taskId: string,
    action: "pause" | "resume" | "cancel_subtask" | "retry_subtask" | "continue",
    subtaskId?: string,
    note?: string,
  ) => send({ type: "orch.control", taskId, action, subtaskId, note }),
  /** Ask for a fresh snapshot (after a reconnect). */
  sync: (taskId: string) => send({ type: "orch.status", taskId }),
};
