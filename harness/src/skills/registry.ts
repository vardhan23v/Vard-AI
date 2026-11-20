/**
 * The merged view of built-in, global and project skills.
 *
 * Precedence is builtin > global > project. A skill whose name is already taken by a
 * higher-precedence source is listed as "shadowed" and never used, so a project can't silently
 * replace a skill the user trusts. Project skills only become usable after the user trusts the
 * exact content of the project's .vard/skills folder (any edit asks again, like MCP configs).
 *
 * State (disabled skills, usage history) lives in ~/.vard/skills.json; trust in
 * ~/.vard/skills-trust.json.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  globalSkillsDir,
  type LoadedSkill,
  loadBuiltins,
  loadRoot,
  projectSkillsDir,
} from "./loader";
import type { SkillSummary, SkillUsage } from "./schema";

const MAX_USAGE = 500;
const PRECEDENCE = { builtin: 0, global: 1, project: 2 } as const;

export interface SkillRecord extends LoadedSkill {
  id: string;
  enabled: boolean;
  trusted: boolean;
  shadowedBy?: string;
  /** valid, enabled, trusted and not shadowed. */
  usable: boolean;
}

interface StateFile {
  version: 1;
  disabled: string[];
  usage: SkillUsage[];
}

function writeJsonAtomic(file: string, data: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n", { mode: 0o600 });
  fs.renameSync(tmp, file);
}

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

const MAX_TRUST_FILES = 2_000;
const MAX_TRUST_BYTES = 20 * 1024 * 1024;

/**
 * Hash of every file under a project's .vard/skills (names, sizes and contents). Returns null when
 * there is nothing to trust, and "too_large" when the folder is over the limits: then it can't be
 * trusted at all, so no file can change unnoticed.
 */
export function projectSkillsHash(projectRoot: string): string | null | "too_large" {
  const root = projectSkillsDir(projectRoot);
  if (!fs.existsSync(root)) return null;
  const h = crypto.createHash("sha256");
  let files = 0;
  let bytes = 0;
  let tooLarge = false;
  const walk = (dir: string, rel: string) => {
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (tooLarge) return;
      const abs = path.join(dir, e.name);
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isSymbolicLink()) h.update(`link:${r}->${fs.readlinkSync(abs)}\n`);
      else if (e.isDirectory()) walk(abs, r);
      else if (e.isFile()) {
        const size = fs.statSync(abs).size;
        files++;
        bytes += size;
        if (files > MAX_TRUST_FILES || bytes > MAX_TRUST_BYTES) {
          tooLarge = true;
          return;
        }
        h.update(`file:${r}:${size}\n`).update(fs.readFileSync(abs));
      }
    }
  };
  walk(root, "");
  if (tooLarge) return "too_large";
  return files ? h.digest("hex") : null;
}

export class SkillRegistry {
  private records: SkillRecord[] = [];
  readonly home: string;
  readonly projectRoot?: string;

  constructor(opts: { home: string; projectRoot?: string }) {
    this.home = opts.home;
    this.projectRoot = opts.projectRoot ? path.resolve(opts.projectRoot) : undefined;
    this.reload();
  }

  get stateFile() {
    return path.join(this.home, "skills.json");
  }
  get trustFile() {
    return path.join(this.home, "skills-trust.json");
  }
  get globalDir() {
    return globalSkillsDir(this.home);
  }
  get projectDir() {
    return this.projectRoot ? projectSkillsDir(this.projectRoot) : undefined;
  }

  private state(): StateFile {
    const s = readJson<Partial<StateFile>>(this.stateFile, {});
    return {
      version: 1,
      disabled: Array.isArray(s.disabled) ? s.disabled : [],
      usage: Array.isArray(s.usage) ? s.usage : [],
    };
  }

  /** The key a skill's state is stored under (project skills include the project path). */
  stateKey(r: { source: string; name: string }) {
    return r.source === "project"
      ? `project:${this.projectRoot}:${r.name}`
      : `${r.source}:${r.name}`;
  }

  projectTrusted(): boolean {
    if (!this.projectRoot) return false;
    const h = projectSkillsHash(this.projectRoot);
    return (
      !!h &&
      h !== "too_large" &&
      readJson<Record<string, string>>(this.trustFile, {})[this.projectRoot] === h
    );
  }

  setTrusted(trusted: boolean) {
    if (!this.projectRoot) throw new Error("trust applies to a project's skills");
    const all = readJson<Record<string, string>>(this.trustFile, {});
    const h = projectSkillsHash(this.projectRoot);
    if (trusted && h === "too_large")
      throw new Error(
        "This project's .vard/skills folder is too large to trust (over 2,000 files or 20 MB).",
      );
    if (trusted && h) all[this.projectRoot] = h;
    else delete all[this.projectRoot];
    writeJsonAtomic(this.trustFile, all);
    this.reload();
  }

  reload() {
    const state = this.state();
    const disabled = new Set(state.disabled);
    const loaded: LoadedSkill[] = [
      ...loadBuiltins(),
      ...loadRoot(this.globalDir, "global"),
      ...(this.projectDir ? loadRoot(this.projectDir, "project") : []),
    ];
    const projectTrusted = this.projectTrusted();
    const winner = new Map<string, LoadedSkill>();
    for (const s of [...loaded].sort((a, b) => PRECEDENCE[a.source] - PRECEDENCE[b.source]))
      if (!s.errors.length && !winner.has(s.name)) winner.set(s.name, s);
    this.records = loaded.map((s) => {
      const id = `${s.source}:${s.name}`;
      const w = winner.get(s.name);
      const shadowedBy =
        w && w !== s && PRECEDENCE[w.source] < PRECEDENCE[s.source]
          ? `${w.source}:${w.name}`
          : undefined;
      const enabled = !disabled.has(this.stateKey(s));
      const trusted = s.source !== "project" || projectTrusted;
      return {
        ...s,
        id,
        enabled,
        trusted,
        shadowedBy,
        usable: !s.errors.length && enabled && trusted && !shadowedBy,
      };
    });
  }

  all(): SkillRecord[] {
    return this.records;
  }

  usable(): SkillRecord[] {
    return this.records.filter((r) => r.usable);
  }

  /** By id ("global:react-development") or by name (the winning skill with that name). */
  find(ref: string): SkillRecord | undefined {
    if (ref.includes(":")) return this.records.find((r) => r.id === ref);
    const named = this.records.filter((r) => r.name === ref);
    return (
      named.find((r) => r.usable) ??
      named.sort((a, b) => PRECEDENCE[a.source] - PRECEDENCE[b.source])[0]
    );
  }

  setEnabled(ref: string, enabled: boolean) {
    const r = this.find(ref);
    if (!r) throw new Error(`no skill "${ref}"`);
    const s = this.state();
    const key = this.stateKey(r);
    s.disabled = s.disabled.filter((k) => k !== key);
    if (!enabled) s.disabled.push(key);
    writeJsonAtomic(this.stateFile, s);
    this.reload();
  }

  /** Marks a skill (by source and name) disabled before it is first listed (imports). */
  disableByKey(source: "global" | "project", name: string) {
    const s = this.state();
    const key = this.stateKey({ source, name });
    if (!s.disabled.includes(key)) s.disabled.push(key);
    writeJsonAtomic(this.stateFile, s);
  }

  recordUse(entries: SkillUsage[]) {
    if (!entries.length) return;
    try {
      const s = this.state();
      s.usage = [...s.usage, ...entries].slice(-MAX_USAGE);
      writeJsonAtomic(this.stateFile, s);
    } catch {
      // Usage history must never break a task.
    }
  }

  /** Usage of one skill (newest first). Project skills only count uses in this project. */
  usage(r?: SkillRecord): SkillUsage[] {
    const all = this.state().usage;
    const mine = r
      ? all.filter(
          (u) =>
            u.skillId === r.id && (r.source !== "project" || u.projectRoot === this.projectRoot),
        )
      : all.filter((u) => !u.skillId.startsWith("project:") || u.projectRoot === this.projectRoot);
    return mine.reverse();
  }

  summary(r: SkillRecord, usage = this.usage(r)): SkillSummary {
    const fm = r.frontmatter;
    return {
      id: r.id,
      name: r.name,
      description: fm?.description ?? "",
      version: fm?.version ?? "",
      source: r.source,
      tags: fm?.tags ?? [],
      triggers: fm?.triggers ?? [],
      globs: fm?.globs ?? [],
      roles: fm?.roles ?? [],
      priority: fm?.priority ?? 0,
      conflicts: fm?.conflicts ?? [],
      scripts: fm?.scripts ?? [],
      path: r.dir,
      enabled: r.enabled,
      trusted: r.trusted,
      valid: !r.errors.length,
      errors: r.errors,
      warnings: r.warnings,
      shadowedBy: r.shadowedBy,
      resources: r.resources,
      chars: r.body.length,
      usage: { count: usage.length, lastUsedAt: usage[0]?.at },
    };
  }

  summaries(): SkillSummary[] {
    const usage = this.usage();
    return this.records.map((r) => {
      const mine = usage.filter((u) => u.skillId === r.id);
      return this.summary(r, mine);
    });
  }
}
