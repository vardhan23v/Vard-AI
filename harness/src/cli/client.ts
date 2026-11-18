/**
 * Runs the harness Server in-process and routes its events to callers by chat id or task id.
 */
import type { ApprovalDecision, Event, ProviderConfig } from "../protocol";
import type { ModelFactory } from "../providers";
import { Server } from "../server";

export type ChatTurn = { role: "user" | "assistant"; content: string };
export type Usage = { inputTokens: number; outputTokens: number; totalTokens: number };
export type ChatResult = { text: string; status: "done" | "cancelled" | "error"; error?: string; usage?: Usage };
type DoneEvent = Extract<Event, { type: "done" }>;

let seq = 0;
export const newId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${(++seq).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export class Client {
  readonly server: Server;
  private routes = new Map<string, (e: Event) => void>();

  constructor(opts: { modelFactory?: ModelFactory; traceDir?: string } = {}) {
    this.server = new Server({
      modelFactory: opts.modelFactory,
      traceDir: opts.traceDir,
      write: (e) => (this.routes.get(e.taskId ?? e.id) ?? this.routes.get(e.id))?.(e),
    });
  }

  /** Streams one reply. `onToken` gets each chunk; `onRetry` hears about rate-limit waits. */
  chat(
    provider: ProviderConfig,
    messages: ChatTurn[],
    on: { token: (t: string) => void; retry?: (msg: string, delayMs: number) => void },
  ): { result: Promise<ChatResult>; cancel: () => void } {
    const id = newId("chat");
    let text = "";
    const result = new Promise<ChatResult>((resolve) => {
      this.routes.set(id, (e) => {
        if (e.type === "token") {
          text += e.text;
          on.token(e.text);
        } else if (e.type === "retry") on.retry?.(e.message, e.delayMs);
        else if (e.type === "done") {
          this.routes.delete(id);
          resolve({ text, status: e.status === "cancelled" ? "cancelled" : "done", usage: e.usage as Usage });
        } else if (e.type === "error") {
          this.routes.delete(id);
          resolve({ text, status: "error", error: e.message });
        }
      });
      this.server.handle({ id, type: "chat.send", provider, messages }).catch((err) => {
        this.routes.delete(id);
        resolve({ text, status: "error", error: (err as Error).message });
      });
    });
    return { result, cancel: () => void this.server.handle({ id: newId("cancel"), type: "task.cancel", taskId: id }) };
  }

  /** Starts an agent task. Every task event goes to `onEvent`; resolves with the final `done`. */
  async startTask(
    req: {
      taskId: string;
      projectRoot: string;
      prompt: string;
      provider: ProviderConfig;
      planFirst: boolean;
      useWorktree: boolean;
      verifyCommand?: string;
      maxSteps?: number;
    },
    onEvent: (e: Event) => void,
  ): Promise<DoneEvent> {
    const done = new Promise<DoneEvent>((resolve) => {
      this.routes.set(req.taskId, (e) => {
        onEvent(e);
        if (e.type === "done") resolve(e);
      });
    });
    await this.server.handle({ id: newId("start"), type: "task.start", ...req });
    return done;
  }

  approve(taskId: string, approvalId: string, decision: ApprovalDecision, extra: { reason?: string; plan?: string } = {}) {
    return this.server.handle({ id: newId("ans"), type: "task.approve", taskId, approvalId, decision, ...extra });
  }

  cancel(taskId: string) {
    return this.server.handle({ id: newId("cancel"), type: "task.cancel", taskId });
  }

  async diff(taskId: string): Promise<{ diff: string; stat: string }> {
    let got: { diff: string; stat: string } = { diff: "", stat: "" };
    const prev = this.routes.get(taskId);
    this.routes.set(taskId, (e) => {
      if (e.type === "diff") got = { diff: e.diff, stat: e.stat };
      else prev?.(e);
    });
    try {
      await this.server.handle({ id: newId("diff"), type: "task.diff", taskId });
    } finally {
      if (prev) this.routes.set(taskId, prev);
      else this.routes.delete(taskId);
    }
    return got;
  }

  merge(taskId: string) {
    return this.server.handle({ id: newId("merge"), type: "task.merge", taskId });
  }

  discard(taskId: string) {
    return this.server.handle({ id: newId("discard"), type: "task.discard", taskId });
  }

  shutdown() {
    return this.server.shutdown();
  }
}
