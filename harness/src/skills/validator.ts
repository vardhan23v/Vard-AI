/**
 * Validates a skill: frontmatter schema, safe resource paths, size and secrets.
 * Skill text goes into model context and the UI, so anything that looks like a credential makes
 * the skill invalid, and every path a skill names must stay inside the skill's own folder.
 */
import fs from "node:fs";
import path from "node:path";
import { findSecret } from "../memory/secrets";
import { isInside } from "../util";
import { SkillError } from "./errors";
import { parseSkillFile } from "./parser";
import { SkillFrontmatter } from "./schema";

export const MAX_RESOURCE_BYTES = 256 * 1024;

export interface SkillValidation {
  frontmatter?: SkillFrontmatter;
  body: string;
  errors: string[];
  warnings: string[];
}

/** A relative path that cannot leave its folder by construction. */
export function isSafeRelPath(p: string): boolean {
  if (!p || p.length > 300) return false;
  if (p.includes("\0") || p.includes("\\")) return false;
  if (path.isAbsolute(p) || p.startsWith("~")) return false;
  return !p.split("/").some((seg) => seg === ".." || seg === "");
}

/**
 * Resolves `rel` inside `dir`, following symlinks, and refuses anything that ends up outside it
 * or isn't a regular file. Throws SkillError("path").
 */
export function resolveInsideSkill(dir: string, rel: string): string {
  if (!isSafeRelPath(rel))
    throw new SkillError(
      "path",
      `unsafe path "${rel}": use a relative path inside the skill folder`,
    );
  let root: string;
  try {
    root = fs.realpathSync(dir);
  } catch {
    throw new SkillError("not_found", `skill folder not found: ${dir}`);
  }
  const abs = path.resolve(root, rel);
  let real: string;
  try {
    real = fs.realpathSync(abs);
  } catch {
    throw new SkillError("not_found", `"${rel}" does not exist in the skill`);
  }
  if (!isInside(real, root))
    throw new SkillError("path", `"${rel}" points outside the skill folder`);
  if (!fs.statSync(real).isFile()) throw new SkillError("path", `"${rel}" is not a file`);
  return real;
}

export function validateSkillText(
  text: string,
  opts: { dir?: string; folderName?: string } = {},
): SkillValidation {
  const parsed = parseSkillFile(text);
  const errors = [...parsed.errors];
  const warnings: string[] = [];
  if (errors.length) return { body: parsed.body, errors, warnings };

  const r = SkillFrontmatter.safeParse(parsed.data);
  if (!r.success) {
    for (const i of r.error.issues)
      errors.push(
        `${i.path.join(".") || "frontmatter"}: ${/received undefined/.test(i.message) ? "is required" : i.message}`,
      );
    return { body: parsed.body, errors, warnings };
  }
  const fm = r.data;
  if (!("version" in parsed.data)) warnings.push("no version given; using 1.0.0");
  if (opts.folderName && opts.folderName !== fm.name)
    errors.push(`name "${fm.name}" must match the folder name "${opts.folderName}"`);
  if (!parsed.body.trim())
    errors.push("the instructions (Markdown after the frontmatter) are empty");
  if (fm.conflicts.includes(fm.name)) errors.push("a skill cannot conflict with itself");
  const names = new Set<string>();
  for (const s of fm.scripts) {
    if (names.has(s.name)) errors.push(`scripts: duplicate name "${s.name}"`);
    names.add(s.name);
    if (!isSafeRelPath(s.file)) {
      errors.push(`scripts.${s.name}: unsafe path "${s.file}"`);
      continue;
    }
    if (opts.dir) {
      try {
        const abs = resolveInsideSkill(opts.dir, s.file);
        if (fs.statSync(abs).size > MAX_RESOURCE_BYTES)
          errors.push(`scripts.${s.name}: file is larger than 256 KB`);
      } catch (e) {
        errors.push(`scripts.${s.name}: ${(e as Error).message}`);
      }
    }
  }
  for (const g of fm.globs)
    if (g.startsWith("/") || g.includes(".."))
      errors.push(`globs: "${g}" must be relative to the project`);

  const secret = findSecret(text);
  if (secret) errors.push(`contains what looks like ${secret}; skills must not hold credentials`);

  return { frontmatter: fm, body: parsed.body, errors, warnings };
}
