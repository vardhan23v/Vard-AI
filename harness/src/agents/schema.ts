/**
 * Multi-agent (team) types shared by the harness, the CLI and the app (through protocol.ts).
 * No Node imports here: the WebView typechecks this file.
 */
import { z } from "zod";
import { ActivatedSkill } from "../skills/schema";

export const ROLE_IDS = ["planner", "frontend", "backend", "database", "testing", "browser", "analyst", "reviewer"] as const;
export const RoleId = z.enum(ROLE_IDS);
export type RoleId = z.infer<typeof RoleId>;
/** Roles that can be assigned subtasks (the planner and reviewer run on their own). */
export const WORKER_ROLES = ["frontend", "backend", "database", "testing", "browser", "analyst"] as const;

const ModelRef = z.object({
  provider: z.enum(["anthropic", "openai", "google", "ollama", "openai-compatible", "groq"]),
  model: z.string().min(1).max(200),
  baseURL: z.string().url().optional(),
});
export type ModelRef = z.infer<typeof ModelRef>;

export const RoleTools = z.object({
  /** edit_file / write_file (in the agent's own worktree). */
  write: z.boolean(),
  /** run_command (still checked by the policy and approvals). */
  exec: z.boolean(),
  /** MCP tools: none, only those marked read-only and not destructive, or all. */
  mcp: z.enum(["none", "read", "all"]),
  /** The isolated test browser and dev servers. */
  browser: z.boolean().default(false),
});
export type RoleTools = z.infer<typeof RoleTools>;

export const RoleConfig = z.object({
  id: RoleId,
  name: z.string(),
  description: z.string(),
  instructions: z.string(),
  /** Model for this role; unset uses the task's model. */
  model: ModelRef.optional(),
  tools: RoleTools,
  /** Skills this role prefers (still validated and ranked). */
  skills: z.array(z.string()),
  maxSteps: z.number().int().min(1).max(500),
  timeoutMs: z.number().int().min(10_000).max(3_600_000),
});
export type RoleConfig = z.infer<typeof RoleConfig>;

/** A user override for one role. Tool permissions can only be narrowed. */
export const RoleOverride = z.object({
  instructions: z.string().max(4000).optional(),
  model: ModelRef.nullable().optional(),
  tools: RoleTools.partial().optional(),
  skills: z.array(z.string().max(64)).max(10).optional(),
  maxSteps: z.number().int().min(1).max(500).optional(),
  timeoutMs: z.number().int().min(10_000).max(3_600_000).optional(),
});
export type RoleOverride = z.infer<typeof RoleOverride>;

export const AgentsFile = z.object({
  version: z.literal(1),
  roles: z.record(z.string(), RoleOverride).default({}),
});
export type AgentsFile = z.infer<typeof AgentsFile>;

export const SUBTASK_ID_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;

export const SubTask = z.object({
  id: z.string().regex(SUBTASK_ID_RE, "ids are lowercase letters, digits and '-' (max 40)"),
  title: z.string().min(1).max(200),
  role: z.enum(WORKER_ROLES),
  description: z.string().min(1).max(4000),
  dependsOn: z.array(z.string()).max(12).default([]),
  /** Paths or globs the subtask expects to change (used to serialise overlapping work). */
  files: z.array(z.string().max(300)).max(40).default([]),
  acceptance: z.string().max(1500).optional(),
});
export type SubTask = z.infer<typeof SubTask>;

export const TaskGraph = z.object({
  summary: z.string().max(2000).default(""),
  tasks: z.array(SubTask).min(1),
});
export type TaskGraph = z.infer<typeof TaskGraph>;

export const SubtaskStatus = z.enum([
  "pending",
  "running",
  "integrating",
  "completed",
  "failed",
  "blocked",
  "needs_attention",
  "cancelled",
  "skipped",
]);
export type SubtaskStatus = z.infer<typeof SubtaskStatus>;

const Usage = z.object({ inputTokens: z.number(), outputTokens: z.number(), totalTokens: z.number() });

export const SubtaskResult = z.object({
  summary: z.string(),
  files: z.array(z.string()),
  stat: z.string(),
  commit: z.string().optional(),
});
export type SubtaskResult = z.infer<typeof SubtaskResult>;

export const SubtaskState = SubTask.extend({
  status: SubtaskStatus,
  attempts: z.number(),
  /** Dependencies added because subtasks touch the same files. */
  implicitDeps: z.array(z.string()),
  agentId: z.string().optional(),
  error: z.string().optional(),
  /** A question from the agent, or the user's note for the next attempt. */
  question: z.string().optional(),
  note: z.string().optional(),
  blockedBy: z.array(z.string()).optional(),
  result: SubtaskResult.optional(),
  /** Set for fix-up subtasks created from review findings. */
  fixOf: z.string().optional(),
  /** Browser checks: the original check this re-tests, and the round (1, 2, …). */
  retestOf: z.string().optional(),
  retestRound: z.number().optional(),
  /** Browser checks: pass/fail and what failed. */
  check: z.object({ verdict: z.enum(["pass", "fail", "unknown"]), findings: z.array(z.object({ severity: z.enum(["high", "medium", "low"]), message: z.string(), file: z.string().optional(), viewport: z.string().optional() })) }).optional(),
  startedAt: z.number().optional(),
  endedAt: z.number().optional(),
});
export type SubtaskState = z.infer<typeof SubtaskState>;

export const AgentStatus = z.enum(["created", "running", "paused", "waiting_approval", "completed", "failed", "cancelled"]);
export type AgentStatus = z.infer<typeof AgentStatus>;

export const AgentRun = z.object({
  agentId: z.string(),
  role: RoleId,
  subtaskId: z.string().optional(),
  attempt: z.number(),
  /** "provider/model". */
  model: z.string(),
  status: AgentStatus,
  skills: z.array(ActivatedSkill),
  /** Tool names this agent may call (before policy and approvals). */
  tools: z.array(z.string()),
  steps: z.number(),
  maxSteps: z.number(),
  usage: Usage,
  /** Last thing the agent did (a tool call or the start of its text). */
  activity: z.string().optional(),
  toolCalls: z.number(),
  /** MCP tools this agent called, "server/tool" → count. */
  mcpCalls: z.record(z.string(), z.number()),
  workspace: z.object({ path: z.string(), branch: z.string().optional() }).optional(),
  error: z.string().optional(),
  summary: z.string().optional(),
  startedAt: z.number(),
  endedAt: z.number().optional(),
});
export type AgentRun = z.infer<typeof AgentRun>;

export const MessageKind = z.enum([
  "task_assigned",
  "task_started",
  "task_completed",
  "task_failed",
  "dependency_blocked",
  "clarification_required",
  "review_requested",
  "review_completed",
  "review_rejected",
  "integration_completed",
  "integration_conflict",
]);
export const AgentMessage = z.object({
  seq: z.number(),
  kind: MessageKind,
  from: z.string(),
  to: z.string().optional(),
  subtaskId: z.string().optional(),
  text: z.string(),
  at: z.number(),
});
export type AgentMessage = z.infer<typeof AgentMessage>;

export const ReviewFinding = z.object({
  severity: z.enum(["critical", "high", "medium", "low"]),
  file: z.string().max(400).optional(),
  line: z.number().int().optional(),
  message: z.string().max(2000),
  subtask: z.string().optional(),
});
export type ReviewFinding = z.infer<typeof ReviewFinding>;

export const ReviewResult = z.object({
  round: z.number(),
  verdict: z.enum(["approve", "changes_requested", "unavailable"]),
  summary: z.string(),
  findings: z.array(ReviewFinding),
  verify: z.object({ command: z.string(), ok: z.boolean(), output: z.string() }).optional(),
  agentId: z.string().optional(),
  at: z.number(),
});
export type ReviewResult = z.infer<typeof ReviewResult>;

export const IntegrationRecord = z.object({
  subtaskId: z.string(),
  status: z.enum(["merged", "empty", "conflict"]),
  files: z.array(z.string()),
  commit: z.string().optional(),
  at: z.number(),
});
export type IntegrationRecord = z.infer<typeof IntegrationRecord>;

export const OrchPhase = z.enum([
  "planning",
  "awaiting_approval",
  "running",
  "paused",
  "attention",
  "reviewing",
  "done",
  "failed",
  "cancelled",
]);
export type OrchPhase = z.infer<typeof OrchPhase>;

/** Team options as sent in task.start (all optional). */
export const TeamRequest = z.object({
  /** Agents running at once (1–6, default 3). */
  maxAgents: z.number().int().min(1).max(6).optional(),
  /** Most subtasks the planner may create (1–12, default 8). */
  maxSubtasks: z.number().int().min(1).max(12).optional(),
  /** Per-agent time limit (default: the role's). */
  timeoutMs: z.number().int().min(10_000).max(3_600_000).optional(),
  /** Token budget for the whole run (all agents). */
  tokenBudget: z.number().int().positive().optional(),
  /** Automatic retries per subtask after a failure or merge conflict (default 1). */
  retries: z.number().int().min(0).max(3).optional(),
  /** Browser checks that fail start fix subtasks and a re-test, at most this many times (0–3, default 2). */
  retestRounds: z.number().int().min(0).max(3).optional(),
  /** Review the combined change and run one fix round (default on). */
  review: z.boolean().optional(),
  /** When subtasks fail: wait for the user ("ask", default) or finish with what succeeded. */
  onFailure: z.enum(["ask", "continue"]).optional(),
  /** Per-role models (the app's shell adds API keys to these, like the task's provider). */
  models: z.record(z.string(), z.unknown()).optional(),
});
export type TeamRequest = z.infer<typeof TeamRequest>;

/** Team options with defaults applied. */
export const TeamOptions = TeamRequest.transform((t) => ({
  ...t,
  maxAgents: t.maxAgents ?? 3,
  maxSubtasks: t.maxSubtasks ?? 8,
  retries: t.retries ?? 1,
  retestRounds: t.retestRounds ?? 2,
  review: t.review ?? true,
  onFailure: t.onFailure ?? ("ask" as const),
}));
export type TeamOptions = z.infer<typeof TeamOptions>;

export const OrchestrationState = z.object({
  goal: z.string(),
  phase: OrchPhase,
  reason: z.string().optional(),
  graph: TaskGraph.optional(),
  subtasks: z.array(SubtaskState),
  agents: z.array(AgentRun),
  messages: z.array(AgentMessage),
  integrations: z.array(IntegrationRecord),
  reviews: z.array(ReviewResult),
  usage: Usage,
  options: z.object({ maxAgents: z.number(), maxSubtasks: z.number(), retries: z.number(), review: z.boolean(), tokenBudget: z.number(), retestRounds: z.number().optional() }),
  integrationBranch: z.string().optional(),
  /** The last event `seq` included in this snapshot (later events have higher numbers). */
  seq: z.number(),
  startedAt: z.number(),
  endedAt: z.number().optional(),
});
export type OrchestrationState = z.infer<typeof OrchestrationState>;

export const OrchControl = z.enum(["pause", "resume", "cancel_subtask", "retry_subtask", "continue"]);
export type OrchControl = z.infer<typeof OrchControl>;
