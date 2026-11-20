/**
 * Skill types shared by the harness, the CLI and the app (imported through protocol.ts).
 * No Node imports here: the WebView typechecks this file.
 *
 * A skill is a folder with a SKILL.md (YAML frontmatter + Markdown instructions) and optional
 * references/, scripts/ and assets/ folders. Skills come from three places: built into Vard,
 * the user's global folder (~/.vard/skills) and a project's .vard/skills folder.
 */
import { z } from "zod";

export const SkillSource = z.enum(["builtin", "global", "project"]);
export type SkillSource = z.infer<typeof SkillSource>;

export const SKILL_NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const SkillName = z
  .string()
  .max(64, "at most 64 characters")
  .regex(SKILL_NAME_RE, "lowercase letters, digits and single hyphens (kebab-case)");

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

export const SkillScript = z.object({
  name: z
    .string()
    .regex(/^[a-z0-9][a-z0-9_-]{0,39}$/, "script names are lowercase, digits, '-' or '_'"),
  file: z.string().min(1).max(200),
  description: z.string().max(300).default(""),
});
export type SkillScript = z.infer<typeof SkillScript>;

const shortList = (max: number, len: number) =>
  z.array(z.string().min(1).max(len)).max(max).default([]);

/** SKILL.md frontmatter. Unknown keys (license, metadata, …) are ignored so other formats import. */
export const SkillFrontmatter = z.object({
  name: SkillName,
  description: z.string().min(1, "a description is required").max(500),
  version: z.string().regex(SEMVER, "use a semantic version such as 1.0.0").default("1.0.0"),
  tags: shortList(20, 40),
  /** Words or phrases in a task that make this skill relevant. */
  triggers: shortList(40, 60),
  /** File patterns that make this skill relevant for a repository (e.g. "src/**.tsx"). */
  globs: shortList(20, 200),
  /** Agent roles this skill suits (frontend, backend, database, testing, reviewer, planner). */
  roles: shortList(10, 40),
  /** 0–100; breaks ties and orders the context. */
  priority: z.number().int().min(0).max(100).default(50),
  /** Skills that must not be active together with this one. */
  conflicts: z.array(SkillName).max(20).default([]),
  /** Scripts the agent may ask to run (always with the user's approval). */
  scripts: z.array(SkillScript).max(20).default([]),
});
export type SkillFrontmatter = z.infer<typeof SkillFrontmatter>;

export const SkillResources = z.object({
  references: z.array(z.string()),
  scripts: z.array(z.string()),
  assets: z.array(z.string()),
});
export type SkillResources = z.infer<typeof SkillResources>;

/** One skill as listed in the UI and CLI. */
export const SkillSummary = z.object({
  /** "<source>:<name>"; project skills are scoped to the project being listed. */
  id: z.string(),
  name: z.string(),
  description: z.string(),
  version: z.string(),
  source: SkillSource,
  tags: z.array(z.string()),
  triggers: z.array(z.string()),
  globs: z.array(z.string()),
  roles: z.array(z.string()),
  priority: z.number(),
  conflicts: z.array(z.string()),
  scripts: z.array(SkillScript),
  /** Folder on disk (absent for built-ins). */
  path: z.string().optional(),
  enabled: z.boolean(),
  /** Project skills need the user's trust; built-in and global skills are trusted. */
  trusted: z.boolean(),
  valid: z.boolean(),
  errors: z.array(z.string()),
  warnings: z.array(z.string()),
  /** Set when a skill with the same name from a higher-precedence source wins. */
  shadowedBy: z.string().optional(),
  resources: SkillResources,
  /** Size of the instructions, in characters. */
  chars: z.number(),
  usage: z.object({ count: z.number(), lastUsedAt: z.number().optional() }),
});
export type SkillSummary = z.infer<typeof SkillSummary>;

export const SkillUsage = z.object({
  skillId: z.string(),
  at: z.number(),
  taskId: z.string(),
  agentId: z.string().optional(),
  role: z.string().optional(),
  how: z.enum(["auto", "explicit", "resource", "script"]),
  projectRoot: z.string().optional(),
});
export type SkillUsage = z.infer<typeof SkillUsage>;

/** A skill chosen for a task (or one agent of a team run), and why. */
export const ActivatedSkill = z.object({
  id: z.string(),
  name: z.string(),
  source: SkillSource,
  version: z.string(),
  score: z.number(),
  reasons: z.array(z.string()),
  explicit: z.boolean(),
});
export type ActivatedSkill = z.infer<typeof ActivatedSkill>;

const scope = z.enum(["global", "project"]);
const skillId = z.string().min(3).max(200);

export const SkillChange = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("create"),
    scope,
    name: SkillName,
    description: z.string().min(1).max(500),
  }),
  /** Write a skill's SKILL.md (creates the folder when new). */
  z.object({ op: z.literal("save"), scope, name: SkillName, text: z.string().min(1).max(70_000) }),
  /** Copy a skill folder (or a SKILL.md file) from disk. Imported skills start disabled. */
  z.object({ op: z.literal("import"), scope, from: z.string().min(1).max(4000) }),
  z.object({ op: z.literal("delete"), id: skillId }),
  z.object({ op: z.literal("enable"), id: skillId, enabled: z.boolean() }),
  z.object({ op: z.literal("trust"), trusted: z.boolean() }),
  z.object({ op: z.literal("reload") }),
  z.object({ op: z.literal("validate"), text: z.string().max(70_000) }),
]);
export type SkillChange = z.infer<typeof SkillChange>;
