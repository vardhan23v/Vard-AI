/**
 * Which files to index: git's view of the project (tracked + untracked, honouring .gitignore),
 * minus build output, dependencies, lockfiles, large or binary files, the user's excludes and
 * anything that looks like a credential file. Falls back to a directory walk outside git.
 */
import fs from "node:fs";
import path from "node:path";
import { isSensitivePath } from "../memory/secrets";
import { git } from "../util";
import { DEFAULT_EXCLUDED_FILES, DEFAULT_EXCLUDES } from "./config";
import { langOf } from "./languages";
import type { IndexConfig, Lang } from "./schema";

export interface ScannedFile {
  path: string;
  abs: string;
  lang: Lang;
  size: number;
  mtime: number;
}

export interface ScanResult {
  files: ScannedFile[];
  skipped: number;
  truncated: boolean;
}

function excluded(rel: string, extra: string[]): boolean {
  const withSlash = `/${rel}`;
  for (const d of DEFAULT_EXCLUDES) if (rel.startsWith(d) || withSlash.includes(`/${d}`)) return true;
  if (DEFAULT_EXCLUDED_FILES.some((re) => re.test(rel))) return true;
  for (const e of extra) {
    const p = e.replace(/^\.?\//, "");
    if (!p) continue;
    if (/[*?[{]/.test(p)) {
      try {
        if (new Bun.Glob(p).match(rel)) return true;
      } catch {}
    } else if (rel === p || rel.startsWith(p.endsWith("/") ? p : `${p}/`)) return true;
  }
  return isSensitivePath(rel);
}

async function listPaths(root: string): Promise<string[]> {
  const r = await git(root, ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], 30_000).catch(() => null);
  if (r && r.code === 0) return r.stdout.split("\0").filter(Boolean);
  const out: string[] = [];
  const walk = (dir: string, rel: string) => {
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.isSymbolicLink()) continue;
      const r2 = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (!excluded(`${r2}/`, [])) walk(path.join(dir, e.name), r2);
      } else if (e.isFile()) out.push(r2);
      if (out.length > 600_000) return;
    }
  };
  walk(root, "");
  return out;
}

export async function scanProject(root: string, cfg: IndexConfig): Promise<ScanResult> {
  const files: ScannedFile[] = [];
  let skipped = 0;
  let truncated = false;
  for (const rel of (await listPaths(root)).sort()) {
    const lang = langOf(rel);
    if (!lang || excluded(rel, cfg.exclude)) continue;
    const abs = path.join(root, rel);
    let st: fs.Stats;
    try {
      st = fs.lstatSync(abs);
    } catch {
      continue; // deleted but still in the git index
    }
    if (!st.isFile()) continue;
    if (st.size > cfg.maxFileBytes) {
      skipped++;
      continue;
    }
    if (files.length >= cfg.maxFiles) {
      truncated = true;
      break;
    }
    files.push({ path: rel, abs, lang, size: st.size, mtime: Math.floor(st.mtimeMs) });
  }
  return { files, skipped, truncated };
}

/** True for files that contain NUL bytes in their first 8 KB (binary). */
export function looksBinary(buf: Uint8Array): boolean {
  const n = Math.min(buf.length, 8192);
  for (let i = 0; i < n; i++) if (buf[i] === 0) return true;
  return false;
}
