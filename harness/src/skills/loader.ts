/**
 * Finds skills on disk (global and project folders) and in the binary (built-ins).
 * Only SKILL.md is read up front; references/, scripts/ and assets/ are listed, not read.
 */
import fs from "node:fs";
import path from "node:path";
import { BUILTIN_SKILLS } from "./builtin";
import { MAX_SKILL_BYTES } from "./parser";
import type { SkillFrontmatter, SkillResources, SkillSource } from "./schema";
import { isSafeRelPath, validateSkillText } from "./validator";

const RESOURCE_DIRS = ["references", "scripts", "assets"] as const;
const MAX_RESOURCES = 200;
const MAX_SKILLS_PER_ROOT = 200;

export interface LoadedSkill {
  name: string;
  source: SkillSource;
  /** Folder on disk; undefined for built-ins. */
  dir?: string;
  text: string;
  frontmatter?: SkillFrontmatter;
  body: string;
  errors: string[];
  warnings: string[];
  resources: SkillResources;
}

const emptyResources = (): SkillResources => ({ references: [], scripts: [], assets: [] });

/** Lists files under references/, scripts/ and assets/ (no symlinks, bounded). */
export function listResources(dir: string): SkillResources {
  const out = emptyResources();
  let count = 0;
  for (const kind of RESOURCE_DIRS) {
    const walk = (abs: string, rel: string, depth: number) => {
      if (depth > 4 || count >= MAX_RESOURCES) return;
      let entries: fs.Dirent[] = [];
      try {
        entries = fs.readdirSync(abs, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
        if (e.name.startsWith(".") || e.isSymbolicLink()) continue;
        const r = `${rel}/${e.name}`;
        if (e.isDirectory()) walk(path.join(abs, e.name), r, depth + 1);
        else if (e.isFile() && count < MAX_RESOURCES) {
          out[kind].push(r);
          count++;
        }
      }
    };
    walk(path.join(dir, kind), kind, 0);
  }
  return out;
}

export function loadSkillDir(dir: string, source: SkillSource): LoadedSkill {
  const folder = path.basename(dir);
  const base = { name: folder, source, dir, resources: emptyResources() };
  const file = path.join(dir, "SKILL.md");
  let text = "";
  try {
    const st = fs.lstatSync(file);
    if (st.isSymbolicLink()) return { ...base, text, body: "", errors: ["SKILL.md is a symlink; copy the file instead"], warnings: [] };
    if (st.size > MAX_SKILL_BYTES) return { ...base, text, body: "", errors: [`SKILL.md is larger than ${MAX_SKILL_BYTES / 1024} KB`], warnings: [] };
    text = fs.readFileSync(file, "utf8");
  } catch {
    return { ...base, text, body: "", errors: ["SKILL.md is missing"], warnings: [] };
  }
  const v = validateSkillText(text, { dir, folderName: folder });
  return { ...base, name: v.frontmatter?.name ?? folder, text, ...v, resources: listResources(dir) };
}

/** Every skill folder directly under `root` (a folder containing SKILL.md). Symlinked folders are skipped. */
export function loadRoot(root: string, source: SkillSource): LoadedSkill[] {
  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: LoadedSkill[] = [];
  for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (out.length >= MAX_SKILLS_PER_ROOT) break;
    if (e.name.startsWith(".") || !isSafeRelPath(e.name)) continue;
    const dir = path.join(root, e.name);
    if (e.isSymbolicLink()) {
      out.push({ name: e.name, source, dir, text: "", body: "", errors: ["skill folders must not be symlinks"], warnings: [], resources: emptyResources() });
      continue;
    }
    if (!e.isDirectory() || !fs.existsSync(path.join(dir, "SKILL.md"))) continue;
    out.push(loadSkillDir(dir, source));
  }
  return out;
}

export function loadBuiltins(): LoadedSkill[] {
  return Object.entries(BUILTIN_SKILLS).map(([folder, text]) => {
    const v = validateSkillText(text, { folderName: folder });
    return { name: v.frontmatter?.name ?? folder, source: "builtin" as const, text, ...v, resources: emptyResources() };
  });
}

export const globalSkillsDir = (home: string) => path.join(home, "skills");
export const projectSkillsDir = (projectRoot: string) => path.join(projectRoot, ".vard", "skills");
