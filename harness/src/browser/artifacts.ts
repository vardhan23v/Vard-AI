/**
 * Browser artifacts (screenshots, reports, logs) live in <project>/.vard/artifacts/<run>/.
 * Nothing here is deleted automatically; cleanup happens only when the user asks.
 */
import fs from "node:fs";
import path from "node:path";
import { ensureVardDir } from "../policy";
import { BrowserError } from "./errors";

export const MAX_ARTIFACT_READ = 8 * 1024 * 1024;

export const artifactsRoot = (projectRoot: string) => path.join(projectRoot, ".vard", "artifacts");

export function runDir(projectRoot: string, run: string): string {
  ensureVardDir(projectRoot);
  const safe = run.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 120) || "browser";
  const dir = path.join(artifactsRoot(projectRoot), safe);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export interface ArtifactInfo {
  path: string;
  run: string;
  name: string;
  bytes: number;
  at: number;
}

export function listArtifacts(projectRoot: string, run?: string): ArtifactInfo[] {
  const root = artifactsRoot(projectRoot);
  const out: ArtifactInfo[] = [];
  let runs: string[] = [];
  try {
    runs = run ? [run] : fs.readdirSync(root);
  } catch {
    return [];
  }
  for (const r of runs) {
    let names: string[] = [];
    try {
      names = fs.readdirSync(path.join(root, r));
    } catch {
      continue;
    }
    for (const n of names) {
      const p = path.join(root, r, n);
      try {
        const st = fs.lstatSync(p);
        if (st.isFile()) out.push({ path: p, run: r, name: n, bytes: st.size, at: st.mtimeMs });
      } catch {}
    }
  }
  return out.sort((a, b) => b.at - a.at);
}

/** Reads an artifact for the UI: only files under .vard/artifacts, never through symlinks, max 8 MB. */
export function readArtifact(projectRoot: string, file: string): { data: string; mediaType: string; bytes: number } {
  const root = fs.realpathSync(artifactsRoot(projectRoot));
  let real: string;
  try {
    real = fs.realpathSync(path.resolve(root, file));
  } catch {
    throw new BrowserError("not_found", "no such artifact");
  }
  if (!real.startsWith(root + path.sep)) throw new BrowserError("blocked", "only files in .vard/artifacts can be read");
  const st = fs.statSync(real);
  if (!st.isFile()) throw new BrowserError("not_found", "not a file");
  if (st.size > MAX_ARTIFACT_READ) throw new BrowserError("blocked", "artifact is larger than 8 MB");
  const ext = path.extname(real).toLowerCase();
  const mediaType = ext === ".png" ? "image/png" : ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : ext === ".json" ? "application/json" : "text/plain";
  return { data: fs.readFileSync(real).toString("base64"), mediaType, bytes: st.size };
}

/** Deletes artifacts the user chose: one run, runs older than N days, or everything. */
export function cleanArtifacts(projectRoot: string, o: { run?: string; olderThanDays?: number } = {}): { removed: number; bytes: number } {
  let removed = 0;
  let bytes = 0;
  const cutoff = o.olderThanDays !== undefined ? Date.now() - o.olderThanDays * 86_400_000 : Infinity;
  for (const a of listArtifacts(projectRoot, o.run)) {
    if (o.olderThanDays !== undefined && a.at > cutoff) continue;
    fs.rmSync(a.path, { force: true });
    removed++;
    bytes += a.bytes;
  }
  // Remove now-empty run folders.
  try {
    for (const r of fs.readdirSync(artifactsRoot(projectRoot))) {
      const d = path.join(artifactsRoot(projectRoot), r);
      if (fs.statSync(d).isDirectory() && !fs.readdirSync(d).length) fs.rmdirSync(d);
    }
  } catch {}
  return { removed, bytes };
}
