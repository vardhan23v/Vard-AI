/**
 * One MCP server connection: initialize (protocol version and capabilities), cached tool,
 * resource and prompt lists kept fresh by list-changed notifications, startup and request
 * timeouts, crash detection with bounded reconnects, a redacted log, and a clean shutdown that
 * stops the server's whole process tree.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { ListRootsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { pathToFileURL } from "node:url";
import { VERSION } from "../version";
import { killTree } from "../util";
import { McpError, toMcpError } from "./errors";
import type { VardOAuthProvider } from "./oauth";
import { cleanText, redact } from "./security";
import { createTransport, type TransportContext } from "./transport";
import type {
  McpPromptInfo,
  McpResourceInfo,
  McpServerConfig,
  McpState,
  McpToolAnnotations,
} from "./types";

export type RawTool = {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
  annotations?: McpToolAnnotations;
};

export type ConnectionEvents = {
  onStatus?: (c: McpConnection) => void;
  onListChanged?: (c: McpConnection) => void;
};

const MAX_LOG = 500;
const RECONNECT_DELAYS = [1000, 3000, 8000];

export class McpConnection {
  state: McpState = "disconnected";
  error?: string;
  lastConnectedAt?: string;
  tools: RawTool[] = [];
  resources: McpResourceInfo[] = [];
  prompts: McpPromptInfo[] = [];
  serverInfo?: { name: string; version: string };
  protocolVersion?: string;
  capabilities: string[] = [];
  readonly logs: string[] = [];

  private client: Client | null = null;
  private transport: Transport | null = null;
  private secretValues: string[] = [];
  private closing = false;
  private reconnects = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connecting: Promise<void> | null = null;

  constructor(
    readonly config: McpServerConfig,
    private ctx: TransportContext & { roots: () => string[]; oauth?: VardOAuthProvider },
    private events: ConnectionEvents = {},
    private opts: { autoReconnect?: boolean } = { autoReconnect: true },
  ) {}

  get connected() {
    return this.state === "connected" && !!this.client;
  }

  log(line: string) {
    const t = new Date().toISOString().slice(11, 19);
    for (const l of redact(line, this.secretValues).split("\n")) {
      if (!l.trim()) continue;
      this.logs.push(`${t} ${cleanText(l, 2000)}`);
    }
    if (this.logs.length > MAX_LOG) this.logs.splice(0, this.logs.length - MAX_LOG);
  }

  private setState(s: McpState, error?: string) {
    this.state = s;
    this.error = error ? redact(error, this.secretValues) : undefined;
    this.events.onStatus?.(this);
  }

  /** Connects (once; concurrent callers share the attempt). */
  connect(): Promise<void> {
    if (this.connected) return Promise.resolve();
    this.connecting ??= this.doConnect().finally(() => (this.connecting = null));
    return this.connecting;
  }

  private async doConnect() {
    this.closing = false;
    this.setState("connecting");
    let transport: Transport;
    try {
      const made = createTransport(this.config, this.ctx);
      transport = made.transport;
      this.secretValues = made.secretValues;
    } catch (e) {
      const err = toMcpError(e, "config");
      this.setState("error", err.message);
      throw err;
    }
    const client = new Client(
      { name: "vard-ai", version: VERSION },
      {
        capabilities: { roots: { listChanged: true } },
        listChanged: {
          tools: { onChanged: (err, items) => this.onList("tools", err, items) },
          resources: { onChanged: (err, items) => this.onList("resources", err, items) },
          prompts: { onChanged: (err, items) => this.onList("prompts", err, items) },
        },
      },
    );
    // Roots: only the project and the task worktree.
    client.setRequestHandler(ListRootsRequestSchema, async () => ({
      roots: this.ctx
        .roots()
        .map((r) => ({ uri: pathToFileURL(r).href, name: r.split("/").pop() || r })),
    }));
    this.watchTransport(transport);
    // The SDK reports the negotiated protocol version through this optional transport hook.
    const t = transport as Transport & { setProtocolVersion?: (v: string) => void };
    const original = t.setProtocolVersion?.bind(t);
    t.setProtocolVersion = (v: string) => {
      this.protocolVersion = v;
      original?.(v);
    };
    this.log(`connecting (${this.config.transport.type})`);

    const startup = this.config.timeouts.startupMs;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        client.connect(transport, { timeout: startup }),
        new Promise(
          (_, reject) =>
            (timer = setTimeout(
              () =>
                reject(
                  new McpError(
                    "timeout",
                    `The server didn't start within ${Math.round(startup / 1000)}s.`,
                  ),
                ),
              startup,
            )),
        ),
      ]);
    } catch (e) {
      clearTimeout(timer);
      await this.teardown(transport, client);
      const err = toMcpError(e, this.config.transport.type === "stdio" ? "spawn" : "protocol");
      this.log(`connect failed: ${err.message}`);
      this.setState(err.code === "auth" ? "needs_auth" : "error", err.message);
      throw err;
    }
    clearTimeout(timer);

    this.client = client;
    this.transport = transport;
    this.serverInfo = client.getServerVersion()
      ? { name: client.getServerVersion()!.name, version: client.getServerVersion()!.version }
      : undefined;
    const caps = client.getServerCapabilities() ?? {};
    this.capabilities = Object.keys(caps).filter(
      (k) => (caps as Record<string, unknown>)[k] != null,
    );
    try {
      await this.refreshLists();
    } catch (e) {
      this.log(`listing failed: ${toMcpError(e).message}`);
    }
    this.reconnects = 0;
    this.lastConnectedAt = new Date().toISOString();
    this.log(
      `connected: ${this.serverInfo?.name ?? "server"} ${this.serverInfo?.version ?? ""} · ${this.tools.length} tools`,
    );
    this.setState("connected");
  }

  private watchTransport(transport: Transport) {
    if (transport instanceof StdioClientTransport) {
      transport.stderr?.on("data", (d: Buffer) => this.log(`[stderr] ${d.toString()}`));
    }
    const prevClose = transport.onclose;
    transport.onclose = () => {
      prevClose?.();
      if (this.closing || this.transport !== transport) return;
      this.client = null;
      this.transport = null;
      this.log("the server exited or the connection closed unexpectedly");
      this.setState("error", "The server stopped unexpectedly.");
      this.scheduleReconnect();
    };
    const prevError = transport.onerror;
    transport.onerror = (err) => {
      prevError?.(err);
      this.log(`transport error: ${err.message}`);
    };
  }

  private scheduleReconnect() {
    if (!this.opts.autoReconnect || this.closing || this.reconnects >= RECONNECT_DELAYS.length)
      return;
    const delay = RECONNECT_DELAYS[this.reconnects++];
    this.log(
      `reconnecting in ${delay / 1000}s (attempt ${this.reconnects}/${RECONNECT_DELAYS.length})`,
    );
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect().catch(() => this.scheduleReconnect());
    }, delay);
  }

  private onList(
    kind: "tools" | "resources" | "prompts",
    err: Error | null,
    items: unknown[] | null,
  ) {
    if (err) return this.log(`refreshing ${kind} failed: ${err.message}`);
    if (kind === "tools") this.tools = (items ?? []) as RawTool[];
    else void this.refreshLists().catch(() => {});
    this.log(`${kind} changed (${items?.length ?? 0})`);
    this.events.onListChanged?.(this);
    this.events.onStatus?.(this);
  }

  async refreshLists() {
    const c = this.requireClient();
    const timeout = this.config.timeouts.requestMs;
    const caps = c.getServerCapabilities() ?? {};
    this.tools = caps.tools
      ? await collect((cursor) => c.listTools({ cursor }, { timeout }), "tools")
      : [];
    if (caps.resources) {
      const res = await collect(
        (cursor) => c.listResources({ cursor }, { timeout }),
        "resources",
      ).catch(() => []);
      const tpl = await collect(
        (cursor) => c.listResourceTemplates({ cursor }, { timeout }),
        "resourceTemplates",
      ).catch(() => []);
      this.resources = [
        ...res.map((r: { uri: string; name: string; description?: string; mimeType?: string }) => ({
          uri: r.uri,
          name: r.name,
          description: r.description,
          mimeType: r.mimeType,
        })),
        ...tpl.map(
          (r: { uriTemplate: string; name: string; description?: string; mimeType?: string }) => ({
            uri: r.uriTemplate,
            name: r.name,
            description: r.description,
            mimeType: r.mimeType,
            template: true,
          }),
        ),
      ];
    } else this.resources = [];
    this.prompts = caps.prompts
      ? (
          await collect((cursor) => c.listPrompts({ cursor }, { timeout }), "prompts").catch(
            () => [],
          )
        ).map(
          (p: {
            name: string;
            description?: string;
            arguments?: { name: string; description?: string; required?: boolean }[];
          }) => ({
            name: p.name,
            description: p.description,
            arguments: p.arguments ?? [],
          }),
        )
      : [];
  }

  private requireClient(): Client {
    if (!this.client) throw new McpError("closed", `${this.config.name} isn't connected.`);
    return this.client;
  }

  async callTool(
    name: string,
    args: Record<string, unknown>,
    opts: {
      signal?: AbortSignal;
      onProgress?: (p: { progress: number; total?: number; message?: string }) => void;
    } = {},
  ) {
    const c = this.requireClient();
    try {
      return await c.callTool({ name, arguments: args }, undefined, {
        signal: opts.signal,
        timeout: this.config.timeouts.requestMs,
        resetTimeoutOnProgress: true,
        onprogress: opts.onProgress
          ? (p) => opts.onProgress!({ progress: p.progress, total: p.total, message: p.message })
          : undefined,
      });
    } catch (e) {
      throw toMcpError(e, "tool");
    }
  }

  async readResource(uri: string, signal?: AbortSignal) {
    try {
      return await this.requireClient().readResource(
        { uri },
        { signal, timeout: this.config.timeouts.requestMs },
      );
    } catch (e) {
      throw toMcpError(e, "protocol");
    }
  }

  async getPrompt(name: string, args: Record<string, string>) {
    try {
      return await this.requireClient().getPrompt(
        { name, arguments: args },
        { timeout: this.config.timeouts.requestMs },
      );
    } catch (e) {
      throw toMcpError(e, "protocol");
    }
  }

  /** Tells the server the roots changed (e.g. a task started in a new worktree). */
  async notifyRootsChanged() {
    try {
      await this.client?.sendRootsListChanged();
    } catch {
      // Older servers may not care.
    }
  }

  /** For OAuth servers: finish an interactive sign-in, then connect. */
  async authorize(): Promise<void> {
    const oauth = this.ctx.oauth;
    if (!oauth || this.config.transport.type !== "http")
      throw new McpError("auth", "This server doesn't use OAuth.");
    oauth.interactive = true;
    try {
      const { transport } = createTransport(this.config, this.ctx);
      const client = new Client({ name: "vard-ai", version: VERSION }, { capabilities: {} });
      try {
        await client.connect(transport);
        await client.close();
      } catch (e) {
        if (toMcpError(e).code !== "auth") throw toMcpError(e);
        const code = await oauth.authorizationCode();
        await (transport as StreamableHTTPClientTransport).finishAuth(code);
      }
    } finally {
      oauth.interactive = false;
    }
    await this.connect();
  }

  private async teardown(transport: Transport, client?: Client) {
    const pid = transport instanceof StdioClientTransport ? transport.pid : null;
    try {
      await (client ? client.close() : transport.close());
    } catch {
      // Already gone.
    }
    if (pid) killTree(pid);
  }

  async close() {
    this.closing = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    const { transport, client } = this;
    this.client = null;
    this.transport = null;
    if (transport) await this.teardown(transport, client ?? undefined);
    if (this.state !== "disconnected") {
      this.log("disconnected");
      this.setState("disconnected");
    }
  }
}

/** Follows `nextCursor` pages (bounded). */
async function collect<K extends string>(
  page: (cursor?: string) => Promise<{ nextCursor?: string } & Record<K, unknown>>,
  key: K,
  maxPages = 20,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SDK list item shapes vary by kind
): Promise<any[]> {
  const out: unknown[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < maxPages; i++) {
    const r = await page(cursor);
    out.push(...((r[key] as unknown[]) ?? []));
    if (!r.nextCursor) break;
    cursor = r.nextCursor;
  }
  return out;
}
