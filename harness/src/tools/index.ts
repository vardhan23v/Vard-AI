import { tool, type ToolSet } from "ai";
import { runCommand } from "./command";
import { editFile, listDir, readFile, writeFile } from "./fs";
import { gitDiff, gitStatus } from "./git";
import { search } from "./search";
import { todoWrite } from "./todo";
import type { ToolDef } from "./types";

export * from "./types";
export { renderTodos } from "./todo";

export const ALL_TOOLS: ToolDef[] = [
  readFile,
  listDir,
  search,
  editFile,
  writeFile,
  runCommand,
  gitStatus,
  gitDiff,
  todoWrite,
];

export const toolByName = (tools: ToolDef[], name: string) => tools.find((t) => t.name === name);

/**
 * Expose tools to the AI SDK *without* `execute`: the SDK returns the tool calls and the
 * harness loop runs them itself, so every call passes through policy, approval and tracing.
 */
export function toSdkTools(tools: ToolDef[]): ToolSet {
  const set: ToolSet = {};
  for (const t of tools) set[t.name] = tool({ description: t.description, inputSchema: t.inputSchema as any });
  return set;
}
