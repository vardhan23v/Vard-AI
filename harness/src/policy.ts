/**
 * Policy: decides allow / ask / deny for every tool call before it runs.
 *
 *  - Paths must resolve (after `..` and symlinks) inside the project root or task worktree.
 *  - Reads are allowed.
 *  - Writes inside the worktree are allowed; writes elsewhere in the project ask; `.git/` is denied.
 *  - run_command is denied for dangerous patterns (sudo, `rm -rf /`, `git push`, ...), allowed when it
 *    matches the per-project allowlist, and otherwise asks.
 *  - Approvals can be "allow once" (handled by the loop) or "always for this project" (remember()).
 */
import fs from "node:fs";
import path from "node:path";
import type { ToolDef } from "./tools/types";
import { isInside, realpathLoose } from "./util";

export type PolicyAction = "allow" | "ask" | "deny";
export interface Decision {
  action: PolicyAction;
  reason: string;
}

export interface ProjectRules {
  /** Command prefixes that run without asking, e.g. "bun test", "npm run lint". */
  allowlist: string[];
  /** Tool names approved "always" for this project (only skips 'ask', never 'deny'). */
  tools: string[];
}

export interface RulesStore {
  load(): ProjectRules;
  save(rules: ProjectRules): void;
}

/** Persists "always for this project" decisions to `<project>/.vard/policy.json`. */
export class FileRulesStore implements RulesStore {
  constructor(private projectRoot: string) {}
  get file() {
    return path.join(this.projectRoot, ".vard", "policy.json");
  }
  load(): ProjectRules {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, "utf8"));
      return { allowlist: raw.allowlist ?? [], tools: raw.tools ?? [] };
    } catch {
      return { allowlist: [], tools: [] };
    }
  }
  save(rules: ProjectRules) {
    ensureVardDir(this.projectRoot);
    fs.writeFileSync(this.file, JSON.stringify(rules, null, 2) + "\n");
  }
}

export class MemoryRulesStore implements RulesStore {
  constructor(public rules: ProjectRules = { allowlist: [], tools: [] }) {}
  load() {
    return structuredClone(this.rules);
  }
  save(rules: ProjectRules) {
    this.rules = structuredClone(rules);
  }
}

/** Create `<project>/.vard/` with a .gitignore so harness state never shows up in the user's diff. */
export function ensureVardDir(projectRoot: string): string {
  const dir = path.join(projectRoot, ".vard");
  fs.mkdirSync(dir, { recursive: true });
  const gi = path.join(dir, ".gitignore");
  if (!fs.existsSync(gi)) fs.writeFileSync(gi, "*\n");
  return dir;
}

// ---------- command classification ----------

const SHELL_META = /[;&|`<>\n]|\$\(/;

/** Split a command line into simple-command segments on shell control operators. */
export function commandSegments(cmd: string): string[] {
  return cmd
    .split(/\|\||&&|[;|&\n]|\$\(|`/)
    .map((s) => s.replace(/[()]/g, " ").trim())
    .filter(Boolean);
}

function words(segment: string): string[] {
  // Strip leading env assignments (FOO=bar cmd) and wrappers that run another command.
  const w = segment.split(/\s+/).filter(Boolean);
  while (w.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(w[0])) w.shift();
  while (w.length && ["env", "command", "exec", "nohup", "time", "xargs"].includes(w[0])) w.shift();
  return w;
}

const DANGEROUS_TARGET = /^(\/|~|\$HOME|\$\{HOME\}|\*|\.{1,2}(\/.*)?|\/\*)$|^\/|^~/;

export function classifyCommand(cmd: string): { action: "deny" | "ask" | null; reason?: string } {
  if (/:\s*\(\s*\)\s*\{/.test(cmd)) return { action: "deny", reason: "fork bomb" };
  for (const seg of commandSegments(cmd)) {
    const w = words(seg);
    if (!w.length) continue;
    const bin = path.basename(w[0]);
    if (["sudo", "doas", "su", "pkexec"].includes(bin)) return { action: "deny", reason: `${bin} is never allowed` };
    if (/^mkfs/.test(bin) || ["shutdown", "reboot", "halt", "diskutil", "launchctl"].includes(bin))
      return { action: "deny", reason: `${bin} is never allowed` };
    if (bin === "git" && w.slice(1).includes("push")) return { action: "deny", reason: "git push is never allowed" };
    if (bin === "dd" && w.some((a) => /^of=\/dev\//.test(a))) return { action: "deny", reason: "writing to a device" };
    if (bin === "chmod" || bin === "chown") {
      if (w.slice(1).some((a) => a === "/" || a === "~" || /^\/(etc|usr|bin|System|Library)\b/.test(a)))
        return { action: "deny", reason: `${bin} on system paths` };
    }
    if (bin === "rm") {
      const flags = w.slice(1).filter((a) => a.startsWith("-"));
      const recursive = flags.some((f) => f === "--recursive" || (/^-[a-zA-Z]+$/.test(f) && /[rR]/.test(f)));
      const targets = w.slice(1).filter((a) => !a.startsWith("-"));
      if (recursive && targets.some((t) => DANGEROUS_TARGET.test(t)))
        return { action: "deny", reason: "recursive rm outside the project (absolute, home, '..', '.' or '*' target)" };
      if (recursive) return { action: "ask", reason: "recursive delete" };
    }
    if (/>\s*\/dev\/(disk|sd|nvme)/.test(seg)) return { action: "deny", reason: "writing to a device" };
  }
  return { action: null };
}

export function matchesAllowlist(cmd: string, allowlist: string[]): boolean {
  const c = cmd.trim().replace(/\s+/g, " ");
  if (SHELL_META.test(c)) return false; // never auto-allow chained/redirected commands
  return allowlist.some((entry) => {
    const e = entry.trim().replace(/\s+/g, " ");
    return e.length > 0 && (c === e || c.startsWith(e + " "));
  });
}

// ---------- policy ----------

export interface PolicyOptions {
  projectRoot: string;
  /** Where the agent writes; the task worktree, or the project root when worktrees are off. */
  workRoot: string;
  /** Extra allowlist entries for this run (not persisted). */
  allowlist?: string[];
  store?: RulesStore;
}

export class Policy {
  readonly projectRoot: string;
  readonly workRoot: string;
  private extra: string[];
  private store: RulesStore;
  private rules: ProjectRules;

  constructor(opts: PolicyOptions) {
    this.projectRoot = realpathLoose(opts.projectRoot);
    this.workRoot = realpathLoose(opts.workRoot);
    this.extra = opts.allowlist ?? [];
    this.store = opts.store ?? new FileRulesStore(this.projectRoot);
    this.rules = this.store.load();
  }

  get allowlist(): string[] {
    return [...this.rules.allowlist, ...this.extra];
  }

  /** Resolve a tool path argument the same way tools do (relative to the work root). */
  resolvePath(p: string): string {
    return realpathLoose(path.resolve(this.workRoot, p));
  }

  checkPath(p: string): { inWork: boolean; inProject: boolean; abs: string } {
    const abs = this.resolvePath(p);
    return { abs, inWork: isInside(abs, this.workRoot), inProject: isInside(abs, this.projectRoot) };
  }

  decide(tool: ToolDef, input: Record<string, unknown>): Decision {
    // 1. Path confinement applies to every tool with path arguments.
    let writeOutsideWork = false;
    for (const field of tool.pathFields ?? []) {
      const v = input[field];
      if (typeof v !== "string") continue;
      const { abs, inWork, inProject } = this.checkPath(v);
      if (!inWork && !inProject) return { action: "deny", reason: `path escapes the project: ${v}` };
      if (tool.risk === "write") {
        const relToWork = path.relative(inWork ? this.workRoot : this.projectRoot, abs);
        if (relToWork.split(path.sep).includes(".git"))
          return { action: "deny", reason: `writes into .git are not allowed: ${v}` };
        if (!inWork && isInside(abs, path.join(this.projectRoot, ".vard")))
          return { action: "deny", reason: `writes into .vard are not allowed: ${v}` };
        if (!inWork) writeOutsideWork = true;
      }
    }

    // 2. Risk classes.
    switch (tool.risk) {
      case "read":
        return { action: "allow", reason: "read-only" };
      case "write":
        if (writeOutsideWork) return this.askUnlessAlways(tool, "write outside the task worktree");
        return { action: "allow", reason: "write inside the worktree" };
      case "exec": {
        const cmd = String(input.command ?? "");
        const c = classifyCommand(cmd);
        if (c.action === "deny") return { action: "deny", reason: c.reason! };
        if (c.action === "ask") return { action: "ask", reason: c.reason! };
        if (matchesAllowlist(cmd, this.allowlist)) return { action: "allow", reason: "matches project allowlist" };
        return { action: "ask", reason: "command is not on the project allowlist" };
      }
    }
  }

  private askUnlessAlways(tool: ToolDef, reason: string): Decision {
    if (this.rules.tools.includes(tool.name)) return { action: "allow", reason: `${tool.name} approved for this project` };
    return { action: "ask", reason };
  }

  /** "Always for this project": remember the approval so the same call does not ask again. */
  remember(tool: ToolDef, input: Record<string, unknown>) {
    if (tool.risk === "exec") {
      const cmd = String(input.command ?? "").trim();
      if (cmd && !this.rules.allowlist.includes(cmd)) this.rules.allowlist.push(cmd);
    } else if (!this.rules.tools.includes(tool.name)) {
      this.rules.tools.push(tool.name);
    }
    this.store.save(this.rules);
  }
}
