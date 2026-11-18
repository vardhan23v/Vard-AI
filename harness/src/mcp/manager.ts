/**
 * MCP manager: every configured server (global and per project), their connections, tools for
 * the agent, and the config/trust/secret operations the UI and CLI use.
 *
 * Connections are per project (a global server used in two projects runs twice, each with its
 * own roots), start lazily (when a task starts or the user connects), and fail independently:
 * one broken server never blocks a task or another server.
 */
import fs from "node:fs";
import path from "node:path";
import type { ToolDef } from "../tools/types";
import { McpConnection } from "./client";
import {
  configPath,
  importServers,
  isTrusted,
  loadConfig,
  refreshTrustIfTrusted,
  removeServer,
  setTrust,
  upsertServer,
  vardHome,
} from "./config";
import { McpError, toMcpError } from "./errors";
import { VardOAuthProvider } from "./oauth";
import { renderPrompt } from "./prompts";
import { resourceText, resourceTools } from "./resources";
import { defaultSecretStore, secretAccount, type SecretStore } from "./secrets";
import { toolInfo, toToolDefs } from "./tools";
import { validateServerUrl } from "./security";
import { requiredSecrets } from "./transport";
import type { McpScope, McpServerConfig, McpServerInput, McpServerStatus } from "./types";

export type ServerRef = { scope: McpScope; id: string; projectRoot?: string };

export type ManagerOptions = {
  home?: string;
  secrets?: SecretStore;
  /** Called whenever a server's status, lists or config change (for live UI updates). */
  onChange?: (projectRoot: string | undefined) => void;
  onProgress?: (tool: string, p: { progress: number; total?: number; message?: string }) => void;
  autoReconnect?: boolean;
};

const projKey = (projectRoot?: string) => (projectRoot ? path.resolve(projectRoot) : "");

export class McpManager {
  readonly home: string;
  readonly secrets: SecretStore;
  private conns = new Map<string, McpConnection>();
  private extraRoots = new Map<string, Set<string>>();

  constructor(private opts: ManagerOptions = {}) {
    this.home = opts.home ?? vardHome();
    this.secrets = opts.secrets ?? defaultSecretStore();
  }

  // ---------- config ----------

  private file(scope: McpScope, projectRoot?: string) {
    return configPath(scope, { home: this.home, projectRoot });
  }

  /** Server configs visible in a project (global first, then the project's own). */
  configs(projectRoot?: string): { scope: McpScope; config: McpServerConfig; error?: string }[] {
    const out: { scope: McpScope; config: McpServerConfig; error?: string }[] = [];
    for (const s of loadConfig(this.file("global")).servers)
      out.push({ scope: "global", config: s });
    if (projectRoot) {
      try {
        for (const s of loadConfig(this.file("project", projectRoot)).servers)
          out.push({ scope: "project", config: s });
      } catch (e) {
        out.push({
          scope: "project",
          config: {
            id: "invalid-config",
            name: "Project MCP config",
            transport: { type: "stdio", command: "-", args: [], env: {} },
            enabled: false,
            timeouts: { startupMs: 20000, requestMs: 60000 },
            disabledTools: [],
          },
          error: (e as Error).message,
        });
      }
    }
    return out;
  }

  private find(ref: ServerRef): McpServerConfig {
    const hit = this.configs(ref.projectRoot).find(
      (c) => c.scope === ref.scope && c.config.id === ref.id,
    );
    if (!hit) throw new McpError("config", `No ${ref.scope} MCP server "${ref.id}".`);
    return hit.config;
  }

  trusted(projectRoot: string) {
    return isTrusted(this.home, projectRoot);
  }

  /** Adds or replaces a server. Returns the saved config. Changing a server reconnects it. */
  async save(
    scope: McpScope,
    input: McpServerInput,
    opts: { projectRoot?: string; replaceId?: string } = {},
  ) {
    // Every path (app, CLI, import) gets the same URL rules.
    const t = (input as { transport?: { type?: string; url?: string } }).transport;
    if (t?.type === "http" && typeof t.url === "string")
      validateServerUrl(t.url, { allowPrivate: scope === "global" });
    const projectRoot = scope === "project" ? opts.projectRoot : undefined;
    const wasTrusted = !!projectRoot && this.trusted(projectRoot);
    // Creating the project file from Vard trusts it; editing an untrusted file (e.g. one that came
    // with a cloned repo) does not, so servers the user never reviewed stay blocked.
    const created = !!projectRoot && !fs.existsSync(this.file("project", projectRoot));
    const saved = upsertServer(this.file(scope, opts.projectRoot), input, {
      projectRoot,
      replaceId: opts.replaceId,
    });
    if (projectRoot) refreshTrustIfTrusted(this.home, projectRoot, wasTrusted || created);
    await this.dropConnections({
      scope,
      id: opts.replaceId ?? saved.id,
      projectRoot: opts.projectRoot,
    });
    this.changed(opts.projectRoot);
    return saved;
  }

  async remove(ref: ServerRef) {
    const wasTrusted =
      ref.scope === "project" && !!ref.projectRoot && this.trusted(ref.projectRoot);
    await this.dropConnections(ref);
    removeServer(this.file(ref.scope, ref.projectRoot), ref.id, {
      projectRoot: ref.scope === "project" ? ref.projectRoot : undefined,
    });
    if (ref.projectRoot) refreshTrustIfTrusted(this.home, ref.projectRoot, wasTrusted);
    for (const name of [...this.secretNames(ref), "oauth-client", "oauth-tokens"])
      this.secrets.remove(secretAccount(ref.scope, ref.id, name, ref.projectRoot));
    this.changed(ref.projectRoot);
  }

  private secretNames(ref: ServerRef): string[] {
    try {
      return requiredSecrets(this.find(ref));
    } catch {
      return [];
    }
  }

  async setTrusted(projectRoot: string, trusted: boolean) {
    setTrust(this.home, projectRoot, trusted);
    if (!trusted)
      for (const [k, c] of this.conns)
        if (k.startsWith(`${projKey(projectRoot)}::project:`)) await c.close();
    this.changed(projectRoot);
  }

  /** Stores (or clears, with null) one secret for a server. The value never comes back out. */
  setSecret(ref: ServerRef, name: string, value: string | null) {
    const account = secretAccount(ref.scope, ref.id, name, ref.projectRoot);
    if (value === null || value === "") this.secrets.remove(account);
    else this.secrets.set(account, value);
    this.changed(ref.projectRoot);
  }

  /**
   * Imports servers from another app's config (Claude Desktop, Cursor, VS Code…). They arrive
   * disabled, with every env value and header moved into the Keychain; nothing runs until the
   * user enables a server.
   */
  importFrom(
    scope: McpScope,
    source: { file?: string; json?: unknown },
    projectRoot?: string,
  ): string[] {
    let json = source.json;
    if (source.file) {
      try {
        json = JSON.parse(fs.readFileSync(source.file, "utf8"));
      } catch {
        throw new McpError("config", `Couldn't read ${source.file}.`);
      }
    }
    const existing = new Set(
      this.configs(projectRoot)
        .filter((c) => c.scope === scope)
        .map((c) => c.config.id),
    );
    const added: string[] = [];
    for (const s of importServers(json)) {
      let id = s.id;
      for (let n = 2; existing.has(id); n++) id = `${s.id.slice(0, 36)}-${n}`;
      existing.add(id);
      const { secretEnv, ...cfg } = s;
      upsertServer(
        this.file(scope, projectRoot),
        { ...cfg, id },
        { projectRoot: scope === "project" ? projectRoot : undefined },
      );
      for (const [name, value] of Object.entries(secretEnv))
        if (value) this.secrets.set(secretAccount(scope, id, name, projectRoot), value);
      added.push(id);
    }
    if (scope === "project" && projectRoot) setTrust(this.home, projectRoot, true);
    this.changed(projectRoot);
    return added;
  }

  // ---------- connections ----------

  private key(ref: ServerRef) {
    return `${projKey(ref.projectRoot)}::${ref.scope}:${ref.id}`;
  }

  private changed(projectRoot?: string) {
    this.opts.onChange?.(projectRoot);
  }

  private oauthFor(ref: ServerRef, cfg: McpServerConfig) {
    if (cfg.transport.type !== "http" || cfg.transport.auth !== "oauth") return undefined;
    return new VardOAuthProvider(
      this.secrets,
      secretAccount(ref.scope, ref.id, "oauth", ref.projectRoot).replace(/\/oauth$/, ""),
    );
  }

  private connection(ref: ServerRef, create = true): McpConnection | undefined {
    const k = this.key(ref);
    let c = this.conns.get(k);
    if (!c && create) {
      const cfg = this.find(ref);
      if (ref.scope === "project" && (!ref.projectRoot || !this.trusted(ref.projectRoot)))
        throw new McpError("trust", "Trust this project's MCP config before starting its servers.");
      const root = ref.projectRoot;
      c = new McpConnection(
        cfg,
        {
          scope: ref.scope,
          projectRoot: root,
          secrets: this.secrets,
          oauth: this.oauthFor(ref, cfg),
          roots: () => (root ? [root, ...(this.extraRoots.get(projKey(root)) ?? [])] : []),
        },
        { onStatus: () => this.changed(root), onListChanged: () => this.changed(root) },
        { autoReconnect: this.opts.autoReconnect ?? true },
      );
      this.conns.set(k, c);
    }
    return c;
  }

  private async dropConnections(ref: ServerRef) {
    for (const [k, c] of this.conns)
      if (
        k.endsWith(`::${ref.scope}:${ref.id}`) &&
        (ref.scope === "global" || k.startsWith(projKey(ref.projectRoot)))
      ) {
        await c.close();
        this.conns.delete(k);
      }
  }

  async connect(ref: ServerRef) {
    const c = this.connection(ref)!;
    await c.connect();
    return c;
  }

  async disconnect(ref: ServerRef) {
    await this.connection(ref, false)?.close();
    this.changed(ref.projectRoot);
  }

  async reconnect(ref: ServerRef) {
    await this.disconnect(ref);
    return this.connect(ref);
  }

  async authorize(ref: ServerRef) {
    await this.connection(ref)!.authorize();
  }

  /** Connects with a throwaway connection and reports what the server offers. */
  async test(ref: ServerRef | { scope: McpScope; config: McpServerInput; projectRoot?: string }) {
    const cfg =
      "config" in ref
        ? (await import("./types")).McpServerConfig.parse(ref.config)
        : this.find(ref);
    const scope = ref.scope;
    const conn = new McpConnection(
      cfg,
      {
        scope,
        projectRoot: ref.projectRoot,
        secrets: this.secrets,
        oauth: this.oauthFor({ scope, id: cfg.id, projectRoot: ref.projectRoot }, cfg),
        roots: () => (ref.projectRoot ? [ref.projectRoot] : []),
      },
      {},
      { autoReconnect: false },
    );
    try {
      await conn.connect();
      return {
        ok: true as const,
        serverInfo: conn.serverInfo,
        protocolVersion: conn.protocolVersion,
        capabilities: conn.capabilities,
        tools: conn.tools.length,
        resources: conn.resources.length,
        prompts: conn.prompts.length,
        logs: conn.logs.slice(-20),
      };
    } catch (e) {
      return { ok: false as const, error: toMcpError(e).message, logs: conn.logs.slice(-20) };
    } finally {
      await conn.close();
    }
  }

  /**
   * Before a task: connect every enabled (and trusted) server for the project, in parallel,
   * waiting at most `timeoutMs`. Failures are recorded on each server and never thrown.
   */
  async prepare(projectRoot: string, timeoutMs = 10_000) {
    const refs = this.configs(projectRoot)
      .filter(
        (c) => c.config.enabled && !c.error && (c.scope === "global" || this.trusted(projectRoot)),
      )
      .map((c) => ({ scope: c.scope, id: c.config.id, projectRoot }));
    if (!refs.length) return;
    const all = Promise.allSettled(refs.map((r) => this.connect(r)));
    await Promise.race([all, new Promise((r) => setTimeout(r, timeoutMs))]);
  }

  /** Tools for the agent in this project: connected servers' enabled tools plus resource helpers. */
  toolDefs(projectRoot: string): ToolDef[] {
    const conns = this.projectConnections(projectRoot);
    const taken = new Set<string>();
    const defs: ToolDef[] = [];
    for (const { scope, conn } of conns)
      defs.push(...toToolDefs(conn, scope, taken, this.opts.onProgress));
    defs.push(...resourceTools(() => conns.map((c) => c.conn)));
    return defs;
  }

  /** Short list of connected servers and their tool names, for the system prompt. */
  summary(projectRoot: string): { name: string; id: string; tools: string[] }[] {
    return this.projectConnections(projectRoot).map(({ scope, conn }) => ({
      name: conn.config.name,
      id: conn.config.id,
      tools: toToolDefs(conn, scope, new Set()).map((t) => t.name),
    }));
  }

  private projectConnections(projectRoot: string) {
    const out: { scope: McpScope; conn: McpConnection }[] = [];
    for (const c of this.configs(projectRoot)) {
      if (!c.config.enabled) continue;
      const conn = this.conns.get(this.key({ scope: c.scope, id: c.config.id, projectRoot }));
      if (conn?.connected) out.push({ scope: c.scope, conn });
    }
    return out;
  }

  /** Task worktrees count as roots for the project's servers while the task runs. */
  addRoot(projectRoot: string, root: string) {
    const k = projKey(projectRoot);
    const set = this.extraRoots.get(k) ?? new Set();
    set.add(root);
    this.extraRoots.set(k, set);
    for (const { conn } of this.projectConnections(projectRoot)) void conn.notifyRootsChanged();
  }

  removeRoot(projectRoot: string, root: string) {
    this.extraRoots.get(projKey(projectRoot))?.delete(root);
    for (const { conn } of this.projectConnections(projectRoot)) void conn.notifyRootsChanged();
  }

  // ---------- views ----------

  status(projectRoot?: string): McpServerStatus[] {
    return this.configs(projectRoot).map(({ scope, config, error }) => {
      const ref = { scope, id: config.id, projectRoot };
      const conn = this.conns.get(this.key(ref));
      const needsTrust = scope === "project" && !!projectRoot && !this.trusted(projectRoot);
      const t = config.transport;
      return {
        key: `${scope}:${config.id}`,
        id: config.id,
        scope,
        name: config.name,
        description: config.description,
        transport: t.type,
        target:
          t.type === "stdio" ? [t.command, ...t.args].join(" ").slice(0, 300) : safeHost(t.url),
        enabled: config.enabled,
        state: error
          ? "error"
          : !config.enabled
            ? "disabled"
            : needsTrust
              ? "needs_trust"
              : (conn?.state ?? "disconnected"),
        error: error ?? conn?.error,
        toolCount: conn?.tools.filter((x) => !config.disabledTools.includes(x.name)).length ?? 0,
        resourceCount: conn?.resources.length ?? 0,
        promptCount: conn?.prompts.length ?? 0,
        lastConnectedAt: conn?.lastConnectedAt,
        serverInfo: conn?.serverInfo,
        protocolVersion: conn?.protocolVersion,
        capabilities: conn?.capabilities ?? [],
        secrets: requiredSecrets(config).map((name) => ({
          name,
          set: !!this.secrets.get(secretAccount(scope, config.id, name, projectRoot)),
        })),
        config,
      };
    });
  }

  private live(ref: ServerRef): McpConnection {
    const c = this.connection(ref, false);
    if (!c?.connected) throw new McpError("closed", "Connect the server first.");
    return c;
  }

  tools(ref: ServerRef) {
    const c = this.live(ref);
    return c.tools.map((t) => toolInfo(c.config.id, t, c.config.disabledTools));
  }

  resources(ref: ServerRef) {
    return this.live(ref).resources;
  }

  prompts(ref: ServerRef) {
    return this.live(ref).prompts;
  }

  logs(ref: ServerRef) {
    return this.connection(ref, false)?.logs.slice() ?? [];
  }

  async readResource(ref: ServerRef, uri: string) {
    return resourceText(await this.live(ref).readResource(uri));
  }

  async getPrompt(ref: ServerRef, name: string, args: Record<string, string>) {
    return renderPrompt(this.live(ref), name, args);
  }

  async closeAll() {
    await Promise.allSettled([...this.conns.values()].map((c) => c.close()));
    this.conns.clear();
  }
}

function safeHost(url: string) {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}${u.pathname}`;
  } catch {
    return "(invalid URL)";
  }
}
