/**
 * Permission decisions for MCP tools, used by Policy.decide (policy.ts). Every server and tool is
 * untrusted: calls ask by default; "always" can be remembered per project and tool, except for
 * tools that declare themselves destructive (asked every time); a user "deny" blocks the tool;
 * path-like arguments must stay inside the project or task worktree. Server annotations are only
 * ever used to be stricter.
 */
import type { Decision } from "../policy";
import type { ToolDef } from "../tools/types";
import { RESOURCES_KEY } from "./resources";
import { pathOutsideSandbox } from "./security";
import type { McpCallInfo, McpPermission } from "./types";

export type McpRules = Record<string, Exclude<McpPermission, "ask">>;

export const permissionKey = (serverId: string, tool: string) => `${serverId}/${tool}`;

/** Server and tool a call targets (resource reads name their server in the input). */
export function callTarget(
  tool: ToolDef,
  input: Record<string, unknown>,
): { serverId: string; tool: string } {
  const m = tool.mcp!;
  if (m.kind === "resource") return { serverId: String(input.server ?? ""), tool: RESOURCES_KEY };
  return { serverId: m.serverId, tool: m.tool };
}

export function callInfo(tool: ToolDef, input: Record<string, unknown>): McpCallInfo {
  const m = tool.mcp!;
  const { serverId } = callTarget(tool, input);
  const access =
    m.kind === "resource"
      ? `Reads the resource ${String(input.uri ?? "")} from the server.`
      : m.destructive
        ? "The server says this tool can make destructive changes. It asks every time."
        : m.readOnly
          ? "The server says this tool only reads data (unverified). It may still send what it reads to the server."
          : "This tool may change data, call external services or have other side effects.";
  return {
    serverId,
    serverName: m.kind === "resource" ? serverId : m.serverName,
    tool: m.kind === "resource" ? "read resource" : m.tool,
    readOnly: m.readOnly,
    destructive: m.destructive,
    access,
  };
}

export function decideMcp(
  tool: ToolDef,
  input: Record<string, unknown>,
  rules: McpRules,
  roots: { workRoot: string; projectRoot: string },
): Decision {
  const info = callInfo(tool, input);
  const outside = pathOutsideSandbox(input, roots);
  if (outside)
    return {
      action: "deny",
      reason: `MCP arguments may not point outside the project: ${outside.slice(0, 200)}`,
      mcp: info,
    };
  const { serverId, tool: name } = callTarget(tool, input);
  const rule = rules[permissionKey(serverId, name)] ?? rules[permissionKey(serverId, "*")];
  if (rule === "deny")
    return {
      action: "deny",
      reason: `You blocked ${name} from ${info.serverName} in this project.`,
      mcp: info,
    };
  if (tool.mcp!.destructive)
    return { action: "ask", reason: "destructive MCP tool: asks every time", mcp: info };
  if (rule === "allow")
    return { action: "allow", reason: "you allowed this MCP tool for this project", mcp: info };
  return { action: "ask", reason: `MCP tool from ${info.serverName}`, mcp: info };
}

/** "Always for this project". Destructive tools can't be always-allowed. Returns whether it was saved. */
export function rememberMcp(
  tool: ToolDef,
  input: Record<string, unknown>,
  rules: McpRules,
): boolean {
  if (tool.mcp!.destructive) return false;
  const { serverId, tool: name } = callTarget(tool, input);
  rules[permissionKey(serverId, name)] = "allow";
  return true;
}
