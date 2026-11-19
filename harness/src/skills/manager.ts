/**
 * Creating, editing, importing and deleting skills on disk. Every write is validated first;
 * imports copy only regular files (no symlinks) within size limits and start disabled, so a
 * downloaded skill never becomes active without the user turning it on.
 */
import fs from "node:fs";
import path from "node:path";
import { ensureVardDir } from "../policy";
import { isInside } from "../util";
import { SkillError } from "./errors";
import { MAX_SKILL_BYTES } from "./parser";
import type { SkillRegistry } from "./registry";
import type { SkillChange, SkillSource } from "./schema";
import { isSafeRelPath, MAX_RESOURCE_BYTES, validateSkillText } from "./validator";

const MAX_IMPORT_FILES = 200;
const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

export function skillTemplate(name: string, description: string): string {
  return `---
name: ${name}
description: ${JSON.stringify(description)}
version: 1.0.0
tags: []
triggers: []
roles: []
---

# ${name.replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase())}

## Instructions

- Follow the project's existing conventions.
- 

## Workflow

1. Inspect the relevant code.
2. Make the change.
3. Run the tests and review the diff.
`;
}

function rootFor(reg: SkillRegistry, scope: "global" | "project"): string {
  if (scope === "global") return reg.globalDir;
  if (!reg.projectRoot) throw new SkillError("invalid", "Choose a project for project skills.");
  ensureVardDir(reg.projectRoot);
  return reg.projectDir!;
}

function writeAtomic(file: string, text: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}

/** Vard edited the project's skills itself: keep them trusted if they were. */
function keepTrust(reg: SkillRegistry, scope: string, wasTrusted: boolean) {
  if (scope === "project" && wasTrusted) reg.setTrusted(true);
  else reg.reload();
}

export interface ApplyResult {
  id?: string;
  validation?: { valid: boolean; errors: string[]; warnings: string[]; name?: string };
}

export function applySkillChange(reg: SkillRegistry, c: SkillChange): ApplyResult {
  switch (c.op) {
    case "reload":
      reg.reload();
      return {};
    case "validate": {
      const v = validateSkillText(c.text);
      return { validation: { valid: !v.errors.length, errors: v.errors, warnings: v.warnings, name: v.frontmatter?.name } };
    }
    case "trust":
      reg.setTrusted(c.trusted);
      return {};
    case "enable":
      reg.setEnabled(c.id, c.enabled);
      return {};
    case "create": {
      const root = rootFor(reg, c.scope);
      const dir = path.join(root, c.name);
      if (fs.existsSync(dir)) throw new SkillError("exists", `a ${c.scope} skill named "${c.name}" already exists`);
      // Creating a skill in Vard is the user's own change: keep (or, for the first one, grant) trust.
      const wasTrusted = c.scope === "project" && (reg.projectTrusted() || isOnlyProjectSkill(reg));
      writeAtomic(path.join(dir, "SKILL.md"), skillTemplate(c.name, c.description));
      keepTrust(reg, c.scope, wasTrusted);
      return { id: `${c.scope}:${c.name}` };
    }
    case "save": {
      const v = validateSkillText(c.text, { folderName: c.name });
      if (v.errors.length) throw new SkillError("invalid", v.errors.join("; "));
      if (Buffer.byteLength(c.text) > MAX_SKILL_BYTES) throw new SkillError("too_large", "SKILL.md is larger than 64 KB");
      const root = rootFor(reg, c.scope);
      const dir = path.join(root, c.name);
      // Script paths must exist once the file is on disk.
      const onDisk = validateSkillText(c.text, { folderName: c.name, dir: fs.existsSync(dir) ? dir : undefined });
      if (fs.existsSync(dir) && onDisk.errors.length) throw new SkillError("invalid", onDisk.errors.join("; "));
      const wasTrusted = c.scope === "project" && (reg.projectTrusted() || isOnlyProjectSkill(reg, c.name));
      writeAtomic(path.join(dir, "SKILL.md"), c.text);
      keepTrust(reg, c.scope, wasTrusted);
      return { id: `${c.scope}:${c.name}` };
    }
    case "import":
      return { id: importSkill(reg, c.scope, c.from) };
    case "delete": {
      const r = reg.find(c.id);
      if (!r) throw new SkillError("not_found", `no skill "${c.id}"`);
      if (r.source === "builtin") throw new SkillError("invalid", "built-in skills can't be deleted; disable them instead");
      const root = r.source === "global" ? reg.globalDir : reg.projectDir!;
      const dir = r.dir!;
      if (!isInside(path.resolve(dir), path.resolve(root)) || path.resolve(dir) === path.resolve(root))
        throw new SkillError("path", "refusing to delete outside the skills folder");
      const wasTrusted = r.source === "project" && reg.projectTrusted();
      fs.rmSync(dir, { recursive: true, force: true });
      keepTrust(reg, r.source, wasTrusted);
      return { id: r.id };
    }
  }
}

/** True when the project has no skills yet besides (optionally) `name`: creating the first one in Vard trusts it. */
function isOnlyProjectSkill(reg: SkillRegistry, name?: string): boolean {
  const dir = reg.projectDir;
  if (!dir || !fs.existsSync(dir)) return true;
  return fs.readdirSync(dir).filter((n) => !n.startsWith(".") && n !== name).length === 0;
}

/** Copies a skill folder (or a lone SKILL.md) into the global or project skills folder, disabled. */
export function importSkill(reg: SkillRegistry, scope: "global" | "project", from: string): string {
  const src = path.resolve(from.replace(/^~(?=$|\/)/, process.env.HOME ?? "~"));
  let st: fs.Stats;
  try {
    st = fs.lstatSync(src);
  } catch {
    throw new SkillError("not_found", `nothing at ${from}`);
  }
  if (st.isSymbolicLink()) throw new SkillError("path", "import a real folder or file, not a symlink");
  const srcDir = st.isDirectory() ? src : path.dirname(src);
  const skillFile = st.isDirectory() ? path.join(src, "SKILL.md") : src;
  if (path.basename(skillFile) !== "SKILL.md" && st.isFile() && !skillFile.endsWith(".md"))
    throw new SkillError("invalid", "choose a skill folder or a SKILL.md file");
  let text: string;
  try {
    if (fs.statSync(skillFile).size > MAX_SKILL_BYTES) throw new SkillError("too_large", "SKILL.md is larger than 64 KB");
    text = fs.readFileSync(skillFile, "utf8");
  } catch (e) {
    if (e instanceof SkillError) throw e;
    throw new SkillError("not_found", `no SKILL.md in ${from}`);
  }
  const v = validateSkillText(text);
  if (!v.frontmatter) throw new SkillError("invalid", v.errors.join("; ") || "invalid SKILL.md");
  const name = v.frontmatter.name;
  if (v.errors.length) throw new SkillError("invalid", v.errors.join("; "));
  const root = rootFor(reg, scope);
  const dest = path.join(root, name);
  if (fs.existsSync(dest)) throw new SkillError("exists", `a ${scope} skill named "${name}" already exists`);

  // Collect files to copy: SKILL.md plus references/, scripts/, assets/ when importing a folder.
  const files: { rel: string; abs: string }[] = [{ rel: "SKILL.md", abs: skillFile }];
  let bytes = Buffer.byteLength(text);
  if (st.isDirectory()) {
    const walk = (dir: string, rel: string, depth: number) => {
      if (depth > 4) return;
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.name.startsWith(".")) continue;
        const r = `${rel}/${e.name}`;
        if (!isSafeRelPath(r)) continue;
        if (e.isSymbolicLink()) throw new SkillError("path", `"${r}" is a symlink; skills can't contain links`);
        const abs = path.join(dir, e.name);
        if (e.isDirectory()) walk(abs, r, depth + 1);
        else if (e.isFile()) {
          const size = fs.statSync(abs).size;
          if (size > MAX_RESOURCE_BYTES) throw new SkillError("too_large", `"${r}" is larger than 256 KB`);
          bytes += size;
          files.push({ rel: r, abs });
          if (files.length > MAX_IMPORT_FILES || bytes > MAX_IMPORT_BYTES)
            throw new SkillError("too_large", "the skill has too many or too large files (limit 200 files, 5 MB)");
        }
      }
    };
    for (const kind of ["references", "scripts", "assets"]) {
      const d = path.join(srcDir, kind);
      if (fs.existsSync(d)) {
        if (fs.lstatSync(d).isSymbolicLink()) throw new SkillError("path", `"${kind}" is a symlink`);
        walk(d, kind, 0);
      }
    }
  }
  const tmp = `${dest}.importing-${process.pid}`;
  try {
    for (const f of files) {
      const out = path.join(tmp, f.rel);
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.copyFileSync(f.abs, out);
    }
    const check = validateSkillText(text, { dir: tmp, folderName: name });
    if (check.errors.length) throw new SkillError("invalid", check.errors.join("; "));
    reg.disableByKey(scope, name);
    const wasTrusted = scope === "project" && reg.projectTrusted();
    fs.renameSync(tmp, dest);
    keepTrust(reg, scope, wasTrusted);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  return `${scope}:${name}`;
}

export const sourceLabel = (s: SkillSource) => (s === "builtin" ? "built-in" : s);
