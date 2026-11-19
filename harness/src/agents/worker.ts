/**
 * Runs one agent (planner, a subtask worker, or the reviewer) through the existing AgentLoop.
 * There is no second agent loop: an agent is an AgentLoop with role-filtered tools, its own
 * skills, its own workspace and an `emit` that tags every event with the agent's id.
 */
import type { LanguageModel } from "ai";
import { AgentLoop, type ApprovalRequest, type ApprovalResponse, type LoopOptions, type LoopResult } from "../loop";
import type { MemoryStore } from "../memory";
import type { Policy } from "../policy";
import type { EventBody } from "../protocol";
import type { RetryOptions } from "../retry";
import type { SkillRegistry } from "../skills";
import { skillsForTask } from "../skills/task";
import type { ProjectSignals } from "../skills/resolver";
import { ALL_TOOLS, type ToolDef } from "../tools";
import { supportsVision } from "../catalog";
import type { AgentRun, RoleConfig } from "./schema";

export interface AgentEnv {
  taskId: string;
  /** Extra tools for a role (code intelligence for everyone; the browser for roles allowed it). */
  toolsFor?: (role: RoleConfig, vision: boolean) => ToolDef[];
  projectRoot: string;
  emit: (e: EventBody) => void;
  requestApproval: (a: ApprovalRequest) => Promise<ApprovalResponse>;
  modelFor: (role: RoleConfig) => { model: LanguageModel; label: string };
  policyFor: (workRoot: string) => Policy;
  mcp?: {
    tools: () => ToolDef[];
    summary: () => { name: string; id: string; tools: string[] }[];
    addRoot: (p: string) => void;
    removeRoot: (p: string) => void;
  };
  skills?: SkillRegistry;
  signals?: ProjectSignals;
  memory?: { store: MemoryStore; recall: boolean } | null;
  retry?: RetryOptions;
  /** Resolves immediately unless the run is paused. */
  gate: () => Promise<void>;
  paused: () => boolean;
  /** Called whenever an agent's state changes (the orchestrator emits orch_agent). */
  onAgent: (a: AgentRun) => void;
}

export interface AgentSpec {
  agentId: string;
  role: RoleConfig;
  /** The agent's user message (its assignment). */
  prompt: string;
  /** Text used to pick skills (the subtask, not the whole goal). */
  skillQuery: string;
  workRoot: string;
  workspace?: AgentRun["workspace"];
  subtaskId?: string;
  attempt: number;
  signal: AbortSignal;
  /** Extra tools for this agent (e.g. the reviewer's diff tool). */
  extraTools?: ToolDef[];
  /** Explicit skills (e.g. the reviewer's). */
  skills?: string[];
  maxSteps?: number;
  tokenBudget?: number;
}

/** Vard's built-in tools a role may use: reads always; writes and commands only if the role allows. */
export function roleTools(role: RoleConfig): ToolDef[] {
  return ALL_TOOLS.filter(
    (t) =>
      t.risk === "read" ||
      (t.risk === "write" && role.tools.write) ||
      // The browser tester runs commands only to start dev servers (dev_server_start).
      (t.risk === "exec" && role.tools.exec && role.id !== "browser"),
  );
}

/** MCP tools a role may see (the same shared connections; policy and approvals still apply). */
export function roleMcpTools(role: RoleConfig, tools: ToolDef[]): ToolDef[] {
  if (role.tools.mcp === "none") return [];
  if (role.tools.mcp === "all") return tools;
  return tools.filter((t) => t.mcp && (t.mcp.kind === "resource" || (t.mcp.readOnly && !t.mcp.destructive)));
}

const short = (v: unknown, n = 80) => {
  const s = typeof v === "string" ? v : JSON.stringify(v ?? {});
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
};

export async function runAgent(env: AgentEnv, spec: AgentSpec): Promise<{ result: LoopResult; agent: AgentRun }> {
  const { role } = spec;
  const { model, label } = env.modelFor(role);
  const vision = supportsVision(label.split("/")[0], label.split("/").slice(1).join("/"));
  const base = [...roleTools(role), ...(env.toolsFor?.(role, vision) ?? [])];
  const agent: AgentRun = {
    agentId: spec.agentId,
    role: role.id,
    subtaskId: spec.subtaskId,
    attempt: spec.attempt,
    model: label,
    status: "created",
    skills: [],
    tools: [],
    steps: 0,
    maxSteps: spec.maxSteps ?? role.maxSteps,
    usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    toolCalls: 0,
    mcpCalls: {},
    workspace: spec.workspace,
    startedAt: Date.now(),
  };
  let lastPush = 0;
  const push = (force = false) => {
    const now = Date.now();
    if (!force && now - lastPush < 400) return;
    lastPush = now;
    env.onAgent({ ...agent, skills: [...agent.skills], tools: [...agent.tools], mcpCalls: { ...agent.mcpCalls } });
  };

  // Skills for this agent only (role affinity + the subtask's own text).
  let skillBlock: { block: string; tools: ToolDef[] } | undefined;
  if (env.skills) {
    try {
      const s = skillsForTask({
        registry: env.skills,
        prompt: spec.skillQuery,
        explicit: spec.skills,
        role: role.id,
        hints: role.skills,
        signals: env.signals,
        taskId: env.taskId,
        agentId: spec.agentId,
        topK: 3,
        maxChars: 10_000,
      });
      agent.skills = s.activated;
      if (s.resolved.length) {
        skillBlock = { block: s.block, tools: s.tools };
        env.emit({ type: "skills_activated", agentId: spec.agentId, skills: s.activated, tokens: s.tokens });
      }
    } catch {
      // Skills must never stop an agent.
    }
  }
  const mcpTools = env.mcp ? () => roleMcpTools(role, env.mcp!.tools()) : undefined;
  agent.tools = [...base, ...(skillBlock?.tools ?? []), ...(spec.extraTools ?? []), ...(mcpTools?.() ?? [])].map((t) => t.name);
  push(true);

  const emit = (e: EventBody) => {
    env.emit({ ...e, agentId: spec.agentId } as EventBody);
    switch (e.type) {
      case "tool_call":
        agent.toolCalls++;
        agent.activity = `${e.tool} ${short(e.input)}`;
        if (e.mcp) {
          const k = `${e.mcp.serverName}/${e.mcp.tool}`;
          agent.mcpCalls[k] = (agent.mcpCalls[k] ?? 0) + 1;
        }
        push();
        break;
      case "token":
        if (!agent.activity?.startsWith("Writing")) {
          agent.activity = "Writing…";
          push();
        }
        break;
      case "usage":
        agent.usage = e.total;
        agent.steps++;
        push(true);
        break;
      case "approval_request":
        agent.status = "waiting_approval";
        agent.activity = e.kind === "tool" ? `Waiting for approval: ${e.tool}` : "Waiting for approval";
        push(true);
        break;
      case "tool_result":
        if (agent.status === "waiting_approval") {
          agent.status = "running";
          push(true);
        }
        break;
    }
  };

  const gate = async () => {
    if (!env.paused() || spec.signal.aborted) return;
    agent.status = "paused";
    push(true);
    // Cancelling (the run, this subtask, or a timeout) must wake a paused agent.
    await new Promise<void>((resolve) => {
      const done = () => {
        spec.signal.removeEventListener("abort", done);
        resolve();
      };
      spec.signal.addEventListener("abort", done, { once: true });
      void env.gate().then(done);
    });
    agent.status = "running";
    push(true);
  };

  const workRoot = spec.workRoot;
  const policy = env.policyFor(workRoot);
  if (env.mcp && workRoot !== env.projectRoot) env.mcp.addRoot(workRoot);
  const opts: LoopOptions = {
    // Unique per agent so approval ids never collide across agents.
    taskId: `${env.taskId}.${spec.agentId}`,
    prompt: spec.prompt,
    model,
    projectRoot: policy.projectRoot,
    workRoot,
    policy,
    emit,
    requestApproval: env.requestApproval,
    tools: [...base, ...(spec.extraTools ?? [])],
    planFirst: false,
    maxSteps: spec.maxSteps ?? role.maxSteps,
    tokenBudget: spec.tokenBudget,
    retry: env.retry,
    signal: spec.signal,
    memory: env.memory ?? null,
    skills: skillBlock,
    vision,
    gate,
    extraInstructions: `# Your role\n${role.name}: ${role.instructions}`,
    ...(mcpTools ? { extraTools: mcpTools, mcpSummary: env.mcp!.summary } : {}),
  };
  // A memory recall per agent uses the agent's own assignment, so each gets the notes relevant to it.
  if (opts.memory) opts.memory = { ...opts.memory };
  agent.status = "running";
  push(true);
  let result: LoopResult;
  try {
    result = await new AgentLoop(opts).run();
  } finally {
    if (env.mcp && workRoot !== env.projectRoot) env.mcp.removeRoot(workRoot);
  }
  agent.usage = result.usage;
  agent.steps = result.steps;
  agent.endedAt = Date.now();
  agent.summary = result.summary.slice(0, 2_000);
  agent.status = result.status === "done" ? "completed" : result.status === "cancelled" ? "cancelled" : "failed";
  if (result.status === "blocked") agent.error = result.reason;
  push(true);
  return { result, agent };
}
