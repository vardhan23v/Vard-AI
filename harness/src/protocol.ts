/**
 * JSON-lines protocol between the Tauri shell (Rust) and the vard-agent sidecar.
 *
 * Every line on stdin is one Request; every line on stdout is one Event.
 * Requests carry a caller-chosen `id`. Events echo that `id`, and task events
 * also carry the `taskId` so the UI can route them to the right task view.
 */
import { z } from "zod";
import { Category as MemoryCategory, MemoryEntry, MemorySettings } from "./memory/schema";
import { AgentMessage, AgentRun, IntegrationRecord, OrchControl, OrchestrationState, OrchPhase, ReviewResult, RoleConfig, RoleId, RoleOverride, SubtaskState, TaskGraph, TeamRequest } from "./agents/schema";
import { ActivatedSkill, SkillChange, SkillSummary, SkillUsage } from "./skills/schema";
import { McpCallInfo, McpPromptInfo, McpResourceInfo, McpScope, McpServerStatus, McpToolInfo } from "./mcp/types";

export { MemoryCategory, MemoryEntry, MemorySettings };

// ---------- shared ----------

export const ProviderId = z.enum(["anthropic", "openai", "google", "ollama", "openai-compatible", "groq"]);
export type ProviderId = z.infer<typeof ProviderId>;

export const ProviderConfig = z.object({
  provider: ProviderId,
  model: z.string().min(1),
  /** BYOK key, supplied per request by the shell from the macOS Keychain. Never persisted by the sidecar. */
  apiKey: z.string().optional(),
  baseUrl: z.string().url().optional(),
});
export type ProviderConfig = z.infer<typeof ProviderConfig>;

export const ChatMessage = z.object({
  role: z.enum(["system", "user", "assistant"]),
  content: z.string(),
});
export type ChatMessage = z.infer<typeof ChatMessage>;

export const ApprovalDecision = z.enum(["allow_once", "always", "deny"]);
export type ApprovalDecision = z.infer<typeof ApprovalDecision>;

const reqBase = { id: z.string().min(1) };

// ---------- requests ----------

export const PingRequest = z.object({ ...reqBase, type: z.literal("ping") });

export const ChatSendRequest = z.object({
  ...reqBase,
  type: z.literal("chat.send"),
  provider: ProviderConfig,
  messages: z.array(ChatMessage).min(1),
  system: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
});

export const TaskStartRequest = z.object({
  ...reqBase,
  type: z.literal("task.start"),
  /** Defaults to the request id. */
  taskId: z
    .string()
    .regex(/^[A-Za-z0-9._-]+$/, "taskId may only contain letters, digits, '.', '_' and '-'")
    .optional(),
  projectRoot: z.string().min(1),
  prompt: z.string().min(1),
  provider: ProviderConfig,
  planFirst: z.boolean().default(true),
  useWorktree: z.boolean().default(true),
  maxSteps: z.number().int().positive().max(500).optional(),
  tokenBudget: z.number().int().positive().optional(),
  /** Extra per-project command allowlist entries on top of the persisted ones. */
  allowlist: z.array(z.string()).optional(),
  verifyCommand: z.string().optional(),
  /** Read the project's memory into the prompt (unset means yes). */
  useMemory: z.boolean().optional(),
  /** After a successful task, propose memory additions (unset means yes). */
  learn: z.boolean().optional(),
  /** Skills the user picked by name (always used; the task fails if one isn't usable). */
  skills: z.array(z.string().min(1).max(200)).max(10).optional(),
  /** Pick relevant skills automatically (unset means yes). */
  autoSkills: z.boolean().optional(),
  /** "team": a planner splits the work across specialist agents (needs a git repo). */
  mode: z.enum(["single", "team"]).optional(),
  team: TeamRequest.optional(),
});

export const TaskApproveRequest = z.object({
  ...reqBase,
  type: z.literal("task.approve"),
  taskId: z.string().min(1),
  approvalId: z.string().min(1),
  decision: ApprovalDecision,
  /** Optional feedback; for a denied plan this is passed back to the model. */
  reason: z.string().optional(),
  /** For plan approvals: an edited plan replacing the model's. */
  plan: z.string().optional(),
  /** For team plans: the edited task graph. */
  graph: z.unknown().optional(),
});

export const TaskCancelRequest = z.object({
  ...reqBase,
  type: z.literal("task.cancel"),
  /** A task id, or the id of a chat.send request. */
  taskId: z.string().min(1),
});

export const TaskDiffRequest = z.object({ ...reqBase, type: z.literal("task.diff"), taskId: z.string().min(1) });
export const TaskMergeRequest = z.object({ ...reqBase, type: z.literal("task.merge"), taskId: z.string().min(1) });
export const TaskDiscardRequest = z.object({ ...reqBase, type: z.literal("task.discard"), taskId: z.string().min(1) });

// ---------- project memory (<project>/.vard/memory.json) ----------

const memReq = { ...reqBase, projectRoot: z.string().min(1) };
const entryId = z.string().min(1).max(64);
const memText = z.string().min(1).max(600);
export const MemoryChange = z.discriminatedUnion("op", [
  z.object({ op: z.literal("add"), category: MemoryCategory, text: memText }),
  z.object({ op: z.literal("edit"), entryId, text: memText.optional(), category: MemoryCategory.optional() }),
  z.object({ op: z.literal("delete"), entryId }),
  z.object({ op: z.literal("verify"), entryId }),
  z.object({ op: z.literal("clear") }),
  z.object({ op: z.literal("analyze") }),
  z.object({ op: z.literal("settings"), settings: MemorySettings.partial() }),
  /** Save approved proposals (verified). `replaces` turns the old entry into history. */
  z.object({
    op: z.literal("accept"),
    items: z
      .array(z.object({ category: MemoryCategory, text: memText, replaces: entryId.optional(), taskId: z.string().optional() }))
      .max(20),
  }),
]);
export type MemoryChange = z.infer<typeof MemoryChange>;
export const MemoryGetRequest = z.object({ ...memReq, type: z.literal("memory.get") });
export const MemoryUpdateRequest = z.object({ ...memReq, type: z.literal("memory.update"), change: MemoryChange });

// ---------- MCP servers (harness/src/mcp) ----------

const mcpRef = { ...reqBase, scope: McpScope, id: z.string().min(1).max(40), projectRoot: z.string().min(1).optional() };
export const McpListRequest = z.object({ ...reqBase, type: z.literal("mcp.list"), projectRoot: z.string().min(1).optional() });
export const McpConfigRequest = z.object({
  ...reqBase,
  type: z.literal("mcp.config"),
  scope: McpScope,
  projectRoot: z.string().min(1).optional(),
  change: z.discriminatedUnion("op", [
    /** Add or replace a server (validated by the agent against McpServerConfig). */
    z.object({ op: z.literal("save"), server: z.unknown(), replaceId: z.string().optional() }),
    z.object({ op: z.literal("remove"), id: z.string() }),
    z.object({ op: z.literal("trust"), trusted: z.boolean() }),
    /** Import another client's config (a known file path, or pasted JSON). Imported servers start disabled. */
    z.object({ op: z.literal("import"), file: z.string().optional(), json: z.unknown().optional() }),
  ]),
});
export const McpConnectionRequest = z.object({
  ...mcpRef,
  type: z.literal("mcp.connection"),
  action: z.enum(["connect", "disconnect", "reconnect", "test", "authorize"]),
  /** For "test" before saving: an unsaved server config. */
  server: z.unknown().optional(),
});
export const McpInspectRequest = z.object({ ...mcpRef, type: z.literal("mcp.inspect"), kind: z.enum(["tools", "resources", "prompts", "logs"]) });
export const McpReadResourceRequest = z.object({ ...mcpRef, type: z.literal("mcp.read_resource"), uri: z.string().min(1).max(4000) });
export const McpGetPromptRequest = z.object({
  ...mcpRef,
  type: z.literal("mcp.get_prompt"),
  name: z.string().min(1),
  args: z.record(z.string(), z.string().max(20_000)).default({}),
});
export const McpPermissionsRequest = z.object({
  ...reqBase,
  type: z.literal("mcp.permissions"),
  projectRoot: z.string().min(1),
  change: z.discriminatedUnion("op", [
    z.object({ op: z.literal("list") }),
    /** key "<server>/<tool>" ("<server>/*" for the whole server); null clears (back to "ask"). */
    z.object({ op: z.literal("set"), key: z.string().min(3).max(300), value: z.enum(["allow", "deny"]).nullable() }),
    /** Clears every rule starting with prefix ("" = all, "<server>/" = one server). */
    z.object({ op: z.literal("revoke"), prefix: z.string().max(300) }),
  ]),
});
/** Stores a server secret in the Keychain (null clears). The value is never sent back. */
export const McpSecretRequest = z.object({ ...mcpRef, type: z.literal("mcp.secret"), name: z.string().min(1).max(140), value: z.string().max(20_000).nullable() });

// ---------- skills ----------

const skillsReq = { ...reqBase, projectRoot: z.string().min(1).optional() };
export const SkillsListRequest = z.object({ ...skillsReq, type: z.literal("skills.list") });
export const SkillsGetRequest = z.object({ ...skillsReq, type: z.literal("skills.get"), skillId: z.string().min(1).max(200) });
export const SkillsUpdateRequest = z.object({ ...skillsReq, type: z.literal("skills.update"), change: SkillChange });

// ---------- team runs ----------

export const OrchControlRequest = z.object({
  ...reqBase,
  type: z.literal("orch.control"),
  taskId: z.string().min(1),
  action: OrchControl,
  subtaskId: z.string().optional(),
  /** For retry_subtask: guidance (or the answer to the agent's question) for the next attempt. */
  note: z.string().max(4000).optional(),
});
/** Current state of a team run (after a reconnect). */
export const OrchStatusRequest = z.object({ ...reqBase, type: z.literal("orch.status"), taskId: z.string().min(1) });
export const AgentsRolesRequest = z.object({
  ...reqBase,
  type: z.literal("agents.roles"),
  projectRoot: z.string().min(1).optional(),
  change: z
    .discriminatedUnion("op", [
      z.object({ op: z.literal("save"), scope: z.enum(["global", "project"]), role: RoleId, override: RoleOverride }),
      z.object({ op: z.literal("reset"), scope: z.enum(["global", "project"]), role: RoleId }),
    ])
    .optional(),
});

export const Request = z.discriminatedUnion("type", [
  PingRequest,
  ChatSendRequest,
  TaskStartRequest,
  TaskApproveRequest,
  TaskCancelRequest,
  TaskDiffRequest,
  TaskMergeRequest,
  TaskDiscardRequest,
  MemoryGetRequest,
  MemoryUpdateRequest,
  McpListRequest,
  McpConfigRequest,
  McpConnectionRequest,
  McpInspectRequest,
  McpReadResourceRequest,
  McpGetPromptRequest,
  McpPermissionsRequest,
  McpSecretRequest,
  SkillsListRequest,
  SkillsGetRequest,
  SkillsUpdateRequest,
  OrchControlRequest,
  OrchStatusRequest,
  AgentsRolesRequest,
]);
export type Request = z.infer<typeof Request>;
export type TaskStartRequest = z.infer<typeof TaskStartRequest>;

// ---------- events ----------

const evBase = {
  /** The request id this event answers. */
  id: z.string(),
  taskId: z.string().optional(),
  ts: z.number(),
  /** In a team run: the agent that produced this event. */
  agentId: z.string().optional(),
  /** In a team run: per-task sequence number, for dropping duplicates after a reconnect. */
  seq: z.number().optional(),
};

export const TaskState = z.enum([
  "planning",
  "awaiting_plan_approval",
  "acting",
  "observing",
  "verifying",
  "done",
  "blocked",
  "cancelled",
]);
export type TaskState = z.infer<typeof TaskState>;

export const Usage = z.object({
  inputTokens: z.number(),
  outputTokens: z.number(),
  totalTokens: z.number(),
});
export type Usage = z.infer<typeof Usage>;

export const Event = z.discriminatedUnion("type", [
  z.object({ ...evBase, type: z.literal("pong"), version: z.string() }),
  z.object({ ...evBase, type: z.literal("state"), state: TaskState }),
  z.object({ ...evBase, type: z.literal("token"), text: z.string() }),
  z.object({
    ...evBase,
    type: z.literal("tool_call"),
    callId: z.string(),
    tool: z.string(),
    input: z.unknown(),
    /** Set when the tool comes from an MCP server. */
    mcp: z.object({ serverId: z.string(), serverName: z.string(), tool: z.string() }).optional(),
  }),
  z.object({
    ...evBase,
    type: z.literal("tool_result"),
    callId: z.string(),
    tool: z.string(),
    ok: z.boolean(),
    output: z.string(),
  }),
  z.object({
    ...evBase,
    type: z.literal("approval_request"),
    approvalId: z.string(),
    kind: z.enum(["plan", "tool"]),
    tool: z.string().optional(),
    input: z.unknown().optional(),
    plan: z.string().optional(),
    reason: z.string(),
    /** For MCP tools: server, tool, and what the call can do (destructive ones can't be "always"). */
    mcp: McpCallInfo.optional(),
    /** "Always for this project" isn't offered (skill scripts ask every time). */
    noAlways: z.boolean().optional(),
    /** Team runs: the structured plan being approved. */
    graph: TaskGraph.optional(),
  }),
  z.object({ ...evBase, type: z.literal("plan"), plan: z.string() }),
  z.object({
    ...evBase,
    type: z.literal("todos"),
    todos: z.array(z.object({ id: z.string(), content: z.string(), status: z.string() })),
  }),
  z.object({
    ...evBase,
    type: z.literal("verify"),
    status: z.enum(["running", "passed", "failed"]),
    command: z.string(),
    output: z.string().optional(),
  }),
  z.object({ ...evBase, type: z.literal("usage"), step: Usage, total: Usage }),
  /** A transient provider error (rate limit, overload); the step is retried after delayMs. */
  z.object({
    ...evBase,
    type: z.literal("retry"),
    attempt: z.number(),
    maxAttempts: z.number(),
    delayMs: z.number(),
    message: z.string(),
  }),
  z.object({
    ...evBase,
    type: z.literal("diff"),
    diff: z.string(),
    stat: z.string(),
  }),
  z.object({
    ...evBase,
    type: z.literal("worktree"),
    action: z.enum(["created", "merged", "discarded"]),
    path: z.string().optional(),
    branch: z.string().optional(),
  }),
  z.object({
    ...evBase,
    type: z.literal("done"),
    status: z.enum(["done", "blocked", "cancelled"]),
    summary: z.string(),
    reason: z.string().optional(),
    steps: z.number().optional(),
    usage: Usage.optional(),
    diffStat: z.string().optional(),
  }),
  /** MCP servers visible in a project (or globally), with live status. Also pushed on changes (id "mcp"). */
  z.object({
    ...evBase,
    type: z.literal("mcp_servers"),
    projectRoot: z.string().optional(),
    servers: z.array(McpServerStatus),
    trusted: z.boolean().optional(),
    /** Other MCP clients' config files found on this Mac (for import). */
    importSources: z.array(z.object({ label: z.string(), file: z.string() })).optional(),
    imported: z.array(z.string()).optional(),
  }),
  z.object({
    ...evBase,
    type: z.literal("mcp_test"),
    ok: z.boolean(),
    error: z.string().optional(),
    serverInfo: z.object({ name: z.string(), version: z.string() }).optional(),
    protocolVersion: z.string().optional(),
    capabilities: z.array(z.string()).optional(),
    tools: z.number().optional(),
    resources: z.number().optional(),
    prompts: z.number().optional(),
    logs: z.array(z.string()),
  }),
  z.object({
    ...evBase,
    type: z.literal("mcp_inspect"),
    kind: z.enum(["tools", "resources", "prompts", "logs"]),
    tools: z.array(McpToolInfo).optional(),
    resources: z.array(McpResourceInfo).optional(),
    prompts: z.array(McpPromptInfo).optional(),
    logs: z.array(z.string()).optional(),
  }),
  z.object({ ...evBase, type: z.literal("mcp_resource"), uri: z.string(), text: z.string() }),
  z.object({ ...evBase, type: z.literal("mcp_prompt"), name: z.string(), description: z.string().optional(), text: z.string() }),
  z.object({ ...evBase, type: z.literal("mcp_permissions"), projectRoot: z.string(), rules: z.record(z.string(), z.enum(["allow", "deny"])) }),
  z.object({
    ...evBase,
    type: z.literal("mcp_progress"),
    tool: z.string(),
    progress: z.number(),
    total: z.number().optional(),
    message: z.string().optional(),
  }),
  /** A project's memory (answer to memory.get / memory.update). Includes history entries. */
  z.object({
    ...evBase,
    type: z.literal("memory"),
    path: z.string(),
    settings: MemorySettings,
    analyzedAt: z.string().optional(),
    entries: z.array(MemoryEntry),
    /** For "accept"/"add": how many were saved and which were already known. */
    saved: z.number().optional(),
    duplicates: z.array(z.string()).optional(),
  }),
  /** Which memory entries went into the agent's context for this task. */
  z.object({
    ...evBase,
    type: z.literal("memory_recall"),
    count: z.number(),
    total: z.number(),
    chars: z.number(),
    ids: z.array(z.string()),
  }),
  /**
   * Notes the agent suggests after a successful task. In "ask" mode they are saved only when the
   * user accepts them (memory.update accept); in "auto" mode some arrive already saved (autoSaved,
   * as inferred entries; `id` is then the entry id, so the UI can undo by deleting it).
   */
  z.object({
    ...evBase,
    type: z.literal("memory_proposal"),
    items: z.array(
      z.object({
        id: z.string(),
        category: MemoryCategory,
        text: z.string(),
        replaces: z.string().optional(),
        replacesText: z.string().optional(),
        autoSaved: z.boolean().optional(),
      }),
    ),
  }),
  z.object({
    ...evBase,
    type: z.literal("skills"),
    projectRoot: z.string().optional(),
    skills: z.array(SkillSummary),
    /** Whether this project's skills are trusted (undefined without a project or project skills). */
    trusted: z.boolean().optional(),
    globalDir: z.string(),
    projectDir: z.string().optional(),
    /** Set after create/save/import/delete. */
    changed: z.string().optional(),
  }),
  z.object({
    ...evBase,
    type: z.literal("skill_detail"),
    skill: SkillSummary,
    text: z.string(),
    body: z.string(),
    usage: z.array(SkillUsage),
    /** What the agent would see, and its approximate size. */
    preview: z.object({ text: z.string(), tokens: z.number() }),
  }),
  z.object({
    ...evBase,
    type: z.literal("skill_validation"),
    valid: z.boolean(),
    errors: z.array(z.string()),
    warnings: z.array(z.string()),
    name: z.string().optional(),
  }),
  z.object({
    ...evBase,
    type: z.literal("skills_activated"),
    skills: z.array(ActivatedSkill),
    /** Approximate tokens the skills add to the context. */
    tokens: z.number(),
  }),
  // Team runs (mode "team"). All carry the task id and a per-task `seq`.
  z.object({ ...evBase, type: z.literal("orch_snapshot"), state: OrchestrationState }),
  z.object({ ...evBase, type: z.literal("orch_phase"), phase: OrchPhase, reason: z.string().optional() }),
  z.object({ ...evBase, type: z.literal("orch_plan"), graph: TaskGraph, approved: z.boolean().optional() }),
  z.object({ ...evBase, type: z.literal("orch_task"), subtask: SubtaskState, why: z.string().optional() }),
  z.object({ ...evBase, type: z.literal("orch_agent"), agent: AgentRun }),
  z.object({ ...evBase, type: z.literal("orch_integration"), record: IntegrationRecord }),
  z.object({ ...evBase, type: z.literal("orch_review"), review: ReviewResult }),
  z.object({ ...evBase, type: z.literal("agent_message"), message: AgentMessage }),
  z.object({
    ...evBase,
    type: z.literal("agent_roles"),
    roles: z.array(RoleConfig),
    overrides: z.object({ global: z.record(z.string(), RoleOverride), project: z.record(z.string(), RoleOverride) }),
  }),
  z.object({ ...evBase, type: z.literal("error"), message: z.string(), code: z.string().optional() }),
]);
export type Event = z.infer<typeof Event>;

/** An event before the router stamps `id`/`ts` on it. */
export type EventBody = Event extends infer E ? (E extends Event ? Omit<E, "id" | "ts" | "taskId"> : never) : never;

export type ParseResult = { ok: true; request: Request } | { ok: false; id?: string; message: string };

/** Parse one JSON line into a Request, returning a friendly error instead of throwing. */
export function parseRequest(line: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(line);
  } catch (e) {
    return { ok: false, message: `invalid JSON: ${(e as Error).message}` };
  }
  const id = typeof raw === "object" && raw && typeof (raw as any).id === "string" ? (raw as any).id : undefined;
  const parsed = Request.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join(".") || "<root>"}: ${i.message}`).join("; ");
    return { ok: false, id, message: `invalid request: ${msg}` };
  }
  return { ok: true, request: parsed.data };
}

export function serializeEvent(e: Event): string {
  return JSON.stringify(e);
}
