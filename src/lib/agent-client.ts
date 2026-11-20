/**
 * Typed bridge between the WebView and the `vard-agent` sidecar.
 *
 * The WebView never talks to the sidecar or Keychain directly: it calls Tauri
 * commands in src-tauri/src/lib.rs, which inject API keys and relay JSON-lines.
 * Protocol types are shared with the harness (harness/src/protocol.ts).
 */
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { Event as AgentEvent, Request as AgentRequest } from "../../harness/src/protocol";

export type { AgentEvent, AgentRequest };
export type ProviderId =
  | "anthropic"
  | "openai"
  | "google"
  | "ollama"
  | "openai-compatible"
  | "groq";

/** Distributive Omit, so each request variant keeps its own fields. */
type WithoutId<T> = T extends unknown ? Omit<T, "id"> : never;

export const isTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

let seq = 0;
export const newId = (prefix = "r") =>
  `${prefix}-${Date.now().toString(36)}-${(seq++).toString(36)}`;

type Handler = (event: AgentEvent) => void;
const handlers = new Set<Handler>();
let unlisten: Promise<UnlistenFn> | null = null;

function ensureListening() {
  if (unlisten || !isTauri()) return;
  unlisten = listen<AgentEvent>("agent://event", ({ payload }) => {
    for (const h of handlers) h(payload);
  });
}

/** Subscribe to every sidecar event. Returns an unsubscribe function. */
export function onAgentEvent(handler: Handler): () => void {
  ensureListening();
  handlers.add(handler);
  return () => handlers.delete(handler);
}

/** Send a request; returns the id its events will carry. */
export async function send(request: WithoutId<AgentRequest>, id = newId()): Promise<string> {
  if (!isTauri()) throw new Error("The agent is only available in the Vard AI desktop app.");
  ensureListening();
  await invoke("agent_send", { message: { ...request, id } });
  return id;
}

/** Health check: resolves with the sidecar version. */
export function ping(timeoutMs = 5000): Promise<string> {
  return new Promise((resolve, reject) => {
    const id = newId("ping");
    const timer = setTimeout(() => {
      off();
      reject(new Error("Agent did not respond"));
    }, timeoutMs);
    const off = onAgentEvent((e) => {
      if (e.id === id && e.type === "pong") {
        clearTimeout(timer);
        off();
        resolve(e.version);
      }
    });
    send({ type: "ping" }, id).catch((err) => {
      clearTimeout(timer);
      off();
      reject(err);
    });
  });
}

// ---- API keys (stored in the macOS Keychain by the shell) ----

export type KeyStatus = Record<ProviderId, string | null>;

export const keys = {
  status: () => invoke<KeyStatus>("api_key_status"),
  set: (provider: ProviderId, key: string) => invoke<void>("set_api_key", { provider, key }),
  remove: (provider: ProviderId) => invoke<void>("delete_api_key", { provider }),
};

export const restartAgent = () => invoke<void>("agent_restart");

/** The `vard` command-line tool (a link in /usr/local/bin to the binary inside the app). */
export type CliStatus = {
  link: string;
  bundled: string;
  installed: boolean;
  conflict: string | null;
};

export const cli = {
  status: () => invoke<CliStatus>("cli_status"),
  install: () => invoke<CliStatus>("install_cli"),
  uninstall: () => invoke<CliStatus>("uninstall_cli"),
};

// ---- project memory (<project>/.vard/memory.json, managed by the agent) ----

export type MemorySnapshot = Extract<AgentEvent, { type: "memory" }>;
export type MemoryEntry = MemorySnapshot["entries"][number];
export type MemorySettings = MemorySnapshot["settings"];
export type MemoryCategory = MemoryEntry["category"];
export type MemoryChange = Extract<AgentRequest, { type: "memory.update" }>["change"];

function memoryRequest(
  request: WithoutId<Extract<AgentRequest, { type: "memory.get" | "memory.update" }>>,
): Promise<MemorySnapshot> {
  return new Promise((resolve, reject) => {
    const id = newId("mem");
    const off = onAgentEvent((e) => {
      if (e.id !== id) return;
      off();
      if (e.type === "memory") resolve(e);
      else if (e.type === "error") reject(new Error(e.message));
    });
    send(request, id).catch((err) => {
      off();
      reject(err);
    });
  });
}

export const memory = {
  get: (projectRoot: string) => memoryRequest({ type: "memory.get", projectRoot }),
  update: (projectRoot: string, change: MemoryChange) =>
    memoryRequest({ type: "memory.update", projectRoot, change }),
};

export const MEMORY_CATEGORIES: { id: MemoryCategory; title: string }[] = [
  { id: "overview", title: "Project overview" },
  { id: "architecture", title: "Architecture and important files" },
  { id: "commands", title: "Commands" },
  { id: "conventions", title: "Conventions" },
  { id: "preferences", title: "Your preferences" },
  { id: "decisions", title: "Decisions" },
  { id: "fixes", title: "Solved bugs" },
  { id: "issues", title: "Known issues and limitations" },
  { id: "details", title: "Implementation details" },
];

// ---- MCP integrations (servers run by the local agent; secrets stay in the Keychain) ----

export type McpServersEvent = Extract<AgentEvent, { type: "mcp_servers" }>;
export type McpServerStatus = McpServersEvent["servers"][number];
export type McpScope = McpServerStatus["scope"];
export type McpServerConfigInput = McpServerStatus["config"];
export type McpTestResult = Extract<AgentEvent, { type: "mcp_test" }>;
export type McpInspect = Extract<AgentEvent, { type: "mcp_inspect" }>;
type McpRequest = Extract<AgentRequest, { type: `mcp.${string}` }>;

/** Sends one MCP request and resolves with its answer event (or rejects with the agent's error). */
function mcpRequest<T extends AgentEvent["type"]>(
  request: WithoutId<McpRequest>,
  answer: T,
): Promise<Extract<AgentEvent, { type: T }>> {
  return new Promise((resolve, reject) => {
    const id = newId("mcp");
    const off = onAgentEvent((e) => {
      if (e.id !== id) return;
      if (e.type === answer) {
        off();
        resolve(e as Extract<AgentEvent, { type: T }>);
      } else if (e.type === "error") {
        off();
        reject(new Error(e.message));
      }
    });
    send(request, id).catch((err) => {
      off();
      reject(err);
    });
  });
}

type Ref = { scope: McpScope; id: string; projectRoot?: string };

export const mcp = {
  list: (projectRoot?: string) => mcpRequest({ type: "mcp.list", projectRoot }, "mcp_servers"),
  save: (
    scope: McpScope,
    server: unknown,
    opts: { projectRoot?: string; replaceId?: string } = {},
  ) =>
    mcpRequest(
      {
        type: "mcp.config",
        scope,
        projectRoot: opts.projectRoot,
        change: { op: "save", server, replaceId: opts.replaceId },
      },
      "mcp_servers",
    ),
  remove: (r: Ref) =>
    mcpRequest(
      {
        type: "mcp.config",
        scope: r.scope,
        projectRoot: r.projectRoot,
        change: { op: "remove", id: r.id },
      },
      "mcp_servers",
    ),
  trust: (projectRoot: string, trusted: boolean) =>
    mcpRequest(
      { type: "mcp.config", scope: "project", projectRoot, change: { op: "trust", trusted } },
      "mcp_servers",
    ),
  importFile: (scope: McpScope, file: string, projectRoot?: string) =>
    mcpRequest(
      { type: "mcp.config", scope, projectRoot, change: { op: "import", file } },
      "mcp_servers",
    ),
  connection: (r: Ref, action: "connect" | "disconnect" | "reconnect" | "authorize") =>
    mcpRequest({ type: "mcp.connection", ...r, action }, "mcp_servers"),
  test: (r: Ref, server?: unknown) =>
    mcpRequest({ type: "mcp.connection", ...r, action: "test", server }, "mcp_test"),
  inspect: (r: Ref, kind: McpInspect["kind"]) =>
    mcpRequest({ type: "mcp.inspect", ...r, kind }, "mcp_inspect"),
  readResource: (r: Ref, uri: string) =>
    mcpRequest({ type: "mcp.read_resource", ...r, uri }, "mcp_resource"),
  getPrompt: (r: Ref, name: string, args: Record<string, string>) =>
    mcpRequest({ type: "mcp.get_prompt", ...r, name, args }, "mcp_prompt"),
  permissions: (
    projectRoot: string,
    change: Extract<McpRequest, { type: "mcp.permissions" }>["change"],
  ) => mcpRequest({ type: "mcp.permissions", projectRoot, change }, "mcp_permissions"),
  /** Stores a secret in the Keychain. The value is never sent back to the WebView. */
  setSecret: (r: Ref, name: string, value: string | null) =>
    mcpRequest({ type: "mcp.secret", ...r, name, value }, "mcp_servers"),
};

/** Live status pushes from the agent (connections, crashes, list changes). */
export function onMcpStatus(handler: (e: McpServersEvent) => void): () => void {
  return onAgentEvent((e) => {
    if (e.type === "mcp_servers" && e.id === "mcp") handler(e);
  });
}

/** Sends one request and resolves with the first answer event of one of `answers` (rejects on `error`). */
function ask<T extends AgentEvent["type"]>(
  request: WithoutId<AgentRequest>,
  answers: T[],
  prefix = "req",
): Promise<Extract<AgentEvent, { type: T }>> {
  return new Promise((resolve, reject) => {
    const id = newId(prefix);
    const off = onAgentEvent((e) => {
      if (e.id !== id) return;
      if ((answers as string[]).includes(e.type)) {
        off();
        resolve(e as Extract<AgentEvent, { type: T }>);
      } else if (e.type === "error") {
        off();
        reject(new Error(e.message));
      }
    });
    send(request, id).catch((err) => {
      off();
      reject(err);
    });
  });
}

// ---- skills (built-in, ~/.vard/skills and <project>/.vard/skills; managed by the agent) ----

export type SkillsSnapshot = Extract<AgentEvent, { type: "skills" }>;
export type SkillSummary = SkillsSnapshot["skills"][number];
export type SkillDetail = Extract<AgentEvent, { type: "skill_detail" }>;
export type SkillValidation = Extract<AgentEvent, { type: "skill_validation" }>;
export type SkillChange = Extract<AgentRequest, { type: "skills.update" }>["change"];
export type ActivatedSkill = Extract<AgentEvent, { type: "skills_activated" }>["skills"][number];

export const skills = {
  list: (projectRoot?: string) => ask({ type: "skills.list", projectRoot }, ["skills"], "sk"),
  get: (skillId: string, projectRoot?: string) =>
    ask({ type: "skills.get", skillId, projectRoot }, ["skill_detail"], "sk"),
  update: (change: SkillChange, projectRoot?: string) =>
    ask({ type: "skills.update", change, projectRoot }, ["skills"], "sk"),
  validate: (text: string) =>
    ask({ type: "skills.update", change: { op: "validate", text } }, ["skill_validation"], "sk"),
};

// ---- team runs (multi-agent) ----

export type AgentRoles = Extract<AgentEvent, { type: "agent_roles" }>;
export type RoleConfig = AgentRoles["roles"][number];
export type RoleOverride =
  NonNullable<Extract<AgentRequest, { type: "agents.roles" }>["change"]> extends infer C
    ? C extends { op: "save"; override: infer O }
      ? O
      : never
    : never;

export const agentRoles = {
  list: (projectRoot?: string) =>
    ask({ type: "agents.roles", projectRoot }, ["agent_roles"], "roles"),
  save: (
    scope: "global" | "project",
    role: RoleConfig["id"],
    override: RoleOverride,
    projectRoot?: string,
  ) =>
    ask(
      { type: "agents.roles", projectRoot, change: { op: "save", scope, role, override } },
      ["agent_roles"],
      "roles",
    ),
  reset: (scope: "global" | "project", role: RoleConfig["id"], projectRoot?: string) =>
    ask(
      { type: "agents.roles", projectRoot, change: { op: "reset", scope, role } },
      ["agent_roles"],
      "roles",
    ),
};

// ---- code intelligence (per-project index in <project>/.vard/index) ----

export type CodeIndexStatus = Extract<AgentEvent, { type: "code_index_status" }>["status"];
export type CodeResults = Extract<AgentEvent, { type: "code_results" }>;
export type CodeQuery = Extract<AgentRequest, { type: "code.query" }>["query"];
export type CodeConfig = Extract<AgentEvent, { type: "code_config" }>["config"];
export type ImpactReport = NonNullable<CodeResults["impact"]>;
export type GraphData = NonNullable<CodeResults["graph"]>;

export const code = {
  status: (projectRoot: string) =>
    ask({ type: "code.index", projectRoot, action: "status" }, ["code_index_status"], "code"),
  index: (
    projectRoot: string,
    action: "build" | "rebuild" | "cancel" | "clean" | "watch" | "unwatch",
  ) => ask({ type: "code.index", projectRoot, action }, ["code_index_status"], "code"),
  query: (projectRoot: string, query: CodeQuery) =>
    ask({ type: "code.query", projectRoot, query }, ["code_results"], "code"),
  config: (projectRoot: string, config?: Partial<CodeConfig>) =>
    ask({ type: "code.config", projectRoot, config }, ["code_config"], "code"),
};

/** Live index status and progress pushed by the agent (id "code"). */
export function onCodeIndex(
  handler: (e: Extract<AgentEvent, { type: "code_index_status" | "code_index_progress" }>) => void,
): () => void {
  return onAgentEvent((e) => {
    if (e.id === "code" && (e.type === "code_index_status" || e.type === "code_index_progress"))
      handler(e);
  });
}

// ---- browser agent ----

export type BrowserStatus = Extract<AgentEvent, { type: "browser_status" }>;
export type BrowserSessionInfo = BrowserStatus["sessions"][number];
export type DevServerInfo = BrowserStatus["devServers"][number];
export type BrowserReport = Extract<AgentEvent, { type: "browser_report" }>["report"];
export type ArtifactItem = Extract<AgentEvent, { type: "artifacts" }>["items"][number];
/** Browser settings, e.g. artifact retention in days (0 keeps them forever, at most 365). */
export type BrowserSettings = Extract<AgentEvent, { type: "browser_settings" }>["settings"];
export type ViewportPreset = "mobile" | "mobile-large" | "tablet" | "laptop" | "desktop";

export const browser = {
  status: () => ask({ type: "browser.status" }, ["browser_status"], "br"),
  install: () => ask({ type: "browser.install" }, ["browser_status"], "br"),
  control: (
    sessionId: string,
    action: "navigate" | "back" | "reload" | "viewport" | "screenshot" | "stop",
    extra: { url?: string; viewport?: ViewportPreset } = {},
  ) => ask({ type: "browser.control", sessionId, action, ...extra }, ["browser_status"], "br"),
  artifacts: (projectRoot: string, run?: string) =>
    ask({ type: "artifacts.list", projectRoot, run }, ["artifacts"], "br"),
  artifact: (projectRoot: string, path: string) =>
    ask({ type: "artifacts.get", projectRoot, path }, ["artifact"], "br"),
  cleanArtifacts: (projectRoot: string, o: { run?: string; olderThanDays?: number } = {}) =>
    ask({ type: "artifacts.clean", projectRoot, ...o }, ["artifacts"], "br"),
  /** Sites remembered as allowed for a project; `remove` forgets one first. */
  origins: (projectRoot: string, remove?: string) =>
    ask({ type: "browser.origins", projectRoot, remove }, ["browser_origins"], "br"),
  /** Reads (or, with `settings`, changes) the browser settings. */
  settings: (settings?: BrowserSettings) =>
    ask({ type: "browser.settings", settings }, ["browser_settings"], "br"),
};

/** Live browser events (sessions, actions, reports, dev servers, install progress). */
export function onBrowser(
  handler: (
    e: Extract<
      AgentEvent,
      {
        type:
          | "browser_session"
          | "browser_action"
          | "browser_report"
          | "dev_server"
          | "browser_install_progress";
      }
    >,
  ) => void,
): () => void {
  return onAgentEvent((e) => {
    if (
      [
        "browser_session",
        "browser_action",
        "browser_report",
        "dev_server",
        "browser_install_progress",
      ].includes(e.type)
    )
      handler(e as never);
  });
}
