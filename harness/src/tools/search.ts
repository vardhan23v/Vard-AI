import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { run, truncateHead } from "../util";
import { IGNORED_DIRS } from "./fs";
import { type ToolDef, ToolError, rel, resolveIn } from "./types";

const MAX_MATCHES = 200;

type SearchInput = { pattern: string; path?: string; glob?: string; ignoreCase?: boolean };

export const search: ToolDef<SearchInput> = {
  name: "search",
  description:
    "Search file contents with a regular expression (ripgrep syntax). Returns path:line:text matches. " +
    "Optionally restrict to a sub-path or a glob like '*.ts'.",
  inputSchema: z.object({
    pattern: z.string().min(1).describe("Regular expression"),
    path: z.string().default(".").describe("Directory or file to search"),
    glob: z.string().optional().describe("Only search files matching this glob, e.g. '*.ts'"),
    ignoreCase: z.boolean().optional(),
  }),
  risk: "read",
  pathFields: ["path"],
  maxOutput: 30_000,
  truncate(s) {
    return truncateHead(s, this.maxOutput);
  },
  async execute(input, ctx) {
    const abs = resolveIn(ctx, input.path ?? ".");
    const rg = Bun.which("rg");
    const lines = rg ? await ripgrep(rg, abs, input, ctx.signal) : await jsSearch(abs, input);
    const shown = lines.slice(0, MAX_MATCHES).map((l) => {
      // make paths relative to the work root
      const m = /^(.*?):(\d+):(.*)$/.exec(l);
      return m ? `${rel(ctx, path.resolve(abs, m[1]))}:${m[2]}:${m[3].slice(0, 300)}` : l;
    });
    if (!shown.length) return "no matches";
    const more = lines.length > MAX_MATCHES ? `\n…(${lines.length - MAX_MATCHES} more matches)` : "";
    return shown.join("\n") + more;
  },
};

async function ripgrep(rg: string, abs: string, input: SearchInput, signal?: AbortSignal): Promise<string[]> {
  const args = [rg, "--line-number", "--no-heading", "--color", "never", "--max-columns", "400"];
  if (input.ignoreCase) args.push("-i");
  if (input.glob) args.push("--glob", input.glob);
  args.push("--glob", "!.vard/", "-e", input.pattern, "--", ".");
  const stat = await fs.stat(abs);
  const cwd = stat.isDirectory() ? abs : path.dirname(abs);
  if (!stat.isDirectory()) args[args.length - 1] = path.basename(abs);
  const r = await run(args, { cwd, timeoutMs: 30_000, signal });
  if (r.code === 1) return [];
  if (r.code !== 0) throw new ToolError(`ripgrep failed: ${r.stderr.trim()}`);
  return r.stdout.split("\n").filter(Boolean).map((l) => l.replace(/^\.\//, ""));
}

function globToRegex(glob: string): RegExp {
  const re = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "\u0000")
    .replace(/\*/g, "[^/]*")
    .replace(/\?/g, "[^/]")
    .replace(/\u0000/g, ".*");
  return new RegExp(glob.includes("/") ? `^${re}$` : `(^|/)${re}$`);
}

/** Fallback when ripgrep is not installed. */
async function jsSearch(abs: string, input: SearchInput): Promise<string[]> {
  let re: RegExp;
  try {
    re = new RegExp(input.pattern, input.ignoreCase ? "i" : "");
  } catch (e) {
    throw new ToolError(`invalid regex: ${(e as Error).message}`);
  }
  const globRe = input.glob ? globToRegex(input.glob) : null;
  const stat = await fs.stat(abs);
  const base = stat.isDirectory() ? abs : path.dirname(abs);
  const files: string[] = [];
  const walk = async (dir: string) => {
    for (const e of await fs.readdir(dir, { withFileTypes: true })) {
      if (files.length > 20_000) return;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (!IGNORED_DIRS.has(e.name)) await walk(p);
      } else if (e.isFile()) files.push(p);
    }
  };
  if (stat.isDirectory()) await walk(abs);
  else files.push(abs);
  const out: string[] = [];
  for (const f of files) {
    const relp = path.relative(base, f);
    if (globRe && !globRe.test(relp)) continue;
    const buf = await fs.readFile(f).catch(() => null);
    if (!buf || buf.length > 2_000_000 || buf.subarray(0, 8000).includes(0)) continue;
    const lines = buf.toString("utf8").split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (re.test(lines[i])) {
        out.push(`${relp}:${i + 1}:${lines[i]}`);
        if (out.length > MAX_MATCHES * 5) return out;
      }
    }
  }
  return out;
}

export { jsSearch as _jsSearch };
