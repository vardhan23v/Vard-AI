/**
 * Project memory: what Vard remembers about a project between tasks.
 *
 * Stored as plain Markdown in `<project>/.vard/memory.md` (the main checkout, never a task's
 * worktree; `.vard/` is git-ignored, so it stays on this Mac). Four fixed sections hold dated
 * bullets; anything else the user writes is kept as-is.
 *
 *  - scanProject(): a deterministic "Project overview" (stack, commands, folders). No model call.
 *  - recall():      the overview plus the entries most related to the task, within a budget.
 *  - Reflection:    after a successful task the loop asks the model for a few durable facts
 *                   (reflectPrompt / parseProposals). They are only proposals: nothing is saved
 *                   until the user approves them (MemoryStore.add).
 */
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { ensureVardDir } from "./policy";

export const SECTIONS = [
  { id: "overview", title: "Project overview" },
  { id: "conventions", title: "Conventions" },
  { id: "decisions", title: "Decisions" },
  { id: "issues", title: "Known issues and fixes" },
] as const;
export type SectionId = (typeof SECTIONS)[number]["id"];
export const SectionId = z.enum(["overview", "conventions", "decisions", "issues"]);

export type MemoryItem = { section: SectionId; text: string };
export type MemoryEntry = MemoryItem & { date?: string };

const HEADER = `# Project memory

<!-- Written by Vard AI and by you. Vard reads this before every task in this project.
     Edit or delete anything. Keep entries short; one fact per bullet. -->
`;

type Block = { title: string | null; lines: string[] };

const titleToId = (title: string) => SECTIONS.find((s) => s.title.toLowerCase() === title.trim().toLowerCase())?.id;
const today = () => new Date().toISOString().slice(0, 10);

/** Splits the document into blocks at `## ` headings. The first block is the preamble. */
function parseBlocks(text: string): Block[] {
  const blocks: Block[] = [{ title: null, lines: [] }];
  for (const line of text.replace(/\r/g, "").split("\n")) {
    const h = line.match(/^##\s+(.+?)\s*$/);
    if (h) blocks.push({ title: h[1], lines: [] });
    else blocks.at(-1)!.lines.push(line);
  }
  return blocks;
}

function serialize(blocks: Block[]): string {
  const out: string[] = [];
  for (const b of blocks) {
    if (b.title !== null) out.push(`## ${b.title}`);
    const lines = [...b.lines];
    while (lines.length && !lines.at(-1)!.trim()) lines.pop();
    if (b.title !== null) while (lines.length && !lines[0].trim()) lines.shift();
    out.push(...lines, "");
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

/** Bullets of a block, with continuation lines joined. */
function bullets(lines: string[]): string[] {
  const out: string[] = [];
  for (const l of lines) {
    if (/^\s*[-*]\s+/.test(l)) out.push(l.replace(/^\s*[-*]\s+/, "").trim());
    else if (out.length && /^\s{2,}\S/.test(l)) out[out.length - 1] += " " + l.trim();
  }
  return out;
}

const DATE_RE = /\s*\((\d{4}-\d{2}-\d{2})\)\s*$/;

/** Lowercased words without dates or punctuation, for comparing entries. */
export function normalize(text: string): string[] {
  return text
    .replace(DATE_RE, "")
    .toLowerCase()
    .replace(/[`*_"'.,:;!?()[\]{}]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1);
}

function similar(a: string, b: string): boolean {
  const A = new Set(normalize(a));
  const B = new Set(normalize(b));
  if (!A.size || !B.size) return false;
  let both = 0;
  for (const w of A) if (B.has(w)) both++;
  return both / Math.min(A.size, B.size) >= 0.8;
}

export class MemoryStore {
  constructor(readonly projectRoot: string) {}

  get path() {
    return path.join(this.projectRoot, ".vard", "memory.md");
  }

  exists() {
    return fs.existsSync(this.path);
  }

  read(): string {
    try {
      return fs.readFileSync(this.path, "utf8");
    } catch {
      return "";
    }
  }

  write(text: string) {
    ensureVardDir(this.projectRoot);
    const tmp = `${this.path}.tmp-${process.pid}`;
    fs.writeFileSync(tmp, text.endsWith("\n") ? text : text + "\n");
    fs.renameSync(tmp, this.path);
  }

  entries(): MemoryEntry[] {
    const out: MemoryEntry[] = [];
    for (const b of parseBlocks(this.read())) {
      const id = b.title ? titleToId(b.title) : undefined;
      if (!id) continue;
      for (const text of bullets(b.lines)) out.push({ section: id, text: text.replace(DATE_RE, ""), date: text.match(DATE_RE)?.[1] });
    }
    return out;
  }

  /** Adds bullets to their sections, skipping ones that repeat an existing entry. Returns what was added. */
  add(items: MemoryItem[]): MemoryItem[] {
    const existing = this.entries();
    const blocks = parseBlocks(this.read() || HEADER);
    const added: MemoryItem[] = [];
    for (const item of items) {
      const text = item.text.replace(/\s+/g, " ").trim();
      if (!text) continue;
      if ([...existing, ...added].some((e) => similar(e.text, text))) continue;
      let block = blocks.find((b) => b.title && titleToId(b.title) === item.section);
      if (!block) {
        block = { title: SECTIONS.find((s) => s.id === item.section)!.title, lines: [] };
        // Keep the canonical order of the known sections.
        const order = SECTIONS.findIndex((s) => s.id === item.section);
        let after = -1;
        blocks.forEach((b, i) => {
          const id = b.title ? titleToId(b.title) : undefined;
          if (id !== undefined && SECTIONS.findIndex((s) => s.id === id) < order) after = i;
        });
        blocks.splice(after === -1 ? 1 : after + 1, 0, block);
      }
      while (block.lines.length && !block.lines.at(-1)!.trim()) block.lines.pop();
      block.lines.push(`- ${text} (${today()})`);
      added.push({ section: item.section, text });
    }
    if (added.length) this.write(serialize(blocks));
    return added;
  }

  /** Replaces the Project overview with a fresh scan; everything else is kept. */
  rebuildOverview(scan = scanProject(this.projectRoot)) {
    const blocks = parseBlocks(this.read() || HEADER);
    const lines = scan.map((s) => `- ${s}`);
    const block = blocks.find((b) => b.title && titleToId(b.title) === "overview");
    if (block) block.lines = lines;
    else blocks.splice(1, 0, { title: "Project overview", lines });
    this.write(serialize(blocks));
  }

  /** Adds a scanned Project overview the first time it's needed (a new file, or none yet). */
  ensure() {
    if (!this.exists() || !this.entries().some((e) => e.section === "overview")) this.rebuildOverview();
  }

  clear() {
    try {
      fs.rmSync(this.path);
    } catch {}
  }
}

// ---------- scanner ----------

function readJson(file: string): any {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function readText(file: string): string {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

const FRAMEWORKS: [string, string][] = [
  ["next", "Next.js"],
  ["react", "React"],
  ["vue", "Vue"],
  ["svelte", "Svelte"],
  ["@angular/core", "Angular"],
  ["solid-js", "Solid"],
  ["astro", "Astro"],
  ["vite", "Vite"],
  ["@tanstack/react-router", "TanStack Router"],
  ["tailwindcss", "Tailwind CSS"],
  ["express", "Express"],
  ["hono", "Hono"],
  ["fastify", "Fastify"],
  ["@tauri-apps/api", "Tauri"],
  ["electron", "Electron"],
  ["prisma", "Prisma"],
  ["drizzle-orm", "Drizzle"],
  ["firebase", "Firebase"],
  ["@supabase/supabase-js", "Supabase"],
  ["ink", "Ink"],
  ["ai", "Vercel AI SDK"],
  ["zod", "Zod"],
  ["vitest", "Vitest"],
  ["jest", "Jest"],
  ["@playwright/test", "Playwright"],
];

const LANG_BY_EXT: Record<string, string> = {
  ".ts": "TypeScript",
  ".tsx": "TypeScript",
  ".js": "JavaScript",
  ".jsx": "JavaScript",
  ".mjs": "JavaScript",
  ".py": "Python",
  ".rs": "Rust",
  ".go": "Go",
  ".swift": "Swift",
  ".kt": "Kotlin",
  ".java": "Java",
  ".rb": "Ruby",
  ".php": "PHP",
  ".cs": "C#",
  ".cpp": "C++",
  ".c": "C",
  ".css": "CSS",
  ".html": "HTML",
};

const SKIP_DIRS = new Set(["node_modules", ".git", ".vard", "dist", "build", "target", ".next", "coverage", "vendor", ".venv", "venv"]);

/** Files in the project: git's view (tracked + untracked, minus ignored) when it's a repo. */
function walk(root: string, max = 4000): string[] {
  const r = Bun.spawnSync(["git", "ls-files", "--cached", "--others", "--exclude-standard"], {
    cwd: root,
    stdout: "pipe",
    stderr: "ignore",
  });
  if (r.exitCode === 0) {
    const files = r.stdout.toString().split("\n").filter((f) => f && !f.startsWith(".vard/"));
    if (files.length) return files.slice(0, max);
  }
  return walkFs(root, max);
}

function walkFs(root: string, max: number): string[] {
  const out: string[] = [];
  const visit = (dir: string, rel: string, depth: number) => {
    if (out.length >= max || depth > 6) return;
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name.startsWith(".") && e.name !== ".github") continue;
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) visit(path.join(dir, e.name), rel + e.name + "/", depth + 1);
      } else out.push(rel + e.name);
    }
  };
  visit(root, "", 0);
  return out;
}

function packageManager(dir: string): string | null {
  const has = (f: string) => fs.existsSync(path.join(dir, f));
  if (has("bun.lock") || has("bun.lockb")) return "bun";
  if (has("pnpm-lock.yaml")) return "pnpm";
  if (has("yarn.lock")) return "yarn";
  if (has("package-lock.json")) return "npm";
  return null;
}

/** Facts about one package.json directory. */
function nodeFacts(dir: string, rel: string, pmFallback: string | null): string[] {
  const pkg = readJson(path.join(dir, "package.json"));
  if (!pkg) return [];
  const out: string[] = [];
  const where = rel ? ` in \`${rel}\`` : "";
  const pm = packageManager(dir) ?? pmFallback ?? "npm";
  const scripts: Record<string, string> = pkg.scripts ?? {};
  const pick = ["dev", "build", "test", "typecheck", "lint", "format"].filter((s) => scripts[s]);
  if (pick.length) out.push(`Scripts${where}: ${pick.map((s) => `\`${pm} run ${s}\``).join(", ")}`);
  if (!scripts.test && pm === "bun") {
    const hasTests = walk(dir, 800).some((f) => /\.(test|spec)\.[jt]sx?$/.test(f));
    if (hasTests) out.push(`Tests${where} run with \`bun test\``);
  }
  const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  const fw = FRAMEWORKS.filter(([k]) => k in deps).map(([, v]) => v);
  if (fw.length) out.push(`Uses${where}: ${fw.join(", ")}`);
  return out;
}

/** A short, deterministic description of the project: stack, commands and layout. */
export function scanProject(root: string): string[] {
  const facts: string[] = [];
  const files = walk(root);
  const pkg = readJson(path.join(root, "package.json"));
  const cargo = readText(path.join(root, "Cargo.toml"));
  const pyproject = readText(path.join(root, "pyproject.toml"));
  const gomod = readText(path.join(root, "go.mod"));

  const name =
    pkg?.name ??
    cargo.match(/^\s*name\s*=\s*"([^"]+)"/m)?.[1] ??
    pyproject.match(/^\s*name\s*=\s*"([^"]+)"/m)?.[1] ??
    gomod.match(/^module\s+(\S+)/m)?.[1] ??
    path.basename(root);
  facts.push(`Project: ${name}`);

  // Languages by file count.
  const counts = new Map<string, number>();
  for (const f of files) {
    const lang = LANG_BY_EXT[path.extname(f)];
    if (lang) counts.set(lang, (counts.get(lang) ?? 0) + 1);
  }
  const langs = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([l]) => l);
  if (langs.length) facts.push(`Languages: ${langs.join(", ")}`);

  const pm = packageManager(root);
  if (pm) facts.push(`Package manager: ${pm}`);
  facts.push(...nodeFacts(root, "", pm));

  if (cargo) facts.push("Rust: build with `cargo build`, test with `cargo test`");
  if (pyproject) facts.push(`Python: ${/pytest/.test(pyproject) ? "tests run with `pytest`" : "pyproject.toml project"}`);
  if (gomod) facts.push("Go: test with `go test ./...`");

  // Sub-projects one or two levels down.
  const subs = files
    .filter((f) => /^[^/]+(\/[^/]+)?\/(package\.json|Cargo\.toml|pyproject\.toml|go\.mod)$/.test(f))
    .map((f) => ({ dir: path.dirname(f), kind: path.basename(f) }))
    .slice(0, 6);
  for (const s of subs) {
    if (s.kind === "package.json") facts.push(...nodeFacts(path.join(root, s.dir), s.dir + "/", pm));
    else facts.push(`\`${s.dir}/\` is a ${s.kind === "Cargo.toml" ? "Rust" : s.kind === "go.mod" ? "Go" : "Python"} sub-project`);
  }

  const top = [...new Set(files.filter((f) => f.includes("/")).map((f) => f.split("/")[0]))].slice(0, 12);
  if (top.length) facts.push(`Top-level folders: ${top.map((d) => `\`${d}/\``).join(", ")}`);
  for (const doc of ["VARD.md", "AGENTS.md", "CLAUDE.md", "README.md", "CONTRIBUTING.md"])
    if (files.includes(doc)) {
      facts.push(`Read \`${doc}\` for project guidance`);
      break;
    }
  return facts;
}

// ---------- recall ----------

const STOP = new Set(
  "the and for with that this from into your you are was were will have has had not but all any can use using add make change update fix please should would could when then than them they their there what which while about after before".split(
    " ",
  ),
);
const keywords = (s: string) => new Set(normalize(s).filter((w) => w.length > 2 && !STOP.has(w)));
/** Same word, or one is a prefix of the other (auth ~ authentication, cookie ~ cookies). */
function matches(want: Set<string>, w: string): boolean {
  if (want.has(w)) return true;
  if (w.length < 4) return false;
  for (const x of want) if (x.length >= 4 && (x.startsWith(w) || w.startsWith(x))) return true;
  return false;
}

/**
 * Memory text for the system prompt: the overview, then the entries most related to `prompt`
 * (newest first on ties), within `budgetChars`. Returns "" when there is nothing to say.
 */
export function recall(store: MemoryStore, prompt: string, budgetChars = 6000): string {
  const entries = store.entries();
  if (!entries.length) return "";
  const want = keywords(prompt);
  const overview = entries.filter((e) => e.section === "overview");
  const rest = entries
    .filter((e) => e.section !== "overview")
    .map((e, i) => {
      let score = 0;
      for (const w of keywords(e.text)) if (matches(want, w)) score++;
      return { e, score, i };
    });
  const total = entries.reduce((n, e) => n + e.text.length + 4, 0);
  const chosen =
    total <= budgetChars
      ? rest
      : [...rest].sort((a, b) => b.score - a.score || (b.e.date ?? "").localeCompare(a.e.date ?? "") || b.i - a.i);
  let used = overview.reduce((n, e) => n + e.text.length + 4, 0);
  const keep = new Set<number>();
  for (const c of chosen) {
    const cost = c.e.text.length + 4;
    if (used + cost > budgetChars) continue;
    used += cost;
    keep.add(c.i);
  }
  const lines: string[] = [];
  for (const s of SECTIONS) {
    const items =
      s.id === "overview" ? overview : rest.filter((r) => keep.has(r.i) && r.e.section === s.id).map((r) => r.e);
    if (!items.length) continue;
    lines.push(`## ${s.title}`, ...items.map((e) => `- ${e.text}`), "");
  }
  const omitted = rest.length - keep.size;
  if (omitted > 0) lines.push(`(${omitted} less related notes omitted)`);
  return lines.join("\n").trim();
}

// ---------- reflection ----------

export const ProposalList = z
  .array(z.object({ section: SectionId.exclude(["overview"]), text: z.string().min(8).max(300) }))
  .max(5);

export function reflectPrompt(input: {
  prompt: string;
  summary: string;
  tools: string[];
  diffStat?: string;
  verify?: string;
  memory: string;
}): string {
  return `You just finished a coding task in this project. Decide what is worth remembering for FUTURE tasks in the same project.

Task: ${input.prompt}
Result: ${input.summary || "(no summary)"}
${input.verify ? `Verification: ${input.verify}\n` : ""}${input.diffStat ? `Files changed:\n${input.diffStat}\n` : ""}Steps taken:
${input.tools.slice(-40).join("\n") || "(none)"}

Already in memory:
${input.memory || "(nothing yet)"}

Reply with ONLY a JSON array (no prose) of 0 to 5 items like:
[{"section": "conventions", "text": "Tests run with \`bun test\`; test files sit next to the code as *.test.ts"}]

Sections: "conventions" (how code is written, tested, named, organised), "decisions" (choices made and why), "issues" (bugs, gotchas and how they were fixed).
Rules: only durable facts you actually observed in this task; no guesses; nothing already in memory; nothing specific to this one task (like "added multiply()"); one fact per item, under 200 characters. If nothing is worth keeping, reply [].`;
}

/** Extracts proposals from a model reply. Anything malformed gives []. */
export function parseProposals(reply: string): MemoryItem[] {
  const start = reply.indexOf("[");
  const end = reply.lastIndexOf("]");
  if (start === -1 || end <= start) return [];
  try {
    const parsed = ProposalList.safeParse(JSON.parse(reply.slice(start, end + 1)));
    return parsed.success ? parsed.data.map((p) => ({ section: p.section, text: p.text.trim() })) : [];
  } catch {
    return [];
  }
}
