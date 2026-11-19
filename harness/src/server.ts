/**
 * Request router: turns parsed protocol requests into chats and agent tasks and stamps every
 * outgoing event with its request id, task id and timestamp. Transport-agnostic so tests can
 * drive it directly; main.ts wires it to stdin/stdout.
 */
import fs from "node:fs";
import { type ModelMessage, streamText } from "ai";
import { AgentLoop, type ApprovalResponse, type LoopOptions, reflectOnTask } from "./loop";
import { Orchestrator, OrchestrationError, ROLE_IDS, RoleRegistry, TeamOptions, type RoleConfig, type RoleId } from "./agents";
import { ProviderConfig } from "./protocol";
import { analyze, applyAuto, MemoryError, MemoryStore } from "./memory";
import { knownImportSources, McpError, McpManager, McpServerConfig, toMcpError, validateServerUrl, type SecretStore } from "./mcp";
import { vardHome } from "./mcp/config";
import { architecture, CodeGraph, CodeIntel, codeTools, deleteIndex, IntelError, loadIndexConfig, renderArchitecture, saveIndexConfig, searchCode, analyzeImpact, updateEmbeddings } from "./intelligence";
import { ALL_TOOLS } from "./tools";
import { BrowserManager, browserTools, cleanArtifacts, detectBrowser, DevServers, installBrowser, listArtifacts, readArtifact, BrowserError, checkUrl, VIEWPORTS } from "./browser";
import { supportsVision } from "./catalog";
import nodePath from "node:path";
import { applySkillChange, previewTokens, projectSignals, renderSkillsBlock, SkillError, SkillRegistry, skillsForTask, type TaskSkills } from "./skills";
import { FileRulesStore, Policy, type RulesStore } from "./policy";
import { type Event, type EventBody, parseRequest, type Request, type TaskStartRequest } from "./protocol";
import { createModel, type ModelFactory } from "./providers";
import { Tracer } from "./trace";
import { DEFAULT_RETRY, type RetryOptions, withRetry } from "./retry";
import { describeError } from "./util";
import { isSensitivePath as isSensitive } from "./memory/secrets";
import { createWorktree, discardWorktree, isGitRepo, mergeWorktree, type Worktree, worktreeDiff } from "./worktree";

import { VERSION } from "./version";

export { VERSION };

export interface ServerDeps {
  write: (e: Event) => void;
  modelFactory?: ModelFactory;
  traceDir?: string;
  rulesStoreFor?: (projectRoot: string) => RulesStore;
  /** Backoff for rate limits / transient provider errors (tests use short delays). */
  retry?: RetryOptions;
  /** MCP: a ready manager (tests), or where its config lives and which secret store to use. */
  mcp?: McpManager;
  mcpHome?: string;
  mcpSecrets?: SecretStore;
  /** Where global skills and skill state live (defaults to ~/.vard, or $VARD_HOME). */
  skillsHome?: string;
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
  /** Set for team runs. */
  team?: Orchestrator;
}

export class Server {
  readonly tasks = new Map<string, TaskEntry>();
  private chats = new Map<string, AbortController>();
  private modelFactory: ModelFactory;

  readonly mcp: McpManager;
  /** Code indexes (one per project), shared by tasks, the UI and the CLI. */
  readonly intel: CodeIntel;
  private codeBuilds = new Map<string, AbortController>();
  /** The test browser (launched lazily) and dev servers started by tasks. */
  readonly browser: BrowserManager;
  readonly devServers: DevServers;
  private installing: Promise<unknown> | null = null;
  private codeProgressAt = new Map<string, number>();
  private mcpPush = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(private deps: ServerDeps) {
    this.modelFactory = deps.modelFactory ?? createModel;
    const browserEmit = (taskId?: string) => this.emitter("browser", taskId);
    this.browser = new BrowserManager({
      projectOrigins: (root) => (this.deps.rulesStoreFor?.(root) ?? new FileRulesStore(root)).load().browserOrigins ?? [],
      onSession: (session) => browserEmit(session.taskId)({ type: "browser_session", session, ...(session.agentId ? { agentId: session.agentId } : {}) }),
      onAction: (session, action, ok, detail) => browserEmit(session.taskId)({ type: "browser_action", sessionId: session.id, action, ok, detail, ...(session.agentId ? { agentId: session.agentId } : {}) }),
      onReport: (session, report) => browserEmit(session.taskId)({ type: "browser_report", sessionId: session.id, report, ...(session.agentId ? { agentId: session.agentId } : {}) }),
    });
    this.devServers = new DevServers((server) => browserEmit(server.taskId)({ type: "dev_server", server }));
    this.intel = new CodeIntel({
      onStatus: (status) => this.emitter("code")({ type: "code_index_status", status }),
      onProgress: (projectRoot, done, total) => {
        const now = Date.now();
        if (done < total && now - (this.codeProgressAt.get(projectRoot) ?? 0) < 250) return;
        this.codeProgressAt.set(projectRoot, now);
        this.emitter("code")({ type: "code_index_progress", projectRoot, done, total });
      },
    });
    this.mcp =
      deps.mcp ??
      new McpManager({
        home: deps.mcpHome,
        secrets: deps.mcpSecrets,
        onChange: (root) => this.pushMcp(root),
        onProgress: (tool, p) => this.emitter("mcp")({ type: "mcp_progress", tool, ...p }),
      });
  }

  /** Live MCP status for the UI (debounced; id "mcp"). */
  private pushMcp(projectRoot?: string) {
    const k = projectRoot ?? "";
    clearTimeout(this.mcpPush.get(k));
    this.mcpPush.set(
      k,
      setTimeout(() => {
        this.mcpPush.delete(k);
        try {
          this.emitter("mcp")({ type: "mcp_servers", projectRoot, servers: this.mcp.status(projectRoot), trusted: projectRoot ? this.mcp.trusted(projectRoot) : undefined });
        } catch {
          // A broken config file is reported on the next explicit mcp.list.
        }
      }, 80),
    );
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
        resolve({ decision: req.decision, reason: req.reason, plan: req.plan, graph: req.graph });
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
      case "memory.get":
      case "memory.update":
        return this.memory(req);
      case "mcp.list":
      case "mcp.config":
      case "mcp.connection":
      case "mcp.inspect":
      case "mcp.read_resource":
      case "mcp.get_prompt":
      case "mcp.permissions":
      case "mcp.secret":
        return this.mcpRequest(req);
      case "skills.list":
      case "skills.get":
      case "skills.update":
        return this.skillsRequest(req);
      case "orch.control":
      case "orch.status": {
        const t = this.task(req.taskId);
        if (!t.team) throw new Error(`task ${req.taskId} is not a team run`);
        if (req.type === "orch.control") {
          try {
            t.team.control(req.action, req.subtaskId, req.note);
          } catch (e) {
            if (e instanceof OrchestrationError) throw new Error(e.message);
            throw e;
          }
        }
        return this.emitter(req.id, t.taskId)({ type: "orch_snapshot", state: t.team.snapshot() });
      }
      case "agents.roles":
        return this.rolesRequest(req);
      case "code.index":
      case "code.query":
      case "code.config":
        return this.codeRequest(req);
      case "browser.status":
      case "browser.install":
      case "browser.sessions":
      case "browser.control":
      case "artifacts.list":
      case "artifacts.get":
      case "artifacts.clean":
        return this.browserRequest(req);
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
    // Skills: resolve before anything starts, so a bad explicit skill fails the request cleanly.
    let skills: TaskSkills | undefined;
    const team = req.mode === "team";
    if (team && !(await isGitRepo(req.projectRoot)))
      throw new Error("Team mode needs a git repository with at least one commit (each agent works on its own branch).");
    if (!team && (req.skills?.length || req.autoSkills !== false)) {
      try {
        const registry = this.skillRegistry(req.projectRoot);
        skills = skillsForTask({
          registry,
          prompt: req.prompt,
          explicit: req.skills,
          auto: req.autoSkills,
          signals: await projectSignals(req.projectRoot),
          taskId,
        });
      } catch (e) {
        if (e instanceof SkillError) throw new Error(e.message);
        if (req.skills?.length) throw e;
        skills = undefined; // automatic skills must never break a task
      }
    }
    const tracer = new Tracer(taskId, this.deps.traceDir);
    const { apiKey: _redacted, ...provider } = req.provider;
    const teamForTrace = req.team?.models
      ? { ...req.team, models: Object.fromEntries(Object.entries(req.team.models).map(([k, v]) => [k, v && typeof v === "object" ? { ...(v as object), apiKey: undefined } : v])) }
      : req.team;
    tracer.append({ type: "request", request: { ...req, provider, ...(teamForTrace ? { team: teamForTrace } : {}) }, ts: Date.now() });
    const emit = this.emitter(req.id, taskId, tracer);
    if (skills?.activated.length) emit({ type: "skills_activated", skills: skills.activated, tokens: skills.tokens });

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
    if ((req.useWorktree || team) && (await isGitRepo(req.projectRoot))) {
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

    // Memory belongs to the user's checkout, not the task's worktree.
    const store = new MemoryStore(policy.projectRoot);
    const memSettings = req.useMemory === false ? null : store.settings();
    const memory = memSettings?.enabled ? { store, recall: memSettings.recall } : null;
    const learn = !!memory && req.learn !== false && memSettings!.autoUpdate !== "off";
    const loopOptions: LoopOptions = {
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
      memory,
      ...(skills?.resolved.length ? { skills: { block: skills.block, tools: skills.tools } } : {}),
    };
    // MCP: connect this project's servers (bounded wait; failures stay per server) and offer
    // their tools through the normal tool registry.
    const projectRoot = policy.projectRoot;
    let hasMcp = false;
    try {
      hasMcp = this.mcp.configs(projectRoot).some((c) => c.config.enabled);
    } catch {
      hasMcp = false;
    }
    if (hasMcp) {
      await this.mcp.prepare(projectRoot).catch(() => {});
      if (workRoot !== projectRoot) this.mcp.addRoot(projectRoot, workRoot);
      loopOptions.extraTools = () => this.mcp.toolDefs(projectRoot);
      loopOptions.mcpSummary = () => this.mcp.summary(projectRoot);
    }
    // Browser: tools for UI work (asked for, or the request is about pages, layout or testing).
    loopOptions.vision = supportsVision(req.provider.provider, req.provider.model);
    if (wantsBrowser(req)) loopOptions.tools = [...(loopOptions.tools ?? ALL_TOOLS), ...this.browserTools(loopOptions)];

    // Code intelligence: update (or build) the project's index within a bounded wait, then give
    // the agent the code tools and a short overview.
    if (req.codeIndex !== false) {
      try {
        const state = await this.intel.ensure(projectRoot, 15_000);
        const ix = this.intel.get(projectRoot);
        const overview = ix.exists() ? renderArchitecture(architecture(ix), 1_500) : "";
        loopOptions.tools = [...(loopOptions.tools ?? ALL_TOOLS), ...codeTools(this.intel)];
        if (overview) loopOptions.codebase = overview;
        emit({ type: "code_context", overview, indexing: state === "building" });
      } catch {
        // The index must never stop a task.
      }
    }
    if (team) return this.startTeam(req, entry, loopOptions, { emit, learn, memSettings: memSettings ?? undefined, store, hasMcp });
    const loop = new AgentLoop(loopOptions);

    entry.done = (async () => {
      const r = await loop.run();
      let diffStat: string | undefined;
      if (entry.worktree) diffStat = await worktreeDiff(entry.worktree).then((d) => d.stat, () => undefined);
      if (r.status === "done" && learn) {
        let items = await reflectOnTask(loop, loopOptions, { summary: r.summary, diffStat });
        if (items.length && memSettings!.autoUpdate === "auto") items = applyAuto(store, items, taskId);
        if (items.length) emit({ type: "memory_proposal", items });
        r.usage = loop.usage;
      }
      entry.running = false;
      entry.approvals.clear();
      await this.endBrowserWork(taskId);
      if (hasMcp && workRoot !== projectRoot) this.mcp.removeRoot(projectRoot, workRoot);
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

  /** memory.get / memory.update: read or change a project's memory, answered with a snapshot. */
  private memory(req: Extract<Request, { type: "memory.get" | "memory.update" }>) {
    if (!fs.existsSync(req.projectRoot) || !fs.statSync(req.projectRoot).isDirectory())
      throw new Error(`project folder not found: ${req.projectRoot}`);
    const store = new MemoryStore(req.projectRoot);
    let saved: number | undefined;
    const duplicates: string[] = [];
    try {
      if (req.type === "memory.update") {
        const c = req.change;
        switch (c.op) {
          case "add": {
            const r = store.add({ category: c.category, text: c.text, status: "verified", source: "user" });
            saved = r.entry ? 1 : 0;
            if (r.duplicateOf) duplicates.push(r.duplicateOf.text);
            break;
          }
          case "edit":
            store.update(c.entryId, { text: c.text, category: c.category, status: "verified" });
            break;
          case "delete":
            store.remove(c.entryId);
            break;
          case "verify":
            store.verify(c.entryId);
            break;
          case "clear":
            store.clear();
            break;
          case "analyze":
            analyze(store);
            break;
          case "settings":
            store.setSettings(c.settings);
            break;
          case "accept":
            saved = 0;
            for (const it of c.items) {
              const r = store.add({ category: it.category, text: it.text, status: "verified", source: "task", taskId: it.taskId, replaces: it.replaces });
              if (r.entry) saved++;
              else if (r.duplicateOf) duplicates.push(r.duplicateOf.text);
            }
            break;
        }
      }
    } catch (e) {
      if (e instanceof MemoryError) throw new Error(e.message);
      throw e;
    }
    const data = store.load();
    this.emitter(req.id)({
      type: "memory",
      path: store.path,
      settings: data.settings,
      analyzedAt: data.analyzedAt,
      entries: data.entries,
      ...(saved !== undefined ? { saved } : {}),
      ...(duplicates.length ? { duplicates } : {}),
    });
  }

  /** MCP requests from the UI and CLI. Answers carry the request id; failures become `error` events. */
  private async mcpRequest(req: Extract<Request, { type: `mcp.${string}` }>) {
    const emit = this.emitter(req.id);
    const m = this.mcp;
    const snapshot = (extra: Record<string, unknown> = {}) => {
      const root = "projectRoot" in req ? req.projectRoot : undefined;
      emit({ type: "mcp_servers", projectRoot: root, servers: m.status(root), trusted: root ? m.trusted(root) : undefined, ...extra });
    };
    try {
      switch (req.type) {
        case "mcp.list":
          return snapshot({ importSources: knownImportSources(req.projectRoot) });
        case "mcp.config": {
          const c = req.change;
          if (req.scope === "project" && !req.projectRoot) throw new McpError("config", "Choose a project for project servers.");
          if (c.op === "save") {
            const parsed = McpServerConfig.safeParse(c.server);
            if (!parsed.success) throw new McpError("config", parsed.error.issues.map((i) => `${i.path.join(".") || "server"}: ${i.message}`).join("; "));
            if (parsed.data.transport.type === "http") validateServerUrl(parsed.data.transport.url, { allowPrivate: req.scope === "global" });
            await m.save(req.scope, parsed.data, { projectRoot: req.projectRoot, replaceId: c.replaceId });
            return snapshot();
          }
          if (c.op === "remove") {
            await m.remove({ scope: req.scope, id: c.id, projectRoot: req.projectRoot });
            return snapshot();
          }
          if (c.op === "trust") {
            if (!req.projectRoot) throw new McpError("config", "Trust applies to a project's config.");
            await m.setTrusted(req.projectRoot, c.trusted);
            return snapshot();
          }
          const imported = m.importFrom(req.scope, { file: c.file, json: c.json }, req.projectRoot);
          return snapshot({ imported });
        }
        case "mcp.connection": {
          const ref = { scope: req.scope, id: req.id, projectRoot: req.projectRoot };
          if (req.action === "test") {
            const r = req.server !== undefined ? await m.test({ scope: req.scope, config: req.server as never, projectRoot: req.projectRoot }) : await m.test(ref);
            return emit({ type: "mcp_test", ...r });
          }
          try {
            if (req.action === "connect") await m.connect(ref);
            else if (req.action === "reconnect") await m.reconnect(ref);
            else if (req.action === "authorize") await m.authorize(ref);
            else await m.disconnect(ref);
          } catch {
            // The failure is on the server's status (state "error" + message).
          }
          return snapshot();
        }
        case "mcp.inspect": {
          const ref = { scope: req.scope, id: req.id, projectRoot: req.projectRoot };
          if (req.kind === "logs") return emit({ type: "mcp_inspect", kind: "logs", logs: m.logs(ref) });
          if (req.kind === "tools") return emit({ type: "mcp_inspect", kind: "tools", tools: m.tools(ref) });
          if (req.kind === "resources") return emit({ type: "mcp_inspect", kind: "resources", resources: m.resources(ref) });
          return emit({ type: "mcp_inspect", kind: "prompts", prompts: m.prompts(ref) });
        }
        case "mcp.read_resource":
          return emit({ type: "mcp_resource", uri: req.uri, text: await m.readResource({ scope: req.scope, id: req.id, projectRoot: req.projectRoot }, req.uri) });
        case "mcp.get_prompt": {
          const r = await m.getPrompt({ scope: req.scope, id: req.id, projectRoot: req.projectRoot }, req.name, req.args);
          return emit({ type: "mcp_prompt", name: req.name, ...r });
        }
        case "mcp.permissions": {
          const policy = new Policy({ projectRoot: req.projectRoot, workRoot: req.projectRoot, store: this.deps.rulesStoreFor?.(req.projectRoot) });
          const c = req.change;
          if (c.op === "set") policy.setMcpRule(c.key, c.value);
          else if (c.op === "revoke") policy.revokeMcp(c.prefix);
          return emit({ type: "mcp_permissions", projectRoot: req.projectRoot, rules: policy.mcpRules() });
        }
        case "mcp.secret":
          m.setSecret({ scope: req.scope, id: req.id, projectRoot: req.projectRoot }, req.name, req.value);
          return snapshot();
      }
    } catch (e) {
      throw new Error(toMcpError(e, "config").message);
    }
  }

  /** A team run: the orchestrator replaces the single agent loop; done/diff/merge work as usual. */
  private startTeam(
    req: TaskStartRequest,
    entry: TaskEntry,
    lo: LoopOptions,
    x: { emit: (e: import("./protocol").EventBody) => void; learn: boolean; memSettings?: { autoUpdate: string }; store: MemoryStore; hasMcp: boolean },
  ) {
    const projectRoot = lo.projectRoot;
    const home = this.deps.skillsHome ?? this.deps.mcpHome ?? vardHome();
    const options = TeamOptions.parse(req.team ?? {});
    const registry = new RoleRegistry({ home, projectRoot });
    const roles = Object.fromEntries(ROLE_IDS.map((id) => [id, registry.role(id)])) as Record<RoleId, RoleConfig>;
    const label = (p: { provider: string; model: string }) => `${p.provider}/${p.model}`;
    const modelFor = (role: RoleConfig) => {
      const given = options.models?.[role.id];
      if (given) {
        const cfg = ProviderConfig.safeParse(given);
        if (cfg.success) return { model: this.modelFactory(cfg.data), label: label(cfg.data) };
      }
      // A role model on the task's provider can reuse the task's key; others need team.models.
      if (role.model && role.model.provider === req.provider.provider && (!role.model.baseURL || role.model.baseURL === req.provider.baseUrl))
        return {
          model: this.modelFactory({ ...req.provider, model: role.model.model, ...(role.model.baseURL ? { baseUrl: role.model.baseURL } : {}) }),
          label: label(role.model),
        };
      return { model: lo.model, label: label(req.provider) };
    };
    const skillsOn = req.autoSkills !== false;
    const orch = new Orchestrator({
      // Every role can query the code index; roles allowed the browser also get it and dev servers.
      toolsFor: (role, vision) => [
        ...(req.codeIndex !== false ? codeTools(this.intel) : []),
        ...(role.tools.browser ? browserTools({ mgr: this.browser, dev: this.devServers, vision: () => vision }) : []),
      ],
      taskId: entry.taskId,
      goal: req.prompt,
      projectRoot,
      integration: entry.worktree!,
      roles,
      options,
      emit: x.emit,
      requestApproval: lo.requestApproval,
      modelFor,
      policyFor: (workRoot) =>
        new Policy({
          projectRoot,
          workRoot,
          allowlist: req.allowlist,
          store: this.deps.rulesStoreFor?.(req.projectRoot) ?? new FileRulesStore(req.projectRoot),
        }),
      mcp: x.hasMcp
        ? {
            tools: () => this.mcp.toolDefs(projectRoot),
            summary: () => this.mcp.summary(projectRoot),
            addRoot: (p) => this.mcp.addRoot(projectRoot, p),
            removeRoot: (p) => this.mcp.removeRoot(projectRoot, p),
          }
        : undefined,
      skills: skillsOn ? this.skillRegistry(projectRoot) : undefined,
      memory: lo.memory,
      retry: this.deps.retry,
      verifyCommand: req.verifyCommand,
      signal: entry.abort.signal,
      reflectModel: lo.model,
      learn: x.learn ? { store: x.store, mode: x.memSettings?.autoUpdate === "auto" ? "auto" : "ask" } : null,
    });
    entry.team = orch;
    entry.done = (async () => {
      if (skillsOn) orch.setSignals(await projectSignals(projectRoot));
      const r = await orch.run();
      const diffStat = await worktreeDiff(entry.worktree!).then((d) => d.stat, () => undefined);
      if (r.proposals.length) x.emit({ type: "memory_proposal", items: r.proposals });
      entry.running = false;
      entry.approvals.clear();
      await this.endBrowserWork(entry.taskId);
      if (x.hasMcp && entry.worktree) this.mcp.removeRoot(projectRoot, entry.worktree.path);
      x.emit({ type: "done", status: r.status, summary: r.summary, reason: r.reason, steps: r.steps, usage: r.usage, diffStat });
    })();
  }

  /** agents.roles: list role configs, or save/reset a user override. */
  private rolesRequest(req: Extract<Request, { type: "agents.roles" }>) {
    const home = this.deps.skillsHome ?? this.deps.mcpHome ?? vardHome();
    const reg = new RoleRegistry({ home, projectRoot: req.projectRoot });
    try {
      if (req.change) reg.save(req.change.scope, req.change.role, req.change.op === "save" ? req.change.override : null);
      this.emitter(req.id)({ type: "agent_roles", roles: reg.all(), overrides: { global: reg.overrides("global"), project: reg.overrides("project") } });
    } catch (e) {
      if (e instanceof OrchestrationError) throw new Error(e.message);
      throw e;
    }
  }

  skillRegistry(projectRoot?: string) {
    return new SkillRegistry({ home: this.deps.skillsHome ?? this.deps.mcpHome ?? vardHome(), projectRoot });
  }

  /** skills.list / skills.get / skills.update. Answers carry the request id. */
  private async skillsRequest(req: Extract<Request, { type: `skills.${string}` }>) {
    const emit = this.emitter(req.id);
    if (req.projectRoot && (!fs.existsSync(req.projectRoot) || !fs.statSync(req.projectRoot).isDirectory()))
      throw new Error(`project folder not found: ${req.projectRoot}`);
    const reg = this.skillRegistry(req.projectRoot);
    const snapshot = (changed?: string) => {
      const hasProjectSkills = reg.all().some((r) => r.source === "project");
      emit({
        type: "skills",
        projectRoot: req.projectRoot,
        skills: reg.summaries(),
        trusted: req.projectRoot && hasProjectSkills ? reg.projectTrusted() : undefined,
        globalDir: reg.globalDir,
        projectDir: reg.projectDir,
        ...(changed ? { changed } : {}),
      });
    };
    try {
      if (req.type === "skills.list") return snapshot();
      if (req.type === "skills.get") {
        const r = reg.find(req.skillId);
        if (!r) throw new SkillError("not_found", `no skill "${req.skillId}"`);
        const one = [{ record: r, activation: { id: r.id, name: r.name, source: r.source, version: r.frontmatter?.version ?? "", score: 0, reasons: [], explicit: true } }];
        const text = r.frontmatter ? renderSkillsBlock(one) : "";
        return emit({
          type: "skill_detail",
          skill: reg.summary(r),
          text: r.text,
          body: r.body,
          usage: reg.usage(r).slice(0, 50),
          preview: { text, tokens: r.frontmatter ? previewTokens(one) : 0 },
        });
      }
      const res = applySkillChange(reg, req.change);
      if (res.validation) return emit({ type: "skill_validation", ...res.validation });
      return snapshot(res.id);
    } catch (e) {
      if (e instanceof SkillError) throw new Error(e.message);
      throw e;
    }
  }

  browserTools(lo: Pick<LoopOptions, "vision">) {
    return browserTools({ mgr: this.browser, dev: this.devServers, vision: () => !!lo.vision });
  }

  /** Closes a task's browser sessions and stops its dev servers (screenshots and reports stay). */
  async endBrowserWork(taskId: string) {
    this.devServers.stopTask(taskId);
    await this.browser.closeTask(taskId).catch(() => {});
  }

  /** browser.* and artifacts.* requests from the UI and CLI. */
  private async browserRequest(req: Extract<Request, { type: `browser.${string}` | `artifacts.${string}` }>) {
    const emit = this.emitter(req.id);
    try {
      switch (req.type) {
        case "browser.status":
          return emit({ type: "browser_status", install: detectBrowser(), running: this.browser.running, sessions: this.browser.list(), devServers: this.devServers.list() });
        case "browser.install": {
          const found = detectBrowser();
          if (!found.installed || req.force) {
            let last = 0;
            this.installing ??= installBrowser({
              onProgress: (received, total) => {
                if (Date.now() - last < 300 && received < total) return;
                last = Date.now();
                this.emitter(req.id)({ type: "browser_install_progress", received, total });
              },
            }).finally(() => (this.installing = null));
            await this.installing;
          }
          return emit({ type: "browser_status", install: detectBrowser(), running: this.browser.running, sessions: this.browser.list(), devServers: this.devServers.list() });
        }
        case "browser.sessions":
          return emit({ type: "browser_status", install: detectBrowser(), running: this.browser.running, sessions: this.browser.list(), devServers: this.devServers.list() });
        case "browser.control": {
          const s = this.browser.find(req.sessionId);
          if (!s || s.state === "closed") throw new BrowserError("closed", "That browser session is closed.");
          const key = [...this.browser.sessions].find(([, v]) => v === s)![0];
          switch (req.action) {
            case "stop":
              await this.browser.close(key);
              break;
            case "navigate": {
              // You typed this URL, so other sites are allowed for this session; file: and the like never are.
              const c = checkUrl(req.url ?? "", [...s.allowed]);
              if (c.action === "deny") throw new BrowserError("blocked", c.reason);
              if (c.origin) s.allowed.add(c.origin);
              await this.browser.act(s, "navigate (you)", () => s.page().goto(req.url!, { waitUntil: "load", timeout: 30_000 }));
              break;
            }
            case "back":
              await this.browser.act(s, "back (you)", () => s.page().goBack({ timeout: 15_000 }));
              break;
            case "reload":
              await this.browser.act(s, "reload (you)", () => s.page().reload({ timeout: 30_000 }));
              break;
            case "viewport":
              await this.browser.act(s, "viewport (you)", () => this.browser.setViewport(s, req.viewport ?? "laptop"));
              break;
            case "screenshot":
              await this.browser.act(s, "screenshot (you)", () => s.screenshot({ label: "manual", fullPage: true }));
              break;
          }
          return emit({ type: "browser_status", install: detectBrowser(), running: this.browser.running, sessions: this.browser.list(), devServers: this.devServers.list() });
        }
        case "artifacts.list":
          return emit({ type: "artifacts", projectRoot: req.projectRoot, items: listArtifacts(req.projectRoot, req.run).slice(0, 500) });
        case "artifacts.get": {
          const a = readArtifact(req.projectRoot, req.path);
          return emit({ type: "artifact", path: req.path, ...a });
        }
        case "artifacts.clean": {
          const r = cleanArtifacts(req.projectRoot, { run: req.run, olderThanDays: req.olderThanDays });
          return emit({ type: "artifacts", projectRoot: req.projectRoot, items: listArtifacts(req.projectRoot), removed: r.removed, bytes: r.bytes });
        }
      }
    } catch (e) {
      if (e instanceof BrowserError) throw new Error(e.message);
      throw e;
    }
  }

  /** code.index / code.query / code.config. Answers carry the request id. */
  private async codeRequest(req: Extract<Request, { type: `code.${string}` }>) {
    const emit = this.emitter(req.id);
    if (!fs.existsSync(req.projectRoot) || !fs.statSync(req.projectRoot).isDirectory()) throw new Error(`project folder not found: ${req.projectRoot}`);
    const root = fs.realpathSync(req.projectRoot);
    if ("apiKey" in req && req.apiKey) this.intel.setEmbeddingKey(root, req.apiKey);
    const ix = this.intel.get(root);
    try {
      if (req.type === "code.config") {
        const config = req.config ? saveIndexConfig(root, req.config) : loadIndexConfig(root);
        return emit({ type: "code_config", projectRoot: root, config });
      }
      if (req.type === "code.index") {
        switch (req.action) {
          case "build":
          case "rebuild": {
            if (!ix.isBuilding) {
              const ctrl = new AbortController();
              this.codeBuilds.set(root, ctrl);
              void this.intel
                .build(root, { force: req.action === "rebuild", signal: ctrl.signal })
                .then(async () => {
                  const p = this.intel.embeddings(root);
                  if (p) await updateEmbeddings(ix, p, { signal: ctrl.signal }).catch((e) => (ix.lastError = `embeddings: ${(e as Error).message}`));
                  this.emitter("code")({ type: "code_index_status", status: ix.status() });
                })
                .catch(() => {})
                .finally(() => this.codeBuilds.delete(root));
            }
            break;
          }
          case "cancel":
            this.codeBuilds.get(root)?.abort();
            break;
          case "clean":
            this.codeBuilds.get(root)?.abort();
            this.intel.unwatch(root);
            ix.close();
            deleteIndex(root);
            break;
          case "watch":
            this.intel.watch(root);
            break;
          case "unwatch":
            this.intel.unwatch(root);
            break;
        }
        return emit({ type: "code_index_status", status: ix.status() });
      }
      // code.query
      const q = req.query;
      if (q.kind !== "snippet" && !ix.exists()) throw new IntelError("not_indexed", "This project hasn't been indexed yet.");
      const g = new CodeGraph(ix);
      const out = (body: Record<string, unknown>) => emit({ type: "code_results", kind: q.kind, ...body } as never);
      switch (q.kind) {
        case "search":
          return out({ hits: await searchCode(ix, q.query, { limit: q.limit ?? 20, embeddings: this.intel.embeddings(root) }) });
        case "symbols":
          return out({ symbols: g.symbolSearch(q.query, q.limit ?? 40) });
        case "definition":
          return out({ symbols: g.definitions(q.name) });
        case "references":
        case "callers": {
          const refs = q.kind === "callers" ? g.callers(q.name) : g.references(q.name);
          return out({ locations: refs.map((r) => ({ path: r.path, line: r.line, kind: r.kind, in: r.in })), ambiguous: refs.some((r) => r.ambiguous) });
        }
        case "dependencies": {
          const d = g.dependencies(q.path);
          return out({ files: d.files.map((p) => ({ path: p, test: g.isTest(p) })), packages: d.packages });
        }
        case "dependents": {
          const d = (q.depth ?? 1) === 1 ? g.dependents(q.path).map((p) => ({ path: p, depth: 1 })) : g.dependentsDeep([q.path], q.depth);
          return out({ files: d.map((x) => ({ ...x, test: g.isTest(x.path) })) });
        }
        case "outline":
          return out({ symbols: g.outline(q.path) });
        case "architecture":
          return out({ text: renderArchitecture(architecture(ix), 8_000) });
        case "impact":
          return out({ impact: analyzeImpact(ix, q.target, { depth: q.depth }) });
        case "graph":
          return out({ graph: g.graph({ focus: q.focus, depth: q.depth, limit: q.limit }) });
        case "snippet": {
          let abs = nodePath.resolve(root, q.path);
          try {
            abs = fs.realpathSync(abs);
          } catch {
            throw new IntelError("path", `no such file: ${q.path}`);
          }
          if (!abs.startsWith(root + nodePath.sep)) throw new IntelError("path", "path escapes the project");
          if (isSensitive(q.path)) throw new IntelError("path", "refusing to show a credentials file");
          const lines = fs.readFileSync(abs, "utf8").split("\n");
          const ctx = q.context ?? 12;
          const start = Math.max(1, q.line - ctx);
          return out({ snippet: { path: q.path, start, lines: lines.slice(start - 1, q.line + ctx).map((l) => l.slice(0, 400)) } });
        }
      }
    } catch (e) {
      if (e instanceof IntelError) throw new Error(e.message);
      throw e;
    }
  }

  /** Abort everything (used on stdin EOF) and wait for tasks to settle. */
  async shutdown() {
    for (const c of this.codeBuilds.values()) c.abort();
    this.devServers.stopAll();
    await this.browser.closeAll().catch(() => {});
    this.intel.closeAll();
    await this.mcp.closeAll().catch(() => {});
    for (const c of this.chats.values()) c.abort();
    for (const t of this.tasks.values()) t.abort.abort();
    await Promise.allSettled([...this.tasks.values()].map((t) => t.done));
  }
}

const BROWSER_WORDS = /\b(browser|web ?page|page|pages|ui|layout|responsive|mobile|desktop|tablet|viewport|screenshot|visual|css|style|styling|dashboard|form|button|click|render|frontend|front-end|website|site|e2e|end-to-end|playwright|navigation|navbar|menu|overflow|dev server|localhost)\b/i;

/** Browser tools are offered when asked for, or when the request is about pages, layout or UI testing. */
export function wantsBrowser(req: TaskStartRequest): boolean {
  if (req.browser !== undefined) return req.browser;
  return BROWSER_WORDS.test(req.prompt);
}
