/**
 * A team run: planner → plan approval → parallel subtasks in isolated worktrees, merged one by one
 * into the run's integration branch → review (and one fix round) → the user approves the combined
 * diff with the normal task.merge / task.discard.
 *
 * Everything an agent does goes through AgentLoop, the policy and the user's approvals. Progress
 * comes only from real events: agent loop events (tagged with agentId) and the orch_* events here.
 */
import type { LanguageModel } from "ai";
import { reflectOnTask, type ApprovalRequest, type ApprovalResponse, type LoopResult } from "../loop";
import { applyAuto, type MemoryStore, type Proposal } from "../memory";
import type { EventBody, Usage } from "../protocol";
import { runCommand } from "../tools/command";
import { truncateMiddle } from "../util";
import { createWorktree, discardWorktree, type Worktree } from "../worktree";
import { MessageBus } from "./communication";
import { addFileEdges, allDeps, validateGraph, dedupeGraph } from "./dependencies";
import { OrchestrationError } from "./errors";
import { Integrator } from "./integrator";
import { planGraph, renderGraph } from "./planner";
import { compactSummary, dependencyContext, runSummary } from "./results";
import { runReview } from "./reviewer";
import { type Outcome, Scheduler } from "./scheduler";
import {
  type AgentRun,
  type IntegrationRecord,
  type OrchControl,
  type OrchestrationState,
  type OrchPhase,
  type ReviewResult,
  type RoleConfig,
  type RoleId,
  type SubtaskState,
  TaskGraph,
  type TaskGraph as TaskGraphT,
  type TeamOptions,
} from "./schema";
import type { AgentEnv } from "./worker";
import { runAgent } from "./worker";

const DEFAULT_TOKEN_BUDGET = 4_000_000;
const PER_AGENT_TOKENS = 1_000_000;

export interface OrchestratorDeps extends Omit<AgentEnv, "gate" | "paused" | "onAgent" | "emit" | "taskId"> {
  taskId: string;
  goal: string;
  integration: Worktree;
  roles: Record<RoleId, RoleConfig>;
  options: TeamOptions;
  /** Emits a task event (the orchestrator adds `seq`). */
  emit: (e: EventBody) => void;
  verifyCommand?: string;
  signal: AbortSignal;
  /** For the end-of-run memory reflection. */
  reflectModel: LanguageModel;
  learn?: { store: MemoryStore; mode: "ask" | "auto" } | null;
}

export interface OrchestrationResult {
  status: LoopResult["status"];
  summary: string;
  reason?: string;
  steps: number;
  usage: Usage;
  proposals: Proposal[];
}

export class Orchestrator {
  private phase: OrchPhase = "planning";
  private reason?: string;
  private graph?: TaskGraphT;
  private subtasks: SubtaskState[] = [];
  private agents = new Map<string, AgentRun>();
  private integrations: IntegrationRecord[] = [];
  private reviews: ReviewResult[] = [];
  private bus: MessageBus;
  private integrator: Integrator;
  private scheduler?: Scheduler;
  private seq = 0;
  private isPaused = false;
  private resumeWaiters: (() => void)[] = [];
  private attention?: (d: "retry" | "continue") => void;
  /** Subtasks the user chose to go on without (they don't stop later rounds). */
  private accepted = new Set<string>();
  private startedAt = Date.now();
  private endedAt?: number;
  private toolLog: string[] = [];
  private env: AgentEnv;
  private readonly tokenBudget: number;

  /** Repository signals for skill selection (computed once per run). */
  setSignals(signals: AgentEnv["signals"]) {
    this.env.signals = signals;
  }

  constructor(private d: OrchestratorDeps) {
    this.tokenBudget = d.options.tokenBudget ?? DEFAULT_TOKEN_BUDGET;
    this.integrator = new Integrator(d.integration);
    this.bus = new MessageBus((message) => this.emit({ type: "agent_message", message }));
    this.env = {
      ...d,
      emit: (e) => this.emit(e),
      gate: () => this.waitResume(),
      paused: () => this.isPaused,
      onAgent: (a) => {
        this.agents.set(a.agentId, a);
        this.emit({ type: "orch_agent", agent: a });
      },
    };
  }

  private emit(e: EventBody) {
    if (e.type === "tool_call" && e.agentId) this.toolLog.push(`${e.agentId}: ${e.tool} ${JSON.stringify(e.input ?? {}).slice(0, 140)}`);
    this.d.emit({ ...e, seq: ++this.seq } as EventBody);
  }

  private setPhase(p: OrchPhase, reason?: string) {
    this.phase = p;
    this.reason = reason;
    this.emit({ type: "orch_phase", phase: p, reason });
  }

  get usage(): Usage {
    const u = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
    for (const a of this.agents.values()) {
      u.inputTokens += a.usage.inputTokens;
      u.outputTokens += a.usage.outputTokens;
      u.totalTokens += a.usage.totalTokens;
    }
    return u;
  }

  snapshot(): OrchestrationState {
    return {
      goal: this.d.goal,
      phase: this.phase,
      reason: this.reason,
      graph: this.graph,
      subtasks: this.subtasks.map((s) => ({ ...s })),
      agents: [...this.agents.values()],
      messages: [...this.bus.messages],
      integrations: [...this.integrations],
      reviews: [...this.reviews],
      usage: this.usage,
      options: {
        maxAgents: this.d.options.maxAgents,
        maxSubtasks: this.d.options.maxSubtasks,
        retries: this.d.options.retries,
        review: this.d.options.review,
        tokenBudget: this.tokenBudget,
      },
      integrationBranch: this.d.integration.branch,
      seq: this.seq,
      startedAt: this.startedAt,
      endedAt: this.endedAt,
    };
  }

  // ---------- control ----------

  private waitResume(): Promise<void> {
    if (!this.isPaused) return Promise.resolve();
    return new Promise((r) => this.resumeWaiters.push(r));
  }

  control(action: OrchControl, subtaskId?: string, note?: string): string {
    switch (action) {
      case "pause":
        if (["done", "failed", "cancelled"].includes(this.phase)) throw new OrchestrationError("config", "the run has finished");
        this.isPaused = true;
        if (this.phase === "running") this.setPhase("paused", "paused by you");
        return "paused";
      case "resume": {
        this.isPaused = false;
        const w = this.resumeWaiters.splice(0);
        w.forEach((r) => r());
        if (this.phase === "paused") this.setPhase("running");
        this.scheduler?.poke();
        return "resumed";
      }
      case "cancel_subtask": {
        const s = this.sub(subtaskId);
        if (this.scheduler?.cancel(s.id)) return "cancelling";
        if (s.status === "pending" || s.status === "blocked") {
          s.status = "cancelled";
          s.error = "cancelled by you";
          this.subChanged(s);
          this.scheduler?.poke();
          return "cancelled";
        }
        throw new OrchestrationError("config", `subtask ${s.id} is ${s.status}`);
      }
      case "retry_subtask": {
        const s = this.sub(subtaskId);
        if (!["failed", "needs_attention", "cancelled", "blocked", "skipped"].includes(s.status))
          throw new OrchestrationError("config", `subtask ${s.id} is ${s.status}; only failed, blocked or cancelled subtasks can be retried`);
        s.status = "pending";
        s.blockedBy = undefined;
        this.accepted.delete(s.id);
        s.note = note?.trim() ? `Note from the user: ${note.trim()}${s.question ? `\n(Your question was: ${s.question})` : ""}` : s.note;
        this.subChanged(s, "retry requested");
        // Dependents that were blocked by it get another chance.
        for (const x of this.subtasks)
          if (x.status === "blocked") {
            x.status = "pending";
            x.blockedBy = undefined;
            this.subChanged(x);
          }
        this.attention?.("retry");
        this.scheduler?.poke();
        return "retrying";
      }
      case "continue":
        if (!this.attention) throw new OrchestrationError("config", "nothing is waiting");
        this.attention("continue");
        return "continuing";
    }
  }

  private sub(id?: string): SubtaskState {
    const s = this.subtasks.find((x) => x.id === id);
    if (!s) throw new OrchestrationError("config", `no subtask "${id}"`);
    return s;
  }

  private subChanged(s: SubtaskState, why?: string) {
    this.emit({ type: "orch_task", subtask: { ...s }, why });
  }

  // ---------- run ----------

  async run(): Promise<OrchestrationResult> {
    const d = this.d;
    const steps = () => [...this.agents.values()].reduce((n, a) => n + a.steps, 0);
    try {
      this.emit({ type: "orch_snapshot", state: this.snapshot() });
      await this.planAndApprove();
      await this.execute();
      const done = this.subtasks.filter((s) => s.status === "completed");
      if (!done.length) throw new OrchestrationError("plan_invalid", "no subtask completed");
      if (d.options.review && this.subtasks.length > 1) await this.review();
      this.endedAt = Date.now();
      this.setPhase("done");
      const summary = runSummary(this.snapshot());
      const proposals = await this.reflect(summary);
      this.emit({ type: "orch_snapshot", state: this.snapshot() });
      const failed = this.subtasks.filter((s) => s.status !== "completed");
      return {
        status: "done",
        summary,
        reason: failed.length ? `${failed.length} subtask${failed.length > 1 ? "s" : ""} did not complete` : undefined,
        steps: steps(),
        usage: this.usage,
        proposals,
      };
    } catch (e) {
      this.endedAt = Date.now();
      const cancelled = d.signal.aborted || (e instanceof OrchestrationError && e.code === "cancelled");
      this.setPhase(cancelled ? "cancelled" : "failed", cancelled ? "cancelled by you" : (e as Error).message);
      this.emit({ type: "orch_snapshot", state: this.snapshot() });
      return {
        status: cancelled ? "cancelled" : "blocked",
        summary: this.subtasks.length ? runSummary(this.snapshot()) : "",
        reason: cancelled ? "cancelled by user" : (e as Error).message,
        steps: steps(),
        usage: this.usage,
        proposals: [],
      };
    }
  }

  private checkCancel() {
    if (this.d.signal.aborted) throw new OrchestrationError("cancelled", "cancelled");
  }

  private async approval(req: Omit<ApprovalRequest, "approvalId">, id: string): Promise<ApprovalResponse> {
    this.checkCancel();
    const full: ApprovalRequest = { ...req, approvalId: `${this.d.taskId}:${id}` };
    this.emit({ type: "approval_request", ...full });
    return await new Promise<ApprovalResponse>((resolve, reject) => {
      const onAbort = () => reject(new OrchestrationError("cancelled", "cancelled"));
      this.d.signal.addEventListener("abort", onAbort, { once: true });
      this.d.requestApproval(full).then(
        (r) => {
          this.d.signal.removeEventListener("abort", onAbort);
          resolve(r);
        },
        (err) => {
          this.d.signal.removeEventListener("abort", onAbort);
          reject(err);
        },
      );
    });
  }

  private async planAndApprove() {
    const d = this.d;
    let feedback: string | undefined;
    for (let round = 1; round <= 3; round++) {
      this.setPhase("planning");
      const { graph, merged } = await planGraph(this.env, {
        goal: d.goal,
        roles: Object.values(d.roles),
        planner: d.roles.planner,
        maxSubtasks: d.options.maxSubtasks,
        feedback,
        signal: d.signal,
        round,
      });
      for (const m of merged) this.bus.post("task_assigned", { from: "orchestrator", text: `Merged duplicate subtask "${m.dropped}" into "${m.into}".` });
      let proposed = graph;
      for (let ask = 1; ; ask++) {
        this.graph = proposed;
        this.emit({ type: "orch_plan", graph: proposed });
        this.setPhase("awaiting_approval");
        const answer = await this.approval(
          { kind: "plan", reason: "review the team plan before agents start editing", plan: renderGraph(proposed), graph: proposed },
          `plan${round}.${ask}`,
        );
        if (answer.decision === "deny") {
          if (!answer.reason) throw new OrchestrationError("plan_invalid", "plan rejected by user");
          feedback = answer.reason;
          break;
        }
        if (answer.graph === undefined) return this.adopt(proposed);
        const edited = TaskGraph.safeParse(answer.graph);
        const errors = edited.success ? validateGraph(dedupeGraph(edited.data).graph, { maxSubtasks: 12 }) : edited.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
        if (!errors.length && edited.success) return this.adopt(dedupeGraph(edited.data).graph);
        this.emit({ type: "error", message: `The edited plan can't be used: ${errors.join("; ")}`, code: "plan_invalid" });
        if (ask >= 3) throw new OrchestrationError("plan_invalid", "the edited plan is invalid");
      }
    }
    throw new OrchestrationError("plan_invalid", "plan rejected too many times");
  }

  private adopt(graph: TaskGraphT) {
    this.graph = graph;
    const implicit = addFileEdges(graph.tasks);
    this.subtasks = graph.tasks.map((t) => ({ ...t, status: "pending" as const, attempts: 0, implicitDeps: implicit.get(t.id) ?? [] }));
    this.emit({ type: "orch_plan", graph, approved: true });
    for (const s of this.subtasks) this.subChanged(s, "created");
  }

  private async execute() {
    const d = this.d;
    this.setPhase(this.isPaused ? "paused" : "running");
    this.scheduler = new Scheduler({
      maxAgents: d.options.maxAgents,
      retries: d.options.retries,
      timeoutMs: (s) => d.options.timeoutMs ?? d.roles[s.role].timeoutMs,
      run: (s, signal) => this.runSubtask(s, signal),
      onChange: (s, why) => {
        this.subChanged(s, why);
        if (s.status === "blocked") this.bus.post("dependency_blocked", { from: "orchestrator", subtaskId: s.id, text: `${s.title} is blocked by ${s.blockedBy?.join(", ")}` });
        if (s.status === "failed") this.bus.post("task_failed", { from: s.agentId ?? "orchestrator", to: "orchestrator", subtaskId: s.id, text: s.error ?? "failed" });
        if (s.status === "needs_attention" && s.question)
          this.bus.post("clarification_required", { from: s.agentId ?? "orchestrator", to: "user", subtaskId: s.id, text: s.question });
      },
      paused: () => this.isPaused,
      resumed: () => this.waitResume(),
      budgetLeft: () => this.usage.totalTokens < this.tokenBudget,
      signal: d.signal,
    });
    for (;;) {
      await this.scheduler.run(this.subtasks);
      this.checkCancel();
      const stuck = this.subtasks.filter((s) => ["failed", "needs_attention", "blocked", "skipped"].includes(s.status) && !this.accepted.has(s.id));
      if (!stuck.length || d.options.onFailure === "continue") return;
      this.setPhase("attention", `${stuck.length} subtask${stuck.length > 1 ? "s need" : " needs"} your attention`);
      const choice = await new Promise<"retry" | "continue">((resolve, reject) => {
        this.attention = resolve;
        d.signal.addEventListener("abort", () => reject(new OrchestrationError("cancelled", "cancelled")), { once: true });
      }).finally(() => (this.attention = undefined));
      if (choice === "continue") {
        for (const s of stuck) this.accepted.add(s.id);
        for (const s of this.subtasks)
          if (s.status === "pending" || s.status === "blocked") {
            s.status = "skipped";
            this.subChanged(s, "skipped");
          }
        return;
      }
      this.setPhase(this.isPaused ? "paused" : "running");
    }
  }

  private workerPrompt(s: SubtaskState): string {
    const byId = new Map(this.subtasks.map((x) => [x.id, x]));
    const deps = allDeps(s).map((id) => byId.get(id)!).filter((x) => x?.status === "completed");
    const others = this.subtasks.filter((x) => x.id !== s.id && !allDeps(s).includes(x.id));
    return [
      `You are one agent in a team working on this request:\n"""\n${this.d.goal}\n"""`,
      `Your assignment (subtask "${s.id}"): ${s.title}\n\n${s.description}`,
      s.acceptance ? `Done when: ${s.acceptance}` : "",
      s.files.length ? `Files you are expected to change: ${s.files.join(", ")}` : "",
      deps.length ? `Work already done by the agents you depend on (it is in your copy of the code):\n${dependencyContext(deps)}` : "",
      others.length ? `Other agents handle these, so don't do them:\n${others.map((o) => `- ${o.title} (${o.role})`).join("\n")}` : "",
      s.note ? `${s.note}` : "",
      `Work only on your assignment, in your own copy of the repository. When you're done, stop calling tools and reply with a short summary: what you changed, which files, anything the other agents must know (names, API contracts), and how you checked it. If you can't continue without information only the user has, reply with "NEEDS INPUT:" followed by your question.`,
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  private async runSubtask(s: SubtaskState, signal: AbortSignal): Promise<Outcome> {
    const d = this.d;
    const role = d.roles[s.role];
    const agentId = `${s.role}-${s.id}${s.attempts > 1 ? `-${s.attempts}` : ""}`;
    s.agentId = agentId;
    this.subChanged(s);
    this.bus.post("task_assigned", { from: "orchestrator", to: agentId, subtaskId: s.id, text: `${s.title} → ${role.name} agent` });
    let ws: Worktree | undefined;
    try {
      if (role.tools.write)
        ws = await createWorktree(d.integration.projectRoot, `${d.taskId}--${s.id}-${s.attempts}`, { base: d.integration.branch });
      this.bus.post("task_started", { from: agentId, to: "orchestrator", subtaskId: s.id, text: ws ? `working on branch ${ws.branch}` : "started (read-only)" });
      const remaining = Math.max(10_000, this.tokenBudget - this.usage.totalTokens);
      const { result } = await runAgent(this.env, {
        agentId,
        role,
        prompt: this.workerPrompt(s),
        skillQuery: `${s.title}\n${s.description}`,
        workRoot: ws?.path ?? d.integration.path,
        workspace: ws ? { path: ws.path, branch: ws.branch } : { path: d.integration.path },
        subtaskId: s.id,
        attempt: s.attempts,
        signal,
        tokenBudget: Math.min(PER_AGENT_TOKENS, remaining),
      });
      if (result.status === "cancelled") return { status: "cancelled" };
      if (result.status === "blocked") return { status: "failed", error: result.reason ?? "stopped", retryable: true };
      const text = result.summary.trim();
      const q = /^\s*NEEDS INPUT:\s*([\s\S]+)/i.exec(text);
      if (q) return { status: "needs_input", question: q[1].trim().slice(0, 1500) };
      if (!ws) {
        this.bus.post("task_completed", { from: agentId, to: "orchestrator", subtaskId: s.id, text: compactSummary(text) });
        return { status: "completed", result: { summary: compactSummary(text), files: [], stat: "" } };
      }
      s.status = "integrating";
      this.subChanged(s, "integrating");
      const r = await this.integrator.integrate(ws, `vard: ${s.id}: ${s.title}`.slice(0, 200));
      const rec: IntegrationRecord = { subtaskId: s.id, status: r.status, files: r.files, commit: r.status === "merged" ? r.commit : undefined, at: Date.now() };
      this.integrations.push(rec);
      this.emit({ type: "orch_integration", record: rec });
      if (r.status === "conflict") {
        this.bus.post("integration_conflict", { from: "orchestrator", to: agentId, subtaskId: s.id, text: `conflicts in ${r.files.join(", ")}` });
        return { status: "conflict", files: r.files };
      }
      this.bus.post("task_completed", { from: agentId, to: "orchestrator", subtaskId: s.id, text: compactSummary(text) });
      if (r.status === "merged")
        this.bus.post("integration_completed", { from: "orchestrator", subtaskId: s.id, text: `merged ${r.files.length} file${r.files.length === 1 ? "" : "s"} into ${d.integration.branch}` });
      return { status: "completed", result: { summary: compactSummary(text), files: r.files, stat: r.stat, commit: r.status === "merged" ? r.commit : undefined } };
    } finally {
      if (ws) await discardWorktree(ws).catch(() => {});
    }
  }

  private async verify(): Promise<ReviewResult["verify"]> {
    const cmd = this.d.verifyCommand;
    if (!cmd) return undefined;
    this.emit({ type: "verify", status: "running", command: cmd });
    const out = await runCommand.execute(
      { command: cmd, timeoutSec: 600 },
      { workRoot: this.d.integration.path, projectRoot: this.d.projectRoot, todos: [], setTodos: () => {}, signal: this.d.signal },
    );
    const ok = out.startsWith("exit code 0");
    const output = truncateMiddle(out, 8_000);
    this.emit({ type: "verify", status: ok ? "passed" : "failed", command: cmd, output });
    return { command: cmd, ok, output };
  }

  private async review() {
    const d = this.d;
    for (let round = 1; round <= 2; round++) {
      this.checkCancel();
      this.setPhase("reviewing");
      const verify = await this.verify();
      const { stat } = await this.integrator.diff();
      this.bus.post("review_requested", { from: "orchestrator", to: `reviewer-${round}`, text: `review round ${round}` });
      const { review } = await runReview(this.env, {
        reviewer: d.roles.reviewer,
        goal: d.goal,
        subtasks: this.subtasks,
        stat,
        base: d.integration.base,
        workRoot: d.integration.path,
        verify,
        round,
        signal: d.signal,
      });
      this.reviews.push(review);
      this.emit({ type: "orch_review", review });
      const serious = review.findings.filter((f) => f.severity !== "low");
      if (review.verdict !== "changes_requested" || !serious.length) {
        this.bus.post("review_completed", { from: review.agentId ?? "reviewer", to: "orchestrator", text: `${review.verdict}: ${review.summary.slice(0, 300)}` });
        return;
      }
      this.bus.post("review_rejected", { from: review.agentId ?? "reviewer", to: "orchestrator", text: `${serious.length} finding(s) to fix` });
      if (round === 2 || this.usage.totalTokens >= this.tokenBudget) return;
      // One fix round: group findings by the subtask that owns them.
      const fixes = this.fixSubtasks(serious);
      if (!fixes.length) return;
      this.subtasks.push(...fixes);
      for (const f of fixes) this.subChanged(f, "created from review");
      await this.execute();
    }
  }

  private fixSubtasks(findings: ReviewResult["findings"]): SubtaskState[] {
    const owner = (f: ReviewResult["findings"][number]) =>
      this.subtasks.find((s) => s.id === f.subtask && s.status === "completed") ??
      this.subtasks.find((s) => s.status === "completed" && f.file && s.result?.files.includes(f.file)) ??
      this.subtasks.find((s) => s.status === "completed" && s.role !== "testing");
    const groups = new Map<string, { s: SubtaskState; items: typeof findings }>();
    for (const f of findings) {
      const s = owner(f);
      if (!s) continue;
      const g = groups.get(s.id) ?? { s, items: [] };
      g.items.push(f);
      groups.set(s.id, g);
    }
    return [...groups.values()].map(({ s, items }) => ({
      id: `${s.id}-fix`.slice(0, 40),
      title: `Fix review findings in "${s.title}"`.slice(0, 200),
      role: s.role,
      description: `The reviewer found these problems in the combined change. Fix them:\n${items
        .map((f) => `- [${f.severity}] ${f.file ?? ""}${f.line ? `:${f.line}` : ""} ${f.message}`)
        .join("\n")}`.slice(0, 4000),
      dependsOn: [],
      files: [...new Set(items.map((f) => f.file).filter((x): x is string => !!x))],
      status: "pending" as const,
      attempts: 0,
      implicitDeps: [],
      fixOf: s.id,
    }));
  }

  /** One memory reflection for the whole run (proposals; saved only per the user's settings). */
  private async reflect(summary: string): Promise<Proposal[]> {
    const d = this.d;
    if (!d.learn || !d.memory) return [];
    const src = {
      toolLines: () => this.toolLog.slice(-200),
      verifyLine: () => {
        const v = this.reviews.at(-1)?.verify;
        return v ? `\`${v.command}\` ${v.ok ? "passed" : "failed"}` : undefined;
      },
      addUsage: () => {},
    };
    const { stat } = await this.integrator.diff().catch(() => ({ stat: "" }));
    let items = await reflectOnTask(
      src,
      { memory: d.memory, signal: d.signal, prompt: d.goal, model: d.reflectModel, retry: d.retry, taskId: d.taskId },
      { summary, diffStat: stat },
    );
    if (items.length && d.learn.mode === "auto") items = applyAuto(d.learn.store, items, d.taskId);
    return items;
  }
}
