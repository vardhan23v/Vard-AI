/**
 * Context engineering: what the model sees.
 *  - buildSystemPrompt(): harness rules + project VARD.md/AGENTS.md + repo map + todo list.
 *  - compactMessages(): when the transcript is over budget, older tool results are replaced
 *    by short summaries while the latest turns stay verbatim.
 */
import fs from "node:fs";
import path from "node:path";
import type { ModelMessage } from "ai";
import { IGNORED_DIRS } from "./tools/fs";
import { renderTodos } from "./tools/todo";
import type { Todo } from "./tools/types";
import { estimateTokens, git, truncateHead } from "./util";

export const HARNESS_RULES = `You are Vard, a careful coding agent working inside the user's project.

Rules:
- Work only inside the project directory. All paths are relative to the project root.
- Read before you edit. Use search/list_dir/read_file to understand the code first.
- Make edits with edit_file (exact, unique old_string) or write_file for new files. Keep changes minimal and focused.
- Use run_command for builds, tests and linters. Some commands need the user's approval; if one is denied, find another way or explain what you need.
- Never try to push, use sudo, or touch files outside the project.
- Keep the todo list current with todo_write for multi-step work.
- When the task is complete, stop calling tools and reply with a short summary of what changed and how you verified it.`;

const PROJECT_DOC_FILES = ["VARD.md", "AGENTS.md", "CLAUDE.md"];
const MAX_PROJECT_DOC = 8_000;

export function readProjectDocs(root: string): string {
  const parts: string[] = [];
  for (const name of PROJECT_DOC_FILES) {
    const p = path.join(root, name);
    try {
      const text = fs.readFileSync(p, "utf8").trim();
      if (text) parts.push(`## ${name}\n${truncateHead(text, MAX_PROJECT_DOC)}`);
    } catch {}
    if (parts.length >= 2) break;
  }
  return parts.join("\n\n");
}

async function listFiles(root: string, limit = 5_000): Promise<string[]> {
  const r = await git(root, ["ls-files", "--cached", "--others", "--exclude-standard"], 15_000).catch(() => null);
  if (r && r.code === 0) return r.stdout.split("\n").filter((f) => f && !f.startsWith(".vard/")).slice(0, limit);
  const out: string[] = [];
  const walk = (dir: string, prefix: string) => {
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (out.length >= limit) return;
      if (e.isDirectory()) {
        if (!IGNORED_DIRS.has(e.name) && !e.name.startsWith(".")) walk(path.join(dir, e.name), `${prefix}${e.name}/`);
      } else out.push(prefix + e.name);
    }
  };
  walk(root, "");
  return out;
}

/** A compact repo map: every file when small, otherwise directories with file counts. */
export async function repoMap(root: string, maxLines = 150): Promise<string> {
  const files = (await listFiles(root)).sort();
  if (!files.length) return "(empty project)";
  if (files.length <= maxLines) return files.join("\n");
  for (const depth of [3, 2, 1]) {
    const counts = new Map<string, number>();
    for (const f of files) {
      const segs = f.split("/");
      const key = segs.length > depth ? segs.slice(0, depth).join("/") + "/" : f;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    if (counts.size <= maxLines || depth === 1) {
      const lines = [...counts].map(([k, n]) => (k.endsWith("/") ? `${k} (${n} files)` : k));
      return `${files.length} files\n` + lines.slice(0, maxLines).join("\n") + (lines.length > maxLines ? "\n…" : "");
    }
  }
  return "";
}

export interface SystemPromptInput {
  workRoot: string;
  todos: Todo[];
  phase?: "plan" | "act";
  extra?: string;
  repoMap?: string;
}

export async function buildSystemPrompt(input: SystemPromptInput): Promise<string> {
  const sections = [HARNESS_RULES];
  if (input.phase === "plan") {
    sections.push(
      `PLANNING PHASE: investigate with the read-only tools, then reply with a concise numbered plan ` +
        `(files to change, approach, how you will verify). Do not edit files or run commands yet. ` +
        `The user will approve the plan before you act.`,
    );
  }
  const docs = readProjectDocs(input.workRoot);
  if (docs) sections.push(`# Project instructions\n${docs}`);
  sections.push(`# Repository map\n${input.repoMap ?? (await repoMap(input.workRoot))}`);
  sections.push(`# Todo list\n${renderTodos(input.todos)}`);
  if (input.extra) sections.push(input.extra);
  return sections.join("\n\n");
}

// ---------- compaction ----------

export const estimateMessagesTokens = (messages: ModelMessage[]) => estimateTokens(JSON.stringify(messages));

export interface CompactOptions {
  /** Target size in (estimated) tokens. */
  budgetTokens: number;
  /** Most recent messages kept verbatim. */
  keepRecent?: number;
  /** Characters of each compacted tool result kept as a preview. */
  previewChars?: number;
}

/**
 * Replace the bodies of older tool results with short previews until the transcript fits.
 * Returns a new array; the input is not mutated. The first user message is always kept.
 */
export function compactMessages(
  messages: ModelMessage[],
  opts: CompactOptions,
): { messages: ModelMessage[]; compacted: number; tokens: number } {
  const keepRecent = opts.keepRecent ?? 6;
  const preview = opts.previewChars ?? 200;
  let tokens = estimateMessagesTokens(messages);
  if (tokens <= opts.budgetTokens) return { messages, compacted: 0, tokens };

  const out = messages.map((m) => m);
  let compacted = 0;
  const cutoff = Math.max(0, out.length - keepRecent);
  for (let i = 0; i < cutoff && tokens > opts.budgetTokens; i++) {
    const m = out[i];
    if (m.role !== "tool" || !Array.isArray(m.content)) continue;
    let changed = false;
    const content = m.content.map((part: any) => {
      if (part.type !== "tool-result") return part;
      const out = part.output;
      const text =
        out?.type === "text" || out?.type === "error-text"
          ? String(out.value)
          : out?.type === "json" || out?.type === "error-json"
            ? JSON.stringify(out.value)
            : "";
      if (text.length <= preview || text.startsWith("[compacted")) return part;
      changed = true;
      compacted++;
      return {
        ...part,
        output: {
          type: "text",
          value: `[compacted ${part.toolName} result: ${text.length} chars omitted; re-run the tool if needed]\n${text.slice(0, preview)}`,
        },
      };
    });
    if (changed) {
      out[i] = { ...m, content } as ModelMessage;
      tokens = estimateMessagesTokens(out);
    }
  }
  return { messages: out, compacted, tokens };
}
