/**
 * Request router: turns parsed protocol requests into chats and agent tasks and stamps every
 * outgoing event with its request id, task id and timestamp. Transport-agnostic so tests can
 * drive it directly; main.ts wires it to stdin/stdout.
 */
import fs from "node:fs";
import { type ModelMessage, streamText } from "ai";
import { AgentLoop, type ApprovalResponse } from "./loop";
import { FileRulesStore, Policy, type RulesStore } from "./policy";
import { type Event, type EventBody, parseRequest, type Request, type TaskStartRequest } from "./protocol";
import { createModel, type ModelFactory } from "./providers";
import { Tracer } from "./trace";
import { DEFAULT_RETRY, type RetryOptions, withRetry } from "./retry";
import { describeError } from "./util";
import { createWorktree, discardWorktree, isGitRepo, mergeWorktree, type Worktree, worktreeDiff } from "./worktree";

export const VERSION = "0.1.0";

export interface ServerDeps {
  write: (e: Event) => void;
  modelFactory?: ModelFactory;
  traceDir?: string;
  rulesStoreFor?: (projectRoot: string) => RulesStore;
  /** Backoff for rate limits / transient provider errors (tests use short delays). */
  retry?: RetryOptions;
}

interface TaskEntry {
  taskId: string;
  requestId: string;
  abort: AbortController;
  approvals: Map<string, (r: ApprovalResponse) => void>;
  tracer: Tracer;
  projectRoot: string;
  worktree?: Worktree;
  running: boolean;
  done: Promise<void>;
}

export class Server {
  readonly tasks = new Map<string, TaskEntry>();
  private chats = new Map<string, AbortController>();
  private modelFactory: ModelFactory;

  constructor(private deps: ServerDeps) {
    this.modelFactory = deps.modelFactory ?? createModel;
  }

  private emitter(id: string, taskId?: string, tracer?: Tracer) {
    return (body: EventBody) => {
      const e = { ...body, id, ...(taskId ? { taskId } : {}), ts: Date.now() } as Event;
      tracer?.append(e);
      this.deps.write(e);
    };
  }

  /** Handle one raw JSON line. Never throws. */
  async handleLine(line: string): Promise<void> {
    if (!line.trim()) return;
    const parsed = parseRequest(line);
    if (!parsed.ok) {
      this.emitter(parsed.id ?? "")({ type: "error", message: parsed.message, code: "bad_request" });
      return;
    }
    try {
      await this.handle(parsed.request);
    } catch (e) {
      this.emitter(parsed.request.id)({ type: "error", message: (e as Error)?.message ?? String(e) });
    }
  }

  async handle(req: Request): Promise<void> {
    switch (req.type) {
      case "ping":
        return this.emitter(req.id)({ type: "pong", version: VERSION });
      case "chat.send":
        return this.chat(req);
      case "task.start":
        return this.startTask(req);
      case "task.approve": {
        const t = this.task(req.taskId);
        const resolve = t.approvals.get(req.approvalId);
        if (!resolve) throw new Error(`no pending approval ${req.approvalId} for task ${req.taskId}`);
        t.approvals.delete(req.approvalId);
        t.tracer.append({ type: "request", request: req, ts: Date.now() });
        resolve({ decision: req.decision, reason: req.reason, plan: req.plan });
        return;
      }
      case "task.cancel": {
        const chat = this.chats.get(req.taskId);
        if (chat) return void chat.abort();
        this.task(req.taskId).abort.abort();
        return;
      }
      case "task.diff": {
        const t = this.task(req.taskId);
        if (!t.worktree) throw new Error(`task ${req.taskId} has no worktree`);
        const { diff, stat } = await worktreeDiff(t.worktree);
        return this.emitter(req.id, t.taskId, t.tracer)({ type: "diff", diff, stat });
      }
      case "task.merge":
      case "task.discard": {
        const t = this.task(req.taskId);
        if (!t.worktree) throw new Error(`task ${req.taskId} has no worktree`);
        if (t.running) throw new Error(`task ${req.taskId} is still running; cancel it first`);
        const emit = this.emitter(req.id, t.taskId, t.tracer);
        if (req.type === "task.merge") {
          await mergeWorktree(t.worktree);
          emit({ type: "worktree", action: "merged", branch: t.worktree.branch });
        }
        await discardWorktree(t.worktree);
        emit({ type: "worktree", action: "discarded", path: t.worktree.path, branch: t.worktree.branch });
        t.worktree = undefined;
        return;
      }
    }
  }

  private task(taskId: string): TaskEntry {
    const t = this.tasks.get(taskId);
    if (!t) throw new Error(`unknown task ${taskId}`);
    return t;
  }

  private async chat(req: Extract<Request, { type: "chat.send" }>) {
    const emit = this.emitter(req.id);
    const abort = new AbortController();
    this.chats.set(req.id, abort);
    // Run in the background so other requests (e.g. cancel) keep flowing.
    void (async () => {
      try {
        const model = this.modelFactory(req.provider);
        const { text, u } = await withRetry(
          async (markEmitted) => {
            const result = streamText({
              model,
              instructions: req.system,
              messages: req.messages as ModelMessage[],
              temperature: req.temperature,
              abortSignal: abort.signal,
              maxRetries: 0,
              onError: () => {},
            });
            let text = "";
            for await (const part of result.fullStream) {
              if (part.type === "text-delta") {
                text += part.text;
                markEmitted();
                emit({ type: "token", text: part.text });
              } else if (part.type === "error") throw (part as any).error;
            }
            return { text, u: await result.usage };
          },
          this.deps.retry ?? DEFAULT_RETRY,
          (r) =>
            emit({
              type: "retry",
              attempt: r.attempt,
              maxAttempts: r.maxAttempts,
              delayMs: r.delayMs,
              message: describeError(r.error),
            }),
          abort.signal,
        );
        const usage = {
          inputTokens: u.inputTokens ?? 0,
          outputTokens: u.outputTokens ?? 0,
          totalTokens: u.totalTokens ?? 0,
        };
        emit({ type: "usage", step: usage, total: usage });
        emit({ type: "done", status: "done", summary: text, usage });
      } catch (e) {
        if (abort.signal.aborted) emit({ type: "done", status: "cancelled", summary: "" });
        else emit({ type: "error", message: describeError(e) });
      } finally {
        this.chats.delete(req.id);
      }
    })();
  }

  private async startTask(req: TaskStartRequest) {
    const taskId = req.taskId ?? req.id;
    if (!/^[A-Za-z0-9._-]+$/.test(taskId)) throw new Error(`invalid task id: ${taskId}`);
    if (this.tasks.has(taskId)) throw new Error(`task ${taskId} already exists`);
    if (!fs.existsSync(req.projectRoot) || !fs.statSync(req.projectRoot).isDirectory())
      throw new Error(`project folder not found: ${req.projectRoot}`);

    const model = this.modelFactory(req.provider); // fail fast on a bad provider config
    const tracer = new Tracer(taskId, this.deps.traceDir);
    const { apiKey: _redacted, ...provider } = req.provider;
    tracer.append({ type: "request", request: { ...req, provider }, ts: Date.now() });
    const emit = this.emitter(req.id, taskId, tracer);

    const entry: TaskEntry = {
      taskId,
      requestId: req.id,
      abort: new AbortController(),
      approvals: new Map(),
      tracer,
      projectRoot: req.projectRoot,
      running: true,
      done: Promise.resolve(),
    };
    this.tasks.set(taskId, entry);

    let workRoot = req.projectRoot;
    if (req.useWorktree && (await isGitRepo(req.projectRoot))) {
      try {
        entry.worktree = await createWorktree(req.projectRoot, taskId);
      } catch (e) {
        this.tasks.delete(taskId);
        throw e;
      }
      workRoot = entry.worktree.path;
      emit({ type: "worktree", action: "created", path: workRoot, branch: entry.worktree.branch });
    }

    const policy = new Policy({
      projectRoot: entry.worktree?.projectRoot ?? req.projectRoot,
      workRoot,
      allowlist: req.allowlist,
      store: this.deps.rulesStoreFor?.(req.projectRoot) ?? new FileRulesStore(req.projectRoot),
    });

    const loop = new AgentLoop({
      taskId,
      prompt: req.prompt,
      model,
      projectRoot: policy.projectRoot,
      workRoot,
      policy,
      emit,
      requestApproval: (a) => new Promise((resolve) => entry.approvals.set(a.approvalId, resolve)),
      planFirst: req.planFirst,
      maxSteps: req.maxSteps,
      tokenBudget: req.tokenBudget,
      verifyCommand: req.verifyCommand,
      retry: this.deps.retry,
      signal: entry.abort.signal,
    });

    entry.done = (async () => {
      const r = await loop.run();
      let diffStat: string | undefined;
      if (entry.worktree) diffStat = await worktreeDiff(entry.worktree).then((d) => d.stat, () => undefined);
      entry.running = false;
      entry.approvals.clear();
      emit({
        type: "done",
        status: r.status,
        summary: r.summary,
        reason: r.reason,
        steps: r.steps,
        usage: r.usage,
        diffStat,
      });
    })();
  }

  /** Abort everything (used on stdin EOF) and wait for tasks to settle. */
  async shutdown() {
    for (const c of this.chats.values()) c.abort();
    for (const t of this.tasks.values()) t.abort.abort();
    await Promise.allSettled([...this.tasks.values()].map((t) => t.done));
  }
}
