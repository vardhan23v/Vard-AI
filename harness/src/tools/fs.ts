import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { truncateHead, truncateMiddle } from "../util";
import { type ToolDef, ToolError, rel, resolveIn } from "./types";

const IGNORED_DIRS = new Set([".git", "node_modules", ".vard", "dist", "target", ".next", ".turbo"]);

export const readFile: ToolDef<{ path: string; offset?: number; limit?: number }> = {
  name: "read_file",
  description:
    "Read a text file. Returns lines prefixed with line numbers. Use offset/limit (1-based line numbers) for large files.",
  inputSchema: z.object({
    path: z.string().describe("File path, relative to the project root"),
    offset: z.number().int().positive().optional().describe("First line to return (1-based)"),
    limit: z.number().int().positive().max(5000).optional().describe("Max lines to return (default 2000)"),
  }),
  risk: "read",
  pathFields: ["path"],
  maxOutput: 60_000,
  truncate(s) {
    return truncateHead(s, this.maxOutput);
  },
  async execute({ path: p, offset = 1, limit = 2000 }, ctx) {
    const abs = resolveIn(ctx, p);
    const stat = await fs.stat(abs).catch(() => null);
    if (!stat) throw new ToolError(`file not found: ${p}`);
    if (stat.isDirectory()) throw new ToolError(`${p} is a directory; use list_dir`);
    const buf = await fs.readFile(abs);
    if (buf.subarray(0, 8000).includes(0)) throw new ToolError(`${p} looks like a binary file`);
    const lines = buf.toString("utf8").split("\n");
    const slice = lines.slice(offset - 1, offset - 1 + limit);
    const width = String(offset + slice.length).length;
    const body = slice.map((l, i) => `${String(offset + i).padStart(width)}\t${l}`).join("\n");
    const more = offset - 1 + limit < lines.length ? `\n…(${lines.length} lines total; use offset to read more)` : "";
    return body + more;
  },
};

export const listDir: ToolDef<{ path?: string; depth?: number }> = {
  name: "list_dir",
  description: "List a directory. Directories end with '/'. Skips .git, node_modules and build output.",
  inputSchema: z.object({
    path: z.string().default(".").describe("Directory path, relative to the project root"),
    depth: z.number().int().min(1).max(4).default(1).describe("How many levels to descend (1-4)"),
  }),
  risk: "read",
  pathFields: ["path"],
  maxOutput: 20_000,
  truncate(s) {
    return truncateHead(s, this.maxOutput);
  },
  async execute({ path: p = ".", depth = 1 }, ctx) {
    const abs = resolveIn(ctx, p);
    const stat = await fs.stat(abs).catch(() => null);
    if (!stat?.isDirectory()) throw new ToolError(`not a directory: ${p}`);
    const out: string[] = [];
    const walk = async (dir: string, level: number, indent: string) => {
      const entries = (await fs.readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
      for (const e of entries) {
        if (out.length > 2000) return;
        if (e.isDirectory()) {
          out.push(`${indent}${e.name}/`);
          if (level < depth && !IGNORED_DIRS.has(e.name)) await walk(path.join(dir, e.name), level + 1, indent + "  ");
        } else {
          out.push(`${indent}${e.name}`);
        }
      }
    };
    await walk(abs, 1, "");
    return out.length ? out.join("\n") : "(empty directory)";
  },
};

export const writeFile: ToolDef<{ path: string; content: string }> = {
  name: "write_file",
  description: "Create or overwrite a file with the given content. Prefer edit_file for changes to existing files.",
  inputSchema: z.object({
    path: z.string().describe("File path, relative to the project root"),
    content: z.string().describe("Full file content"),
  }),
  risk: "write",
  pathFields: ["path"],
  maxOutput: 2_000,
  truncate(s) {
    return truncateMiddle(s, this.maxOutput);
  },
  async execute({ path: p, content }, ctx) {
    const abs = resolveIn(ctx, p);
    const existed = await fs.stat(abs).then(() => true, () => false);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, content);
    return `${existed ? "overwrote" : "created"} ${rel(ctx, abs)} (${content.split("\n").length} lines)`;
  },
};

export const editFile: ToolDef<{ path: string; old_string: string; new_string: string }> = {
  name: "edit_file",
  description:
    "Replace exactly one occurrence of old_string with new_string in a file. old_string must match the file exactly " +
    "(including whitespace) and must be unique; include surrounding lines to make it unique.",
  inputSchema: z.object({
    path: z.string().describe("File path, relative to the project root"),
    old_string: z.string().min(1).describe("Exact text to replace; must occur exactly once"),
    new_string: z.string().describe("Replacement text"),
  }),
  risk: "write",
  pathFields: ["path"],
  maxOutput: 2_000,
  truncate(s) {
    return truncateMiddle(s, this.maxOutput);
  },
  async execute({ path: p, old_string, new_string }, ctx) {
    const abs = resolveIn(ctx, p);
    const text = await fs.readFile(abs, "utf8").catch(() => {
      throw new ToolError(`file not found: ${p}`);
    });
    if (old_string === new_string) throw new ToolError("old_string and new_string are identical");
    const first = text.indexOf(old_string);
    if (first === -1) throw new ToolError(`old_string not found in ${p}`);
    let count = 0;
    for (let i = first; i !== -1; i = text.indexOf(old_string, i + 1)) count++;
    if (count > 1)
      throw new ToolError(`old_string occurs ${count} times in ${p}; include more surrounding context to make it unique`);
    const next = text.slice(0, first) + new_string + text.slice(first + old_string.length);
    await fs.writeFile(abs, next);
    const line = text.slice(0, first).split("\n").length;
    return `edited ${rel(ctx, abs)} at line ${line}`;
  },
};

export { IGNORED_DIRS };
