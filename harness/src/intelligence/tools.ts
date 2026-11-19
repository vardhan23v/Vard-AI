/**
 * Code intelligence tools for the agent. All read-only (they only query the index, or update it),
 * confined to the project, size-capped, and every result cites file:line.
 */
import path from "node:path";
import { z } from "zod";
import { type ToolDef, ToolError } from "../tools/types";
import { truncateMiddle } from "../util";
import { CodeGraph } from "./graph";
import { analyzeImpact, renderImpact } from "./impact";
import type { CodeIntel } from "./manager";
import { architecture, renderArchitecture } from "./overview";
import { searchCode } from "./search";

const MAX = 12_000;

/** A project-relative path; refuses anything that leaves the project. */
function relPath(p: string): string {
  const n = path.posix.normalize(p.replace(/\\/g, "/").replace(/^\.\//, ""));
  if (path.isAbsolute(n) || n.startsWith("..") || n.includes("\0")) throw new ToolError(`use a path relative to the project: ${p}`);
  return n;
}

function tool<I>(def: Omit<ToolDef<I>, "risk" | "maxOutput" | "truncate">): ToolDef<I> {
  return { ...def, risk: "read", maxOutput: MAX, truncate: (s) => truncateMiddle(s, MAX) } as ToolDef<I>;
}

export function codeTools(intel: CodeIntel): ToolDef[] {
  const ready = (ctx: { projectRoot: string }) => {
    const ix = intel.get(ctx.projectRoot);
    if (!ix.exists()) throw new ToolError(ix.isBuilding ? "The code index is still being built; try again shortly, or use search/read_file." : "No code index yet. Call code_reindex first.");
    return { ix, g: new CodeGraph(ix) };
  };
  const note = (ctx: { projectRoot: string }) => (intel.get(ctx.projectRoot).isBuilding ? "\n(note: the index is updating; very recent edits may be missing)" : "");
  return [
    tool({
      name: "code_search",
      description:
        "Search the codebase by meaning and keywords (e.g. 'where is authentication handled'). Combines keyword, symbol, path and dependency matches. Returns file:line hits with reasons.",
      inputSchema: z.object({ query: z.string().min(2).max(300), limit: z.number().int().min(1).max(30).default(12) }),
      async execute({ query, limit }: { query: string; limit: number }, ctx) {
        const { ix } = ready(ctx);
        const hits = await searchCode(ix, query, { limit, readRoot: ctx.workRoot, embeddings: intel.embeddings(ctx.projectRoot), signal: ctx.signal });
        if (!hits.length) return `No matches for "${query}".`;
        return hits.map((h, i) => `${i + 1}. ${h.path}:${h.line}${h.symbol ? ` ${h.kind ?? ""} ${h.symbol}` : ""} — ${h.reasons.join(", ")}\n${h.snippet}`).join("\n") + note(ctx);
      },
    }),
    tool({
      name: "code_symbol_search",
      description: "Find definitions (functions, classes, types, …) whose name contains the text.",
      inputSchema: z.object({ name: z.string().min(1).max(120), limit: z.number().int().min(1).max(50).default(20) }),
      async execute({ name, limit }: { name: string; limit: number }, ctx) {
        const { g } = ready(ctx);
        const s = g.symbolSearch(name, limit);
        return s.length ? s.map((x) => `${x.path}:${x.line} ${x.kind} ${x.parent ? `${x.parent}.` : ""}${x.name}${x.exported ? " (exported)" : ""}`).join("\n") : `No symbols matching "${name}".`;
      },
    }),
    tool({
      name: "code_get_definition",
      description: "Where a symbol is defined (exact name), with its signature.",
      inputSchema: z.object({ name: z.string().min(1).max(120) }),
      async execute({ name }: { name: string }, ctx) {
        const { g } = ready(ctx);
        const d = g.definitions(name);
        return d.length ? d.map((x) => `${x.path}:${x.line}-${x.endLine} ${x.kind} ${x.name}${x.exported ? " (exported)" : ""}\n  ${x.signature ?? ""}`).join("\n") : `No definition named "${name}".`;
      },
    }),
    tool({
      name: "code_find_references",
      description: "Places that use a symbol (calls and type references), with the enclosing function. Matched by name through imports; best effort for dynamic code.",
      inputSchema: z.object({ name: z.string().min(1).max(120), limit: z.number().int().min(1).max(200).default(60) }),
      async execute({ name, limit }: { name: string; limit: number }, ctx) {
        const { g } = ready(ctx);
        const r = g.references(name, ["call", "type"], limit);
        if (!r.length) return `No references to "${name}" found.`;
        return (r[0].ambiguous ? `(several definitions named "${name}"; matches are by name)\n` : "") + r.map((x) => `${x.path}:${x.line} ${x.kind}${x.in ? ` in ${x.in}` : ""}`).join("\n");
      },
    }),
    tool({
      name: "code_get_callers",
      description: "Functions that call a function (by name; best effort).",
      inputSchema: z.object({ name: z.string().min(1).max(120) }),
      async execute({ name }: { name: string }, ctx) {
        const { g } = ready(ctx);
        const r = g.callers(name, 80);
        return r.length ? r.map((x) => `${x.path}:${x.line}${x.in ? ` ${x.in}` : " (top level)"}`).join("\n") : `No callers of "${name}" found.`;
      },
    }),
    tool({
      name: "code_get_dependencies",
      description: "What a file imports: project files and external packages.",
      inputSchema: z.object({ path: z.string().min(1).max(400) }),
      async execute({ path: p }: { path: string }, ctx) {
        const { g } = ready(ctx);
        const d = g.dependencies(relPath(p));
        return `Imports ${d.files.length} file(s): ${d.files.join(", ") || "none"}\nPackages: ${d.packages.join(", ") || "none"}`;
      },
    }),
    tool({
      name: "code_get_dependents",
      description: "Which files import a file (optionally transitively, up to 3 levels).",
      inputSchema: z.object({ path: z.string().min(1).max(400), depth: z.number().int().min(1).max(3).default(1) }),
      async execute({ path: p, depth }: { path: string; depth: number }, ctx) {
        const { g } = ready(ctx);
        const rel = relPath(p);
        const d = depth === 1 ? g.dependents(rel).map((x) => ({ path: x, depth: 1 })) : g.dependentsDeep([rel], depth);
        return d.length ? d.map((x) => `${x.path}${depth > 1 ? ` [${x.depth}]` : ""}${g.isTest(x.path) ? " (test)" : ""}`).join("\n") : `Nothing imports ${rel}.`;
      },
    }),
    tool({
      name: "code_get_file_outline",
      description: "The structure of a file: its definitions with line ranges.",
      inputSchema: z.object({ path: z.string().min(1).max(400) }),
      async execute({ path: p }: { path: string }, ctx) {
        const { g } = ready(ctx);
        const o = g.outline(relPath(p));
        return o.length ? o.map((x) => `${x.line}-${x.endLine} ${"  ".repeat(x.parent ? 1 : 0)}${x.kind} ${x.name}${x.exported ? " (exported)" : ""}`).join("\n") : `No definitions indexed for ${p}.`;
      },
    }),
    tool({
      name: "code_get_architecture",
      description: "A summary of the project: languages, main folders, entry points, most-imported files and external packages.",
      inputSchema: z.object({}),
      async execute(_i: Record<string, never>, ctx) {
        const { ix } = ready(ctx);
        return renderArchitecture(architecture(ix));
      },
    }),
    tool({
      name: "code_impact_analysis",
      description:
        "Before changing a file or symbol: direct and indirect dependents, references, public API, related tests, config, verification commands and an evidence-based risk level.",
      inputSchema: z.object({ target: z.string().min(1).max(400).describe("A project-relative file path or a symbol name"), depth: z.number().int().min(1).max(5).default(3) }),
      async execute({ target, depth }: { target: string; depth: number }, ctx) {
        const { ix } = ready(ctx);
        if (target.includes("/")) relPath(target);
        return renderImpact(analyzeImpact(ix, target, { depth }));
      },
    }),
    tool({
      name: "code_index_status",
      description: "Whether the code index is ready, how many files and symbols it has, and when it was updated.",
      inputSchema: z.object({}),
      async execute(_i: Record<string, never>, ctx) {
        const s = intel.get(ctx.projectRoot).status();
        return `${s.state}: ${s.files} files, ${s.symbols} symbols, ${s.imports} imports, ${s.failed} failed to parse${s.indexedAt ? `, updated ${new Date(s.indexedAt).toISOString()}` : ""}${s.progress ? `, progress ${s.progress.done}/${s.progress.total}` : ""}`;
      },
    }),
    tool({
      name: "code_reindex",
      description: "Update the code index for changed files (fast when little changed). Only writes the index, never your files.",
      inputSchema: z.object({}),
      async execute(_i: Record<string, never>, ctx) {
        const state = await intel.ensure(ctx.projectRoot, 60_000);
        const s = intel.get(ctx.projectRoot).status();
        return state === "ready" ? `Index up to date: ${s.files} files, ${s.symbols} symbols.` : `Indexing continues in the background (${s.progress?.done ?? 0}/${s.progress?.total ?? "?"}).`;
      },
    }),
  ];
}

export const CODE_TOOL_NAMES = new Set(codeTools({} as CodeIntel).map((t) => t.name));
