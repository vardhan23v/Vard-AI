import path from "node:path";
import type { z } from "zod";
import { isInside, realpathLoose } from "../util";

/**
 * read: no side effects. write: changes files. exec: runs arbitrary processes.
 * mcp: a tool from an external MCP server (untrusted; permission is decided per server/tool).
 */
export type Risk = "read" | "write" | "exec" | "mcp" | "browser";

/** Where an MCP tool comes from, and what its (unverified) annotations claim. */
export interface McpToolMeta {
  serverId: string;
  serverName: string;
  /** The server's own tool name. */
  tool: string;
  scope: "global" | "project";
  readOnly: boolean;
  destructive: boolean;
  /** "tool" for server tools; "resource" for Vard's resource helpers. */
  kind: "tool" | "resource";
}

export interface Todo {
  id: string;
  content: string;
  status: "pending" | "in_progress" | "completed";
}

export interface ToolContext {
  /** Directory the agent works in (the task worktree, or the project root). Relative paths resolve here. */
  workRoot: string;
  /** The user's project root. */
  projectRoot: string;
  todos: Todo[];
  setTodos(todos: Todo[]): void;
  signal?: AbortSignal;
  /** The loop's task id ("<task>.<agent>" for team agents): keys per-agent state such as browser sessions. */
  taskId?: string;
}

export interface ToolDef<I = any> {
  name: string;
  description: string;
  inputSchema: z.ZodType<I>;
  risk: Risk;
  /** Input fields holding filesystem paths, checked by the policy. */
  pathFields?: string[];
  /** Max characters of output handed back to the model. */
  maxOutput: number;
  /** Shapes the raw output to fit maxOutput. */
  truncate(output: string): string;
  execute(input: I, ctx: ToolContext): Promise<string | ToolOutput>;
  /** JSON Schema sent to the model as-is (MCP tools); otherwise derived from inputSchema. */
  jsonSchema?: Record<string, unknown>;
  /** Set for MCP tools. */
  mcp?: McpToolMeta;
  /**
   * Every call asks the user, even when the risk class or an earlier "always" would allow it
   * (skill scripts). "Always for this project" is refused for such tools.
   */
  alwaysAsk?: string;
  /** Set for browser tools: which kind of action (the policy checks URLs and sensitive actions). */
  browser?: { action: string };
}

/** A tool result with images (screenshots). Models that can't see images get the text only. */
export interface ToolOutput {
  text: string;
  images?: { path: string; mediaType: string }[];
}

export class ToolError extends Error {}

/** The text of a tool result (rich results carry images too). */
export const textOf = (o: string | ToolOutput): string => (typeof o === "string" ? o : o.text);

/** Resolve `p` against the work root, refusing anything that lands outside root/project. */
export function resolveIn(ctx: ToolContext, p: string): string {
  const abs = realpathLoose(path.resolve(ctx.workRoot, p));
  const roots = [realpathLoose(ctx.workRoot), realpathLoose(ctx.projectRoot)];
  if (!roots.some((r) => isInside(abs, r))) throw new ToolError(`path escapes the project: ${p}`);
  return abs;
}

export function rel(ctx: ToolContext, abs: string): string {
  return path.relative(realpathLoose(ctx.workRoot), abs) || ".";
}
