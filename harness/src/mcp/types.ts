/**
 * MCP data shapes shared by the harness and the desktop app (through protocol.ts).
 * No Node or Bun imports here: the WebView type-checks against this file.
 */
import { z } from "zod";

const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/;
const HEADER_NAME = /^[A-Za-z0-9-]{1,100}$/;

/** A literal value, or a secret kept in the macOS Keychain (never in the config file). */
export const McpEnvValue = z.union([
  z.object({ value: z.string().max(4000) }),
  z.object({ secret: z.literal(true) }),
]);

export const McpStdioTransport = z.object({
  type: z.literal("stdio"),
  command: z.string().min(1).max(500),
  args: z.array(z.string().max(2000)).max(100).default([]),
  /** Working directory; relative paths resolve against the project. */
  cwd: z.string().max(1000).optional(),
  /** Only these variables (plus a minimal safe set like PATH and HOME) reach the server. */
  env: z.record(z.string().regex(ENV_NAME), McpEnvValue).default({}),
});

export const McpHttpTransport = z.object({
  type: z.literal("http"),
  url: z.string().url().max(2000),
  /** Extra request headers; values live in the Keychain. */
  headers: z
    .record(z.string().regex(HEADER_NAME), z.object({ secret: z.literal(true) }))
    .default({}),
  /** "bearer": Authorization header from the Keychain secret "token". "oauth": MCP authorization flow. */
  auth: z.enum(["none", "bearer", "oauth"]).default("none"),
});

export const McpServerConfig = z.object({
  id: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]{0,39}$/, "use lowercase letters, digits and dashes (max 40)"),
  name: z.string().min(1).max(80),
  description: z.string().max(500).optional(),
  transport: z.discriminatedUnion("type", [McpStdioTransport, McpHttpTransport]),
  enabled: z.boolean().default(true),
  timeouts: z
    .object({
      startupMs: z.number().int().min(1000).max(120_000).default(20_000),
      requestMs: z.number().int().min(1000).max(600_000).default(60_000),
    })
    .default({ startupMs: 20_000, requestMs: 60_000 }),
  /** Original tool names the user switched off; they are never offered to the agent. */
  disabledTools: z.array(z.string().max(200)).max(500).default([]),
});
export type McpServerConfig = z.infer<typeof McpServerConfig>;
export type McpServerInput = z.input<typeof McpServerConfig>;

export const McpConfigFile = z.object({
  version: z.literal(1),
  servers: z.array(McpServerConfig).max(100).default([]),
});
export type McpConfigFile = z.infer<typeof McpConfigFile>;

export const McpScope = z.enum(["global", "project"]);
export type McpScope = z.infer<typeof McpScope>;

export const McpState = z.enum([
  "disconnected",
  "connecting",
  "connected",
  "error",
  "needs_trust",
  "needs_auth",
  "disabled",
]);
export type McpState = z.infer<typeof McpState>;

export const McpToolAnnotations = z.object({
  title: z.string().optional(),
  readOnlyHint: z.boolean().optional(),
  destructiveHint: z.boolean().optional(),
  idempotentHint: z.boolean().optional(),
  openWorldHint: z.boolean().optional(),
});
export type McpToolAnnotations = z.infer<typeof McpToolAnnotations>;

export const McpToolInfo = z.object({
  /** The server's own tool name. */
  name: z.string(),
  /** The name the agent sees: mcp__<server>__<tool>. */
  qualifiedName: z.string(),
  description: z.string(),
  inputSchema: z.unknown(),
  annotations: McpToolAnnotations.optional(),
  enabled: z.boolean(),
});
export type McpToolInfo = z.infer<typeof McpToolInfo>;

export const McpResourceInfo = z.object({
  uri: z.string(),
  name: z.string(),
  description: z.string().optional(),
  mimeType: z.string().optional(),
  /** A URI template (RFC 6570) rather than a concrete resource. */
  template: z.boolean().optional(),
});
export type McpResourceInfo = z.infer<typeof McpResourceInfo>;

export const McpPromptInfo = z.object({
  name: z.string(),
  description: z.string().optional(),
  arguments: z
    .array(
      z.object({
        name: z.string(),
        description: z.string().optional(),
        required: z.boolean().optional(),
      }),
    )
    .default([]),
});
export type McpPromptInfo = z.infer<typeof McpPromptInfo>;

export const McpServerStatus = z.object({
  /** Unique in a listing: "<scope>:<id>". */
  key: z.string(),
  id: z.string(),
  scope: McpScope,
  name: z.string(),
  description: z.string().optional(),
  transport: z.enum(["stdio", "http"]),
  /** The command line or URL host, for display. Never contains secrets. */
  target: z.string(),
  enabled: z.boolean(),
  state: McpState,
  error: z.string().optional(),
  toolCount: z.number(),
  resourceCount: z.number(),
  promptCount: z.number(),
  lastConnectedAt: z.string().optional(),
  serverInfo: z.object({ name: z.string(), version: z.string() }).optional(),
  protocolVersion: z.string().optional(),
  capabilities: z.array(z.string()).default([]),
  /** Which secrets this server needs and whether each is stored. Values never leave the agent. */
  secrets: z.array(z.object({ name: z.string(), set: z.boolean() })).default([]),
  config: McpServerConfig,
});
export type McpServerStatus = z.infer<typeof McpServerStatus>;

export const McpPermission = z.enum(["allow", "ask", "deny"]);
export type McpPermission = z.infer<typeof McpPermission>;

/** Details shown with an approval for an MCP tool (all of it untrusted server-supplied metadata). */
export const McpCallInfo = z.object({
  serverId: z.string(),
  serverName: z.string(),
  tool: z.string(),
  readOnly: z.boolean(),
  destructive: z.boolean(),
  /** Plain-language summary of what the call can do. */
  access: z.string(),
});
export type McpCallInfo = z.infer<typeof McpCallInfo>;
