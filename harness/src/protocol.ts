/**
 * JSON-lines protocol between the Tauri shell (Rust) and the vard-agent sidecar.
 *
 * Every line on stdin is one Request; every line on stdout is one Event.
 * Requests carry a caller-chosen `id`. Events echo that `id`, and task events
 * also carry the `taskId` so the UI can route them to the right task view.
 */
import { z } from "zod";
import { Category as MemoryCategory, MemoryEntry, MemorySettings } from "./memory/schema";

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
]);
export type Request = z.infer<typeof Request>;
export type TaskStartRequest = z.infer<typeof TaskStartRequest>;

// ---------- events ----------

const evBase = {
  /** The request id this event answers. */
  id: z.string(),
  taskId: z.string().optional(),
  ts: z.number(),
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
  z.object({ ...evBase, type: z.literal("tool_call"), callId: z.string(), tool: z.string(), input: z.unknown() }),
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
