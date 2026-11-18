/**
 * MCP server configuration: global `~/.vard/mcp.json` (or $VARD_HOME) and per project
 * `<project>/.vard/mcp.json`. Versioned, validated, written atomically, and free of secrets
 * (secret values live in the Keychain; see secrets.ts). A project's file only launches servers
 * after the user trusts that exact content (trust is keyed by a hash, so edits ask again).
 */
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ensureVardDir } from "../policy";
import { McpError } from "./errors";
import { McpConfigFile, McpServerConfig, type McpScope, type McpServerInput } from "./types";

export const vardHome = (env: Record<string, string | undefined> = process.env) =>
  env.VARD_HOME || path.join(os.homedir(), ".vard");

export function configPath(scope: McpScope, opts: { home: string; projectRoot?: string }): string {
  if (scope === "global") return path.join(opts.home, "mcp.json");
  if (!opts.projectRoot)
    throw new McpError("config", "A project folder is needed for project servers.");
  return path.join(opts.projectRoot, ".vard", "mcp.json");
}

function readRaw(file: string): string | null {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

export function loadConfig(file: string): McpConfigFile {
  const raw = readRaw(file);
  if (raw === null) return { version: 1, servers: [] };
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new McpError("config", `${file} isn't valid JSON.`);
  }
  // Accept the common `{ "mcpServers": { … } }` shape in place, so hand-written files work.
  if (json && typeof json === "object" && !("version" in json) && "mcpServers" in json) {
    return { version: 1, servers: importServers(json).map((s) => McpServerConfig.parse(s)) };
  }
  const parsed = McpConfigFile.safeParse(json);
  if (!parsed.success)
    throw new McpError(
      "config",
      `${file}: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
    );
  return parsed.data;
}

export function saveConfig(file: string, data: McpConfigFile, opts: { projectRoot?: string } = {}) {
  if (opts.projectRoot) ensureVardDir(opts.projectRoot);
  else fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, JSON.stringify(McpConfigFile.parse(data), null, 2) + "\n", { mode: 0o600 });
  fs.renameSync(tmp, file);
}

/** Adds or replaces a server (by id) and returns the saved config. */
export function upsertServer(
  file: string,
  input: McpServerInput,
  opts: { projectRoot?: string; replaceId?: string } = {},
) {
  const server = McpServerConfig.parse(input);
  const data = loadConfig(file);
  const at = data.servers.findIndex((s) => s.id === (opts.replaceId ?? server.id));
  if (opts.replaceId === undefined && at === -1 && data.servers.some((s) => s.id === server.id))
    throw new McpError("config", `A server with id "${server.id}" already exists.`);
  if (
    opts.replaceId !== undefined &&
    opts.replaceId !== server.id &&
    data.servers.some((s) => s.id === server.id)
  )
    throw new McpError("config", `A server with id "${server.id}" already exists.`);
  if (at === -1) data.servers.push(server);
  else data.servers[at] = server;
  saveConfig(file, data, opts);
  return server;
}

export function removeServer(file: string, id: string, opts: { projectRoot?: string } = {}) {
  const data = loadConfig(file);
  const before = data.servers.length;
  data.servers = data.servers.filter((s) => s.id !== id);
  if (data.servers.length === before) throw new McpError("config", `No server with id "${id}".`);
  saveConfig(file, data, opts);
}

// ---------- trust for project configs ----------

const trustFile = (home: string) => path.join(home, "mcp-trust.json");

function projectHash(projectRoot: string): string | null {
  const raw = readRaw(path.join(projectRoot, ".vard", "mcp.json"));
  return raw === null ? null : crypto.createHash("sha256").update(raw).digest("hex");
}

function readTrust(home: string): Record<string, string> {
  try {
    return JSON.parse(fs.readFileSync(trustFile(home), "utf8"));
  } catch {
    return {};
  }
}

/** True when the user trusted this exact project config (any edit needs trust again). */
export function isTrusted(home: string, projectRoot: string): boolean {
  const h = projectHash(projectRoot);
  return !!h && readTrust(home)[path.resolve(projectRoot)] === h;
}

export function setTrust(home: string, projectRoot: string, trusted: boolean) {
  const all = readTrust(home);
  const key = path.resolve(projectRoot);
  const h = projectHash(projectRoot);
  if (trusted && h) all[key] = h;
  else delete all[key];
  fs.mkdirSync(home, { recursive: true });
  const tmp = `${trustFile(home)}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(all, null, 2) + "\n", { mode: 0o600 });
  fs.renameSync(tmp, trustFile(home));
}

/** Re-trusts after Vard itself edited the project file (the user made that change in Vard). */
export function refreshTrustIfTrusted(home: string, projectRoot: string, wasTrusted: boolean) {
  if (wasTrusted) setTrust(home, projectRoot, true);
}

// ---------- importing other apps' configs ----------

export type ImportedServer = McpServerInput & { secretEnv: Record<string, string> };

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "server";

/**
 * Converts the common `mcpServers` format (Claude Desktop, Cursor, VS Code, Windsurf) into
 * Vard configs. Imported servers start **disabled**; every env value and header is returned
 * separately as a secret so the caller can move it into the Keychain.
 */
export function importServers(json: unknown): ImportedServer[] {
  const root = (json ?? {}) as Record<string, unknown>;
  const map = (root.mcpServers ??
    root.servers ??
    (root.mcp as Record<string, unknown> | undefined)?.servers ??
    {}) as Record<string, unknown>;
  const out: ImportedServer[] = [];
  const used = new Set<string>();
  for (const [name, v] of Object.entries(map)) {
    const s = (v ?? {}) as Record<string, unknown>;
    let id = slug(name);
    for (let n = 2; used.has(id); n++) id = `${slug(name).slice(0, 36)}-${n}`;
    used.add(id);
    const secretEnv: Record<string, string> = {};
    if (typeof s.command === "string") {
      const env: Record<string, { secret: true }> = {};
      for (const [k, val] of Object.entries((s.env ?? {}) as Record<string, unknown>)) {
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(k)) continue;
        env[k] = { secret: true };
        secretEnv[k] = String(val ?? "");
      }
      out.push({
        id,
        name,
        enabled: false,
        transport: {
          type: "stdio",
          command: s.command,
          args: Array.isArray(s.args) ? s.args.map(String) : [],
          env,
          ...(typeof s.cwd === "string" ? { cwd: s.cwd } : {}),
        },
        secretEnv,
      });
    } else if (typeof s.url === "string" || typeof s.serverUrl === "string") {
      const headers: Record<string, { secret: true }> = {};
      for (const [k, val] of Object.entries((s.headers ?? {}) as Record<string, unknown>)) {
        if (!/^[A-Za-z0-9-]+$/.test(k)) continue;
        headers[k] = { secret: true };
        secretEnv[`header:${k}`] = String(val ?? "");
      }
      out.push({
        id,
        name,
        enabled: false,
        transport: { type: "http", url: String(s.url ?? s.serverUrl), headers, auth: "none" },
        secretEnv,
      });
    }
  }
  return out;
}

/** Known config files of other MCP clients on this Mac. */
export function knownImportSources(projectRoot?: string): { label: string; file: string }[] {
  const home = os.homedir();
  const list = [
    {
      label: "Claude Desktop",
      file: path.join(
        home,
        "Library",
        "Application Support",
        "Claude",
        "claude_desktop_config.json",
      ),
    },
    { label: "Cursor", file: path.join(home, ".cursor", "mcp.json") },
    { label: "Windsurf", file: path.join(home, ".codeium", "windsurf", "mcp_config.json") },
  ];
  if (projectRoot) {
    list.push({
      label: "VS Code (this project)",
      file: path.join(projectRoot, ".vscode", "mcp.json"),
    });
    list.push({
      label: "Cursor (this project)",
      file: path.join(projectRoot, ".cursor", "mcp.json"),
    });
    list.push({ label: "Project .mcp.json", file: path.join(projectRoot, ".mcp.json") });
  }
  return list.filter((s) => fs.existsSync(s.file));
}
