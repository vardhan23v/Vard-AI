/**
 * Picks the skills relevant to a task, so only those reach the model's context.
 *
 * Score = keyword overlap between the task and the skill's name, tags, triggers and description,
 * plus repository signals (files matching the skill's globs, package dependencies), role affinity
 * and priority. A skill needs a textual match (or to be one the agent's role suggests) to be
 * chosen; role affinity and repository signals alone only boost. Then: threshold, top-k, a character budget, and `conflicts` are honoured.
 * Explicitly requested skills always come first and must be usable, or resolution fails.
 */
import fs from "node:fs";
import path from "node:path";
import { listFiles } from "../context";
import { SkillError } from "./errors";
import type { SkillRecord } from "./registry";
import type { ActivatedSkill } from "./schema";

export interface ProjectSignals {
  files: string[];
  /** Dependency names (package.json) and ecosystem markers (python, go, rust…). */
  deps: string[];
}

export interface ResolveOptions {
  prompt: string;
  role?: string;
  /** Skill names (or ids) the user picked. */
  explicit?: string[];
  /** Turn off automatic selection (explicit skills still apply). */
  auto?: boolean;
  /** Skill names a role suggests (counted like a role match). */
  hints?: string[];
  signals?: ProjectSignals;
  topK?: number;
  maxChars?: number;
  minScore?: number;
}

export interface ResolvedSkill {
  record: SkillRecord;
  activation: ActivatedSkill;
}

const STOP = new Set(
  "the and for with that this from into your you are was were will can should would could have has had not but all any add make use using new get set its our out how what when where which who why build create update change fix please want need also then than them they some more most very just only into onto over under about".split(
    " ",
  ),
);

export function tokens(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9][a-z0-9.+#-]*/g) ?? [])
    .map((t) => t.replace(/[.-]+$/, ""))
    .filter((t) => t.length >= 2 && !STOP.has(t));
}

const MARKERS: [string, string][] = [
  ["requirements.txt", "python"],
  ["pyproject.toml", "python"],
  ["go.mod", "go"],
  ["Cargo.toml", "rust"],
  ["Gemfile", "ruby"],
  ["pom.xml", "java"],
  ["Dockerfile", "docker"],
];

/** Files and dependency names of a project (bounded; never throws). */
export async function projectSignals(root: string): Promise<ProjectSignals> {
  const files = await listFiles(root, 5_000).catch(() => [] as string[]);
  const deps = new Set<string>();
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
    for (const k of ["dependencies", "devDependencies", "peerDependencies"])
      for (const d of Object.keys(pkg?.[k] ?? {})) deps.add(d.toLowerCase());
  } catch {}
  for (const [file, marker] of MARKERS) if (files.includes(file)) deps.add(marker.toLowerCase());
  return { files, deps: [...deps] };
}

function globHit(globs: string[], files: string[]): string | undefined {
  for (const g of globs) {
    try {
      const glob = new Bun.Glob(g);
      if (files.some((f) => glob.match(f))) return g;
    } catch {}
  }
  return undefined;
}

/** Dependency names that relate to a skill (e.g. "react", "@prisma/client" → prisma). */
function depHits(skillWords: Set<string>, deps: string[]): string[] {
  const hits: string[] = [];
  for (const d of deps) {
    const parts = d.replace(/^@/, "").split(/[/-]/);
    if (parts.some((p) => p.length >= 3 && skillWords.has(p))) hits.push(d);
    if (hits.length >= 3) break;
  }
  return hits;
}

export function scoreSkill(
  r: SkillRecord,
  o: ResolveOptions,
  promptTokens: Set<string>,
  lowerPrompt: string,
) {
  const fm = r.frontmatter!;
  const reasons: string[] = [];
  let text = 0;
  const nameHits = r.name.split("-").filter((p) => p.length >= 3 && promptTokens.has(p));
  if (nameHits.length) {
    text += 3 * nameHits.length;
    reasons.push(`task mentions ${nameHits.map((h) => `"${h}"`).join(", ")}`);
  }
  const tagHits = fm.tags.filter(
    (t) => tokens(t).some((x) => promptTokens.has(x)) && !nameHits.includes(t),
  );
  if (tagHits.length) {
    text += 2 * Math.min(tagHits.length, 4);
    reasons.push(`tags ${tagHits.slice(0, 4).join(", ")}`);
  }
  const trig = fm.triggers.filter((t) => {
    const lt = t.toLowerCase();
    return lt.includes(" ") || /[^a-z0-9]/.test(lt)
      ? lowerPrompt.includes(lt)
      : promptTokens.has(lt);
  });
  if (trig.length) {
    text += Math.min(4 * trig.length, 12);
    reasons.push(
      `triggers ${trig
        .slice(0, 4)
        .map((t) => `"${t}"`)
        .join(", ")}`,
    );
  }
  const descHits = tokens(fm.description).filter((t) => t.length >= 4 && promptTokens.has(t));
  text += Math.min(0.5 * new Set(descHits).size, 3);

  // A role match only boosts skills the task text (or the role's own suggestions) already points to.
  let roleScore = 0;
  const hinted = !!o.hints?.includes(r.name);
  if (o.role && fm.roles.includes(o.role)) {
    roleScore += 3;
    reasons.push(`suits the ${o.role} role`);
  }
  if (hinted) {
    roleScore += 4;
    reasons.push("suggested by the agent's role");
  }

  let repo = 0;
  if (o.signals) {
    const g = globHit(fm.globs, o.signals.files);
    if (g) {
      repo += 2;
      reasons.push(`project has ${g}`);
    }
    const words = new Set([...r.name.split("-"), ...fm.tags.flatMap(tokens)]);
    const d = depHits(words, o.signals.deps);
    if (d.length) {
      repo += 2;
      reasons.push(`project uses ${d.join(", ")}`);
    }
  }
  const matched = text > 0 || hinted;
  const score = text + roleScore + (matched ? repo + fm.priority / 50 : 0);
  return { score: Math.round(score * 10) / 10, matched, reasons };
}

export function resolveSkills(records: SkillRecord[], o: ResolveOptions): ResolvedSkill[] {
  const topK = o.topK ?? 3;
  const maxChars = o.maxChars ?? 12_000;
  const minScore = o.minScore ?? 4;
  const out: ResolvedSkill[] = [];
  const chosen = new Set<string>();
  let chars = 0;

  const conflicts = (r: SkillRecord) =>
    out.some(
      (c) =>
        c.record.frontmatter!.conflicts.includes(r.name) ||
        r.frontmatter!.conflicts.includes(c.record.name),
    );

  for (const ref of o.explicit ?? []) {
    const named = records.filter((r) => r.id === ref || r.name === ref);
    const r = named.find((x) => x.usable) ?? named[0];
    if (!r) throw new SkillError("not_found", `no skill named "${ref}" (see vard skills list)`);
    if (r.errors.length)
      throw new SkillError("invalid", `skill "${ref}" is invalid: ${r.errors[0]}`);
    if (r.shadowedBy)
      throw new SkillError("shadowed", `skill "${ref}" is shadowed by ${r.shadowedBy}`);
    if (!r.trusted)
      throw new SkillError(
        "untrusted",
        `project skill "${ref}" isn't trusted yet; trust this project's skills first`,
      );
    if (!r.enabled) throw new SkillError("disabled", `skill "${ref}" is disabled`);
    if (chosen.has(r.id)) continue;
    if (conflicts(r))
      throw new SkillError("invalid", `skill "${ref}" conflicts with another selected skill`);
    chosen.add(r.id);
    chars += r.body.length;
    out.push({
      record: r,
      activation: {
        id: r.id,
        name: r.name,
        source: r.source,
        version: r.frontmatter!.version,
        score: 100,
        reasons: ["explicitly selected"],
        explicit: true,
      },
    });
  }
  if (o.auto === false) return out;

  const promptTokens = new Set(tokens(o.prompt));
  const lowerPrompt = o.prompt.toLowerCase();
  const ranked = records
    .filter((r) => r.usable && !chosen.has(r.id))
    .map((r) => ({ r, ...scoreSkill(r, o, promptTokens, lowerPrompt) }))
    .filter((x) => x.matched && x.score >= minScore)
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.r.frontmatter!.priority - a.r.frontmatter!.priority ||
        a.r.name.localeCompare(b.r.name),
    );

  let auto = 0;
  for (const x of ranked) {
    if (auto >= topK) break;
    if (chars + x.r.body.length > maxChars) continue;
    if (conflicts(x.r)) continue;
    chosen.add(x.r.id);
    chars += x.r.body.length;
    auto++;
    out.push({
      record: x.r,
      activation: {
        id: x.r.id,
        name: x.r.name,
        source: x.r.source,
        version: x.r.frontmatter!.version,
        score: x.score,
        reasons: x.reasons,
        explicit: false,
      },
    });
  }
  return out;
}
