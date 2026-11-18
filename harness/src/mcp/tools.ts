/**
 * MCP tools as Vard tools. Each becomes a ToolDef in the agent's existing registry, so it goes
 * through the same validate → policy → approval → execute path as Vard's own tools.
 *
 *  - Name: mcp__<server>__<tool> (sanitized, ≤ 64 chars, unique); the original name and JSON
 *    Schema are kept and sent to the model unchanged.
 *  - Arguments are validated against the server's schema (ajv) before anything is sent.
 *  - Descriptions are untrusted: cleaned, capped, and labelled with the server.
 *  - Results (text, structured, images, resources, errors) are normalized into one bounded text,
 *    wrapped as untrusted data.
 */
import { AjvJsonSchemaValidator } from "@modelcontextprotocol/sdk/validation/ajv";
import type { ToolDef } from "../tools/types";
import { truncateMiddle } from "../util";
import type { McpConnection, RawTool } from "./client";
import { toMcpError } from "./errors";
import { cleanText, wrapUntrusted } from "./security";
import type { McpScope, McpToolInfo } from "./types";

const MAX_RAW_OUTPUT = 16_000;
const MAX_OUTPUT = 12_000;
const validator = new AjvJsonSchemaValidator();

const sanitize = (s: string) => s.replace(/[^A-Za-z0-9_-]+/g, "_").replace(/_+/g, "_");

/** The agent-facing name for a server's tool. */
export function qualifiedName(serverId: string, tool: string): string {
  const base = `mcp__${sanitize(serverId)}__${sanitize(tool)}`;
  return base.length <= 64 ? base : `${base.slice(0, 55)}_${hash(base)}`;
}

function hash(s: string) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h.toString(36).slice(0, 8);
}

export const isReadOnly = (t: RawTool) => t.annotations?.readOnlyHint === true;
/** Per the MCP spec, a non-read-only tool may be destructive unless it says otherwise; Vard only relaxes "always" when it explicitly says it isn't. */
export const isDestructive = (t: RawTool) =>
  !isReadOnly(t) && t.annotations?.destructiveHint === true;

export function toolInfo(serverId: string, t: RawTool, disabled: string[]): McpToolInfo {
  return {
    name: t.name,
    qualifiedName: qualifiedName(serverId, t.name),
    description: cleanText(t.description ?? "", 1200),
    inputSchema: t.inputSchema,
    annotations: t.annotations,
    enabled: !disabled.includes(t.name),
  };
}

/** Normalizes a CallTool result into text for the model. */
export function normalizeResult(result: Record<string, unknown>): { ok: boolean; text: string } {
  const parts: string[] = [];
  const content = Array.isArray(result.content)
    ? (result.content as Record<string, unknown>[])
    : [];
  for (const c of content) {
    switch (c.type) {
      case "text":
        parts.push(String(c.text ?? ""));
        break;
      case "image":
      case "audio":
        parts.push(
          `[${c.type}: ${String(c.mimeType ?? "unknown type")}, ${String(c.data ?? "").length} base64 chars omitted]`,
        );
        break;
      case "resource": {
        const r = (c.resource ?? {}) as Record<string, unknown>;
        parts.push(
          `[resource ${String(r.uri ?? "")}]\n${typeof r.text === "string" ? r.text : `(${String(r.mimeType ?? "binary")} content omitted)`}`,
        );
        break;
      }
      case "resource_link":
        parts.push(
          `[resource link: ${String(c.uri ?? "")}${c.name ? ` (${String(c.name)})` : ""}]`,
        );
        break;
      default:
        parts.push(`[${String(c.type)} content]`);
    }
  }
  if (result.structuredContent !== undefined)
    parts.push(`structured: ${JSON.stringify(result.structuredContent)}`);
  if (!content.length && "toolResult" in result) parts.push(JSON.stringify(result.toolResult));
  const text = parts.join("\n").trim() || "(no output)";
  return { ok: result.isError !== true, text: truncateMiddle(text, MAX_RAW_OUTPUT) };
}

/** Validates arguments with the server's JSON Schema, exposed in the zod-like shape the loop uses. */
function schemaValidator(schema: Record<string, unknown>) {
  let check: ((v: unknown) => { valid: boolean; errorMessage?: string; data?: unknown }) | null =
    null;
  try {
    check = validator.getValidator(schema as never);
  } catch {
    check = null;
  }
  return {
    safeParse(v: unknown) {
      const value = v ?? {};
      if (typeof value !== "object" || Array.isArray(value))
        return {
          success: false,
          error: { issues: [{ path: [], message: "arguments must be an object" }] },
        };
      if (!check) return { success: true, data: value };
      const r = check(value);
      return r.valid
        ? { success: true, data: value }
        : {
            success: false,
            error: { issues: [{ path: [], message: r.errorMessage ?? "invalid arguments" }] },
          };
    },
  };
}

export function toToolDefs(
  conn: McpConnection,
  scope: McpScope,
  taken: Set<string>,
  onProgress?: (tool: string, p: { progress: number; total?: number; message?: string }) => void,
): ToolDef[] {
  const cfg = conn.config;
  const defs: ToolDef[] = [];
  for (const t of conn.tools) {
    if (cfg.disabledTools.includes(t.name)) continue;
    if (!t.name || t.name.length > 200) continue;
    let name = qualifiedName(cfg.id, t.name);
    for (let n = 2; taken.has(name); n++)
      name = `${qualifiedName(cfg.id, t.name).slice(0, 60)}_${n}`;
    taken.add(name);
    const schema =
      t.inputSchema && typeof t.inputSchema === "object" ? t.inputSchema : { type: "object" };
    const desc = cleanText(t.description ?? "", 1000);
    defs.push({
      name,
      description: `[MCP server "${cleanText(cfg.name, 60)}", tool "${cleanText(t.name, 80)}". Description from the server, unverified:] ${desc || "(no description)"}`,
      inputSchema: schemaValidator(schema) as unknown as ToolDef["inputSchema"],
      jsonSchema: { type: "object", ...schema },
      risk: "mcp",
      maxOutput: MAX_OUTPUT,
      truncate: (s) => truncateMiddle(s, MAX_OUTPUT),
      mcp: {
        serverId: cfg.id,
        serverName: cfg.name,
        tool: t.name,
        scope,
        readOnly: isReadOnly(t),
        destructive: isDestructive(t),
        kind: "tool",
      },
      async execute(input, ctx) {
        try {
          const r = await conn.callTool(t.name, input as Record<string, unknown>, {
            signal: ctx.signal,
            onProgress: onProgress ? (p) => onProgress(name, p) : undefined,
          });
          const { ok, text } = normalizeResult(r as Record<string, unknown>);
          const wrapped = wrapUntrusted(cfg.name, t.name, text);
          return ok ? wrapped : `MCP tool reported an error:\n${wrapped}`;
        } catch (e) {
          return `MCP call failed: ${toMcpError(e, "tool").message}`;
        }
      },
    });
  }
  return defs;
}
