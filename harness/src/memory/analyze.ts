/**
 * Project analysis: a deterministic description of a project (no model call, no tokens).
 *
 * Files come from git (so .gitignore is respected), minus sensitive files and the user's
 * excluded globs. Only small, well-known config and doc files are read, and their contents are
 * never stored: just the facts drawn from them.
 */
import fs from "node:fs";
import path from "node:path";
import { findSecret, isSensitivePath } from "./secrets";
import type { Category } from "./store";

export type Fact = { category: Category; text: string };

const MAX_READ = 64 * 1024;

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".vard",
  "dist",
  "build",
  "target",
  ".next",
  "coverage",
  "vendor",
  ".venv",
  "venv",
  "__pycache__",
]);

function readSmall(file: string): string {
  try {
    const st = fs.statSync(file);
    if (!st.isFile() || st.size > MAX_READ) return "";
    return fs.readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- arbitrary package.json contents
function readJson(file: string): Record<string, any> | null {
  try {
    return JSON.parse(readSmall(file));
  } catch {
    return null;
  }
}

function globMatcher(globs: string[]) {
  const compiled = globs.map((g) => new Bun.Glob(g.endsWith("/") ? `${g}**` : g));
  return (p: string) => compiled.some((g) => g.match(p) || g.match(p.split("/")[0] + "/"));
}

/** Project files: git's view when possible, minus sensitive files and excluded globs. */
export function projectFiles(root: string, exclude: string[] = [], max = 6000): string[] {
  const excluded = globMatcher(exclude);
  let files: string[] = [];
  const r = Bun.spawnSync(["git", "ls-files", "--cached", "--others", "--exclude-standard"], {
    cwd: root,
    stdout: "pipe",
    stderr: "ignore",
  });
  if (r.exitCode === 0) files = r.stdout.toString().split("\n").filter(Boolean);
  if (!files.length) files = walkFs(root, max * 2);
  return files
    .filter((f) => !f.startsWith(".vard/") && !isSensitivePath(f) && !excluded(f))
    .slice(0, max);
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

const FRAMEWORKS: [string, string][] = [
  ["next", "Next.js"],
  ["react", "React"],
  ["vue", "Vue"],
  ["svelte", "Svelte"],
  ["@sveltejs/kit", "SvelteKit"],
  ["@angular/core", "Angular"],
  ["solid-js", "Solid"],
  ["astro", "Astro"],
  ["vite", "Vite"],
  ["@tanstack/react-router", "TanStack Router"],
  ["@tanstack/react-query", "TanStack Query"],
  ["tailwindcss", "Tailwind CSS"],
  ["express", "Express"],
  ["hono", "Hono"],
  ["fastify", "Fastify"],
  ["@nestjs/core", "NestJS"],
  ["@tauri-apps/api", "Tauri"],
  ["electron", "Electron"],
  ["react-native", "React Native"],
  ["expo", "Expo"],
  ["prisma", "Prisma"],
  ["drizzle-orm", "Drizzle"],
  ["mongoose", "Mongoose"],
  ["firebase", "Firebase"],
  ["@supabase/supabase-js", "Supabase"],
  ["ink", "Ink"],
  ["ai", "Vercel AI SDK"],
  ["zod", "Zod"],
  ["vitest", "Vitest"],
  ["jest", "Jest"],
  ["mocha", "Mocha"],
  ["@playwright/test", "Playwright"],
  ["cypress", "Cypress"],
];

const TEST_FRAMEWORKS = new Set(["Vitest", "Jest", "Mocha", "Playwright", "Cypress"]);

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
  ".dart": "Dart",
  ".css": "CSS",
  ".html": "HTML",
};

const CONFIG_FILES: [RegExp, string][] = [
  [/^tsconfig(\..+)?\.json$/, "TypeScript config"],
  [/^vite\.config\.[cm]?[jt]s$/, "Vite config"],
  [/^next\.config\.[cm]?[jt]s$/, "Next.js config"],
  [/^tailwind\.config\.[cm]?[jt]s$/, "Tailwind config"],
  [/^(eslint\.config\.[cm]?[jt]s|\.eslintrc(\..+)?)$/, "ESLint"],
  [/^(\.prettierrc(\..+)?|prettier\.config\.[cm]?[jt]s)$/, "Prettier"],
  [/^biome\.json$/, "Biome"],
  [/^(Dockerfile|docker-compose\.ya?ml|compose\.ya?ml)$/, "Docker"],
  [/^vercel\.json$/, "Vercel"],
  [/^firebase\.json$/, "Firebase config"],
  [/^Makefile$/, "Makefile"],
];

function packageManager(dir: string): string | null {
  const has = (f: string) => fs.existsSync(path.join(dir, f));
  if (has("bun.lock") || has("bun.lockb")) return "bun";
  if (has("pnpm-lock.yaml")) return "pnpm";
  if (has("yarn.lock")) return "yarn";
  if (has("package-lock.json")) return "npm";
  return null;
}

function nodeFacts(
  root: string,
  rel: string,
  files: string[],
  pmFallback: string | null,
  subDirs: string[] = [],
): Fact[] {
  const dir = path.join(root, rel);
  const pkg = readJson(path.join(dir, "package.json"));
  if (!pkg) return [];
  const out: Fact[] = [];
  const where = rel ? ` in \`${rel}\`` : "";
  const pm = packageManager(dir) ?? pmFallback ?? "npm";
  const scripts: Record<string, string> = pkg.scripts ?? {};
  const order = ["dev", "start", "build", "test", "typecheck", "lint", "format"];
  const pick = order.filter((s) => scripts[s]);
  if (pick.length)
    out.push({
      category: "commands",
      text: `Scripts${where}: ${pick.map((s) => `\`${pm} run ${s}\``).join(", ")}`,
    });
  const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  const fw = FRAMEWORKS.filter(([k]) => k in deps).map(([, v]) => v);
  const testFw = fw.filter((f) => TEST_FRAMEWORKS.has(f));
  if (scripts.test)
    out.push({
      category: "commands",
      text: `Run tests${where} with \`${pm} run test\`${testFw.length ? ` (${testFw.join(", ")})` : ""}`,
    });
  else if (pm === "bun") {
    // Only this package's own tests, not those of nested packages.
    const own = (f: string) =>
      f.startsWith(rel) && !subDirs.some((d) => d !== rel && d.startsWith(rel) && f.startsWith(d));
    if (files.some((f) => own(f) && /\.(test|spec)\.[jt]sx?$/.test(f)))
      out.push({
        category: "commands",
        text: `Run tests${where} with \`bun test\` (bun's built-in runner)`,
      });
  }
  if (fw.length) out.push({ category: "overview", text: `Uses${where}: ${fw.join(", ")}` });
  // Entry points
  const entries: string[] = [];
  for (const k of ["main", "module", "types"])
    if (typeof pkg[k] === "string") entries.push(`${k}: \`${path.posix.join(rel, pkg[k])}\``);
  if (typeof pkg.bin === "string") entries.push(`bin: \`${path.posix.join(rel, pkg.bin)}\``);
  else if (pkg.bin && typeof pkg.bin === "object")
    for (const [n, f] of Object.entries(pkg.bin).slice(0, 3))
      entries.push(`bin \`${n}\`: \`${path.posix.join(rel, String(f))}\``);
  if (entries.length)
    out.push({
      category: "architecture",
      text: `Package entry points${where}: ${entries.join(", ")}`,
    });
  if (Array.isArray(pkg.workspaces) || pkg.workspaces?.packages)
    out.push({
      category: "architecture",
      text: `Monorepo workspaces: ${(Array.isArray(pkg.workspaces) ? pkg.workspaces : pkg.workspaces.packages).slice(0, 6).join(", ")}`,
    });
  return out;
}

function readmeSummary(text: string): string | null {
  const lines = text.replace(/\r/g, "").split("\n");
  const title = lines
    .find((l) => /^#\s+\S/.test(l))
    ?.replace(/^#\s+/, "")
    .trim();
  let para = "";
  for (const l of lines) {
    const t = l.trim();
    if (!t) {
      if (para) break;
      continue;
    }
    if (/^(#|<|!\[|\[!\[|```|\||-{3,}|={3,})/.test(t)) {
      if (para) break;
      continue;
    }
    para += (para ? " " : "") + t;
    if (para.length > 300) break;
  }
  const clean = para
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\*\*/g, "")
    .slice(0, 300);
  if (!title && !clean) return null;
  const out = `${title ? `README: "${title}"` : "README"}${clean ? ` — ${clean}${para.length > 300 ? "…" : ""}` : ""}`;
  return findSecret(out) ? null : out;
}

/** Facts about the project at `root`. */
export function analyzeProject(root: string, exclude: string[] = []): Fact[] {
  const files = projectFiles(root, exclude);
  const fileSet = new Set(files);
  const has = (f: string) => fileSet.has(f);
  const facts: Fact[] = [];

  const pkg = has("package.json") ? readJson(path.join(root, "package.json")) : null;
  const cargo = has("Cargo.toml") ? readSmall(path.join(root, "Cargo.toml")) : "";
  const pyproject = has("pyproject.toml") ? readSmall(path.join(root, "pyproject.toml")) : "";
  const gomod = has("go.mod") ? readSmall(path.join(root, "go.mod")) : "";

  const name =
    pkg?.name ??
    cargo.match(/^\s*name\s*=\s*"([^"]+)"/m)?.[1] ??
    pyproject.match(/^\s*name\s*=\s*"([^"]+)"/m)?.[1] ??
    gomod.match(/^module\s+(\S+)/m)?.[1] ??
    path.basename(root);
  facts.push({ category: "overview", text: `Project: ${name}` });

  const counts = new Map<string, number>();
  for (const f of files) {
    const lang = LANG_BY_EXT[path.extname(f)];
    if (lang) counts.set(lang, (counts.get(lang) ?? 0) + 1);
  }
  const langs = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 4);
  if (langs.length)
    facts.push({
      category: "overview",
      text: `Languages: ${langs.map(([l, n]) => `${l} (${n} files)`).join(", ")}`,
    });

  const readme = files.find((f) => /^readme(\.md|\.markdown|\.txt)?$/i.test(f));
  if (readme) {
    const s = readmeSummary(readSmall(path.join(root, readme)));
    if (s) facts.push({ category: "overview", text: s });
  }
  for (const doc of ["VARD.md", "AGENTS.md", "CLAUDE.md", "CONTRIBUTING.md"])
    if (has(doc))
      facts.push({
        category: "conventions",
        text: `Project guidance for contributors and agents is in \`${doc}\``,
      });

  const subs = files
    .filter((f) => /^[^/]+(\/[^/]+)?\/(package\.json|Cargo\.toml|pyproject\.toml|go\.mod)$/.test(f))
    .map((f) => ({ dir: path.posix.dirname(f), kind: path.posix.basename(f) }))
    .slice(0, 8);
  const subDirs = subs.map((s) => s.dir + "/");

  const pm = has("package.json") ? packageManager(root) : null;
  if (pm) facts.push({ category: "overview", text: `Package manager: ${pm}` });
  facts.push(...nodeFacts(root, "", files, pm, subDirs));

  if (cargo) {
    facts.push({
      category: "commands",
      text: "Rust: build with `cargo build`, test with `cargo test`",
    });
    if (has("src/main.rs"))
      facts.push({ category: "architecture", text: "Rust entry point: `src/main.rs`" });
    if (has("src/lib.rs"))
      facts.push({ category: "architecture", text: "Rust library root: `src/lib.rs`" });
  }
  if (pyproject)
    facts.push({
      category: "commands",
      text: /pytest/.test(pyproject)
        ? "Python: run tests with `pytest`"
        : "Python project configured in `pyproject.toml`",
    });
  if (gomod)
    facts.push({
      category: "commands",
      text: "Go: build with `go build ./...`, test with `go test ./...`",
    });

  // Sub-projects one or two levels down.
  for (const s of subs) {
    if (s.kind === "package.json") facts.push(...nodeFacts(root, s.dir + "/", files, pm, subDirs));
    else {
      const lang = s.kind === "Cargo.toml" ? "Rust" : s.kind === "go.mod" ? "Go" : "Python";
      facts.push({ category: "architecture", text: `\`${s.dir}/\` is a ${lang} sub-project` });
      if (s.kind === "Cargo.toml" && has(`${s.dir}/src/main.rs`))
        facts.push({
          category: "architecture",
          text: `${lang} entry point: \`${s.dir}/src/main.rs\``,
        });
    }
  }

  // Common entry points.
  const entryCandidates = files.filter(
    (f) =>
      /^(src\/)?(main|index|app|server|cli)\.(ts|tsx|js|jsx|mjs|py|go)$/.test(f) ||
      /^(app|pages)\/(layout|page|_app|index)\.(tsx|jsx|ts|js)$/.test(f),
  );
  if (entryCandidates.length)
    facts.push({
      category: "architecture",
      text: `Entry files: ${entryCandidates
        .slice(0, 6)
        .map((f) => `\`${f}\``)
        .join(", ")}`,
    });

  // Layout.
  const dirs = new Map<string, number>();
  for (const f of files)
    if (f.includes("/")) dirs.set(f.split("/")[0], (dirs.get(f.split("/")[0]) ?? 0) + 1);
  const top = [...dirs].sort((a, b) => b[1] - a[1]).slice(0, 12);
  if (top.length)
    facts.push({
      category: "architecture",
      text: `Top-level folders: ${top.map(([d, n]) => `\`${d}/\` (${n})`).join(", ")}`,
    });

  const configs = new Set<string>();
  for (const f of files) {
    if (f.includes("/") && !f.startsWith(".github/")) continue;
    for (const [re, label] of CONFIG_FILES) if (re.test(path.posix.basename(f))) configs.add(label);
  }
  const workflows = files.filter((f) => /^\.github\/workflows\/.+\.ya?ml$/.test(f));
  if (workflows.length)
    configs.add(`CI: GitHub Actions (${workflows.map((w) => path.posix.basename(w)).join(", ")})`);
  if (configs.size)
    facts.push({ category: "architecture", text: `Config: ${[...configs].join(", ")}` });

  return facts.filter((f) => !findSecret(f.text));
}
