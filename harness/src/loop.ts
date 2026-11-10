/**
 * The agent loop, as an explicit state machine:
 *
 *   planning ──▶ awaiting_plan_approval ──▶ acting ⇄ observing ──▶ verifying ──▶ done
 *        │                 │                   │          │              │
 *        └─────────────────┴───────────────────┴──────────┴──────────────┴──▶ blocked | cancelled
 *
 * - planning: the model may use read-only tools, then must produce a plan (skipped if planFirst=false).
 * - awaiting_plan_approval: an approval_request{kind:'plan'} goes to the UI; deny with a reason re-plans.
 * - acting: one model call (streamText) with all tools; text streams out as `token` events.
 * - observing: each tool call is validated, checked by the policy (allow/ask/deny), possibly sent for
 *   approval, executed, truncated and appended to the transcript.
 * - verifying: when the model stops calling tools, an optional verify command runs; failures are fed
 *   back to the model up to `verifyRetries` times.
 * Limits: maxSteps (model calls), tokenBudget (total tokens), cancel (AbortSignal).
 *
 * Tools are passed to the SDK without `execute`, so the harness — not the SDK — owns execution.
 */
import { type LanguageModel, type ModelMessage, streamText } from "ai";
import { buildSystemPrompt, compactMessages, repoMap } from "./context";
import { Policy } from "./policy";
import type { ApprovalDecision, EventBody, TaskState, Usage } from "./protocol";
import { ALL_TOOLS, type Todo, type ToolContext, type ToolDef, ToolError, toSdkTools, toolByName } from "./tools";
import { runCommand } from "./tools/command";
import { DEFAULT_RETRY, type RetryOptions, withRetry } from "./retry";
import { describeError, truncateMiddle } from "./util";

export interface ApprovalRequest {
  approvalId: string;
  kind: "plan" | "tool";
  reason: string;
  tool?: string;
  input?: unknown;
  plan?: string;
}

export interface ApprovalResponse {
  decision: ApprovalDecision;
  reason?: string;
  plan?: string;
}

export interface LoopOptions {
  taskId: string;
  prompt: string;
  model: LanguageModel;
  projectRoot: string;
  workRoot: string;
  policy: Policy;
  emit: (e: EventBody) => void;
  /** Ask the user; resolves when the UI answers. */
  requestApproval: (req: ApprovalRequest) => Promise<ApprovalResponse>;
  tools?: ToolDef[];
  planFirst?: boolean;
  maxSteps?: number;
  maxPlanSteps?: number;
  tokenBudget?: number;
  /** Estimated-token size at which old tool results get compacted. */
  contextBudget?: number;
  verifyCommand?: string;
  verifyRetries?: number;
  /** Backoff for rate limits / transient provider errors. */
  retry?: RetryOptions;
  signal?: AbortSignal;
}

export interface LoopResult {
  status: "done" | "blocked" | "cancelled";
  summary: string;
  reason?: string;
  steps: number;
  usage: Usage;
  todos: Todo[];
  messages: ModelMessage[];
}

class Cancelled extends Error {}
class Blocked extends Error {}

const zeroUsage = (): Usage => ({ inputTokens: 0, outputTokens: 0, totalTokens: 0 });

export class AgentLoop {
  state: TaskState = "planning";
  steps = 0;
  usage = zeroUsage();
  todos: Todo[] = [];
  messages: ModelMessage[] = [];
  private tools: ToolDef[];
  private approvalSeq = 0;
  private repoMapCache?: string;

  constructor(private o: LoopOptions) {
    this.tools = o.tools ?? ALL_TOOLS;
  }

  private setState(s: TaskState) {
    this.state = s;
    this.o.emit({ type: "state", state: s });
  }

  private checkCancel() {
    if (this.o.signal?.aborted) throw new Cancelled("cancelled");
  }

  async run(): Promise<LoopResult> {
    const o = this.o;
    let summary = "";
    try {
      this.messages.push({ role: "user", content: o.prompt });
      if (o.planFirst ?? true) await this.planPhase();

      this.setState("acting");
      let verifyAttempts = 0;
      for (;;) {
        const step = await this.modelStep(this.tools, "act");
        if (step.toolCalls.length) {
          await this.observe(step.toolCalls);
          continue;
        }
        summary = step.text;
        if (!o.verifyCommand) break;
        const v = await this.verify(o.verifyCommand);
        if (v.ok) break;
        if (verifyAttempts++ >= (o.verifyRetries ?? 2))
          throw new Blocked(`verification still failing after ${verifyAttempts} attempt(s)`);
        this.messages.push({
          role: "user",
          content: `Verification command \`${o.verifyCommand}\` failed:\n${v.output}\nFix the problem, then finish again.`,
        });
        this.setState("acting");
      }
      this.setState("done");
      return this.result("done", summary);
    } catch (e) {
      if (e instanceof Cancelled || o.signal?.aborted) {
        this.setState("cancelled");
        return this.result("cancelled", summary, "cancelled by user");
      }
      const reason = e instanceof Blocked ? e.message : `error: ${describeError(e)}`;
      if (!(e instanceof Blocked)) o.emit({ type: "error", message: reason });
      this.setState("blocked");
      return this.result("blocked", summary, reason);
    }
  }

  private result(status: LoopResult["status"], summary: string, reason?: string): LoopResult {
    return { status, summary, reason, steps: this.steps, usage: this.usage, todos: this.todos, messages: this.messages };
  }

  // ---------- phases ----------

  private async planPhase() {
    const o = this.o;
    const readOnly = this.tools.filter((t) => t.risk === "read");
    for (let attempt = 0; attempt < 3; attempt++) {
      this.setState("planning");
      let plan = "";
      for (let i = 0; ; i++) {
        const step = await this.modelStep(readOnly, "plan");
        if (!step.toolCalls.length) {
          plan = step.text.trim();
          break;
        }
        if (i >= (o.maxPlanSteps ?? 10)) throw new Blocked("planning did not converge");
        await this.observe(step.toolCalls);
        this.setState("planning");
      }
      if (!plan) throw new Blocked("the model returned an empty plan");
      o.emit({ type: "plan", plan });

      this.setState("awaiting_plan_approval");
      const answer = await this.approval({ kind: "plan", reason: "review the plan before the agent edits files", plan });
      if (answer.decision !== "deny") {
        const finalPlan = answer.plan?.trim() || plan;
        if (answer.plan) o.emit({ type: "plan", plan: finalPlan });
        this.messages.push({
          role: "user",
          content:
            (answer.plan ? `The user edited the plan. Follow this plan:\n${finalPlan}\n\n` : "The plan is approved. ") +
            "Execute it now. Keep the todo list updated with todo_write.",
        });
        return;
      }
      if (!answer.reason) throw new Blocked("plan rejected by user");
      this.messages.push({ role: "user", content: `The plan was rejected: ${answer.reason}\nRevise the plan.` });
    }
    throw new Blocked("plan rejected too many times");
  }

  private async modelStep(tools: ToolDef[], phase: "plan" | "act") {
    const o = this.o;
    this.checkCancel();
    if (this.steps >= (o.maxSteps ?? 50)) throw new Blocked(`step limit reached (${o.maxSteps ?? 50})`);
    if (this.usage.totalTokens >= (o.tokenBudget ?? 2_000_000))
      throw new Blocked(`token budget exhausted (${this.usage.totalTokens} tokens)`);
    this.steps++;

    this.repoMapCache ??= await repoMap(o.workRoot);
    const instructions = await buildSystemPrompt({
      workRoot: o.workRoot,
      todos: this.todos,
      phase,
      repoMap: this.repoMapCache,
    });
    const { messages, compacted } = compactMessages(this.messages, { budgetTokens: o.contextBudget ?? 120_000 });
    if (compacted) this.messages = messages;

    const { text, toolCalls, response, u } = await withRetry(
      async (markEmitted) => {
        const result = streamText({
          model: o.model,
          instructions,
          messages: this.messages,
          tools: toSdkTools(tools),
          abortSignal: o.signal,
          // The harness does its own, longer backoff (retry.ts).
          maxRetries: 0,
          // Errors surface through fullStream and become retry/error/blocked events; keep stderr quiet.
          onError: () => {},
        });
        let text = "";
        for await (const part of result.fullStream) {
          if (part.type === "text-delta") {
            text += part.text;
            markEmitted();
            o.emit({ type: "token", text: part.text });
          } else if (part.type === "error") {
            throw part.error instanceof Error ? part.error : new Error(String((part as any).error));
          }
        }
        const [toolCalls, response, u] = await Promise.all([result.toolCalls, result.response, result.usage]);
        return { text, toolCalls, response, u };
      },
      o.retry ?? DEFAULT_RETRY,
      (r) =>
        o.emit({
          type: "retry",
          attempt: r.attempt,
          maxAttempts: r.maxAttempts,
          delayMs: r.delayMs,
          message: describeError(r.error),
        }),
      o.signal,
    );
    this.messages.push(...(response.messages as ModelMessage[]));

    const step: Usage = {
      inputTokens: u.inputTokens ?? 0,
      outputTokens: u.outputTokens ?? 0,
      totalTokens: u.totalTokens ?? (u.inputTokens ?? 0) + (u.outputTokens ?? 0),
    };
    this.usage = {
      inputTokens: this.usage.inputTokens + step.inputTokens,
      outputTokens: this.usage.outputTokens + step.outputTokens,
      totalTokens: this.usage.totalTokens + step.totalTokens,
    };
    o.emit({ type: "usage", step, total: this.usage });
    return { text, toolCalls: toolCalls as Array<{ toolCallId: string; toolName: string; input: unknown }> };
  }

  private async observe(calls: Array<{ toolCallId: string; toolName: string; input: unknown }>) {
    this.setState("observing");
    const parts: any[] = [];
    for (const call of calls) {
      this.checkCancel();
      const { ok, output } = await this.executeCall(call);
      this.o.emit({ type: "tool_result", callId: call.toolCallId, tool: call.toolName, ok, output });
      parts.push({
        type: "tool-result",
        toolCallId: call.toolCallId,
        toolName: call.toolName,
        output: { type: "text", value: ok ? output : `ERROR: ${output}` },
      });
    }
    this.messages.push({ role: "tool", content: parts });
  }

  /** Validate → policy → (approval) → execute → truncate. Never throws except on cancel. */
  async executeCall(call: { toolCallId: string; toolName: string; input: unknown }): Promise<{ ok: boolean; output: string }> {
    const o = this.o;
    o.emit({ type: "tool_call", callId: call.toolCallId, tool: call.toolName, input: call.input });
    const def = toolByName(this.tools, call.toolName);
    if (!def) return { ok: false, output: `unknown tool: ${call.toolName}` };
    const parsed = def.inputSchema.safeParse(call.input);
    if (!parsed.success)
      return { ok: false, output: `invalid input: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}` };
    const input = parsed.data as Record<string, unknown>;

    const decision = o.policy.decide(def, input);
    if (decision.action === "deny") return { ok: false, output: `blocked by policy: ${decision.reason}` };
    if (decision.action === "ask") {
      const prev = this.state;
      const answer = await this.approval({ kind: "tool", tool: def.name, input, reason: decision.reason });
      this.state = prev;
      if (answer.decision === "deny")
        return { ok: false, output: `the user denied this call${answer.reason ? `: ${answer.reason}` : ""}` };
      if (answer.decision === "always") o.policy.remember(def, input);
    }

    const ctx: ToolContext = {
      workRoot: o.workRoot,
      projectRoot: o.projectRoot,
      todos: this.todos,
      setTodos: (t) => {
        this.todos = t;
        o.emit({ type: "todos", todos: t });
      },
      signal: o.signal,
    };
    try {
      const out = await def.execute(input, ctx);
      return { ok: true, output: def.truncate(out) };
    } catch (e) {
      this.checkCancel();
      const msg = e instanceof ToolError ? e.message : `${def.name} failed: ${(e as Error)?.message ?? String(e)}`;
      return { ok: false, output: def.truncate(msg) };
    }
  }

  private async approval(req: Omit<ApprovalRequest, "approvalId">): Promise<ApprovalResponse> {
    this.checkCancel();
    const approvalId = `${this.o.taskId}:a${++this.approvalSeq}`;
    const full = { ...req, approvalId };
    this.o.emit({ type: "approval_request", ...full });
    const signal = this.o.signal;
    return await new Promise<ApprovalResponse>((resolve, reject) => {
      const onAbort = () => reject(new Cancelled("cancelled"));
      signal?.addEventListener("abort", onAbort, { once: true });
      this.o.requestApproval(full).then(
        (r) => {
          signal?.removeEventListener("abort", onAbort);
          resolve(r);
        },
        (e) => {
          signal?.removeEventListener("abort", onAbort);
          reject(e);
        },
      );
    });
  }

  private async verify(command: string): Promise<{ ok: boolean; output: string }> {
    this.setState("verifying");
    this.o.emit({ type: "verify", status: "running", command });
    const out = await runCommand.execute(
      { command, timeoutSec: 600 },
      { workRoot: this.o.workRoot, projectRoot: this.o.projectRoot, todos: this.todos, setTodos: () => {}, signal: this.o.signal },
    );
    this.checkCancel();
    const ok = out.startsWith("exit code 0");
    const output = truncateMiddle(out, 8_000);
    this.o.emit({ type: "verify", status: ok ? "passed" : "failed", command, output });
    return { ok, output };
  }
}

export const runAgentLoop = (o: LoopOptions) => new AgentLoop(o).run();
