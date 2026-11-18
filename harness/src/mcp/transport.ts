/**
 * Builds the transport for a server.
 *
 *  stdio: the server gets an explicit environment (a minimal safe set from the SDK, a PATH that
 *         also finds Homebrew/npm/bun tools, plus only the variables configured for it) — never
 *         Vard's own environment. stderr is piped to the server log; stdout carries only MCP.
 *  http:  Streamable HTTP with secret headers from the Keychain, bearer tokens or OAuth, and a
 *         URL that passed validateServerUrl().
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  getDefaultEnvironment,
  StdioClientTransport,
} from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { isInside, realpathLoose } from "../util";
import { McpError } from "./errors";
import type { VardOAuthProvider } from "./oauth";
import { secretAccount, type SecretStore } from "./secrets";
import { validateServerUrl } from "./security";
import type { McpScope, McpServerConfig } from "./types";

export type TransportContext = {
  scope: McpScope;
  projectRoot?: string;
  secrets: SecretStore;
  oauth?: VardOAuthProvider;
};

/** Secret names a server needs, e.g. ["GITHUB_TOKEN", "header:X-Api-Key", "token"]. */
export function requiredSecrets(cfg: McpServerConfig): string[] {
  const t = cfg.transport;
  if (t.type === "stdio")
    return Object.entries(t.env)
      .filter(([, v]) => "secret" in v)
      .map(([k]) => k);
  const names = Object.keys(t.headers).map((h) => `header:${h}`);
  if (t.auth === "bearer") names.push("token");
  return names;
}

/** A PATH that also finds tools installed with Homebrew, npm, bun, cargo or pipx (apps launched from Finder get a bare PATH). */
function searchPath(base: string | undefined): string {
  const home = os.homedir();
  const extra = [
    "/opt/homebrew/bin",
    "/usr/local/bin",
    `${home}/.bun/bin`,
    `${home}/.local/bin`,
    `${home}/.cargo/bin`,
    `${home}/.volta/bin`,
    `${home}/.npm-global/bin`,
  ];
  const parts = (base ?? "/usr/bin:/bin:/usr/sbin:/sbin").split(":");
  for (const e of extra) if (!parts.includes(e) && fs.existsSync(e)) parts.push(e);
  return parts.join(":");
}

export function resolveCwd(cfg: McpServerConfig, ctx: TransportContext): string | undefined {
  if (cfg.transport.type !== "stdio" || !cfg.transport.cwd) return ctx.projectRoot;
  const base = ctx.projectRoot ?? os.homedir();
  const dir = path.resolve(base, cfg.transport.cwd.replace(/^~(?=$|\/)/, os.homedir()));
  if (
    ctx.scope === "project" &&
    ctx.projectRoot &&
    !isInside(realpathLoose(dir), realpathLoose(ctx.projectRoot))
  )
    throw new McpError(
      "config",
      "A project server's working directory must be inside the project.",
    );
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory())
    throw new McpError("config", `Working directory not found: ${dir}`);
  return dir;
}

export function createTransport(
  cfg: McpServerConfig,
  ctx: TransportContext,
): { transport: Transport; secretValues: string[] } {
  const secretValues: string[] = [];
  const secret = (name: string) => {
    const v = ctx.secrets.get(secretAccount(ctx.scope, cfg.id, name, ctx.projectRoot));
    if (v == null || v === "")
      throw new McpError(
        "config",
        `The secret ${name.replace(/^header:/, "header ")} isn't set for ${cfg.name}.`,
      );
    secretValues.push(v);
    return v;
  };

  const t = cfg.transport;
  if (t.type === "stdio") {
    const base = getDefaultEnvironment();
    const env: Record<string, string> = { ...base, PATH: searchPath(base.PATH) };
    for (const [k, v] of Object.entries(t.env)) env[k] = "secret" in v ? secret(k) : v.value;
    const transport = new StdioClientTransport({
      command: t.command,
      args: t.args,
      env,
      cwd: resolveCwd(cfg, ctx),
      stderr: "pipe",
    });
    return { transport, secretValues };
  }

  const url = validateServerUrl(t.url, { allowPrivate: ctx.scope === "global" });
  const headers: Record<string, string> = {};
  for (const h of Object.keys(t.headers)) headers[h] = secret(`header:${h}`);
  if (t.auth === "bearer") headers.Authorization = `Bearer ${secret("token")}`;
  const transport = new StreamableHTTPClientTransport(url, {
    requestInit: { headers },
    ...(t.auth === "oauth" && ctx.oauth ? { authProvider: ctx.oauth } : {}),
  });
  return { transport, secretValues };
}
