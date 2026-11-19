/** Per-project index settings: <project>/.vard/index/config.json. */
import fs from "node:fs";
import path from "node:path";
import { ensureVardDir } from "../policy";
import { IndexConfig } from "./schema";

export const indexDir = (projectRoot: string) => path.join(projectRoot, ".vard", "index");

export function loadIndexConfig(projectRoot: string): IndexConfig {
  try {
    const r = IndexConfig.safeParse(JSON.parse(fs.readFileSync(path.join(indexDir(projectRoot), "config.json"), "utf8")));
    if (r.success) return r.data;
  } catch {}
  return IndexConfig.parse({});
}

export function saveIndexConfig(projectRoot: string, patch: Partial<IndexConfig>): IndexConfig {
  const next = IndexConfig.parse({ ...loadIndexConfig(projectRoot), ...patch });
  ensureVardDir(projectRoot);
  fs.mkdirSync(indexDir(projectRoot), { recursive: true });
  const file = path.join(indexDir(projectRoot), "config.json");
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2) + "\n");
  fs.renameSync(tmp, file);
  return next;
}

/** Folders and files never indexed (build output, dependencies, lockfiles, generated maps). */
export const DEFAULT_EXCLUDES = [
  "node_modules/",
  "dist/",
  "build/",
  "out/",
  "target/",
  ".next/",
  ".nuxt/",
  ".svelte-kit/",
  ".output/",
  "coverage/",
  "vendor/",
  ".venv/",
  "venv/",
  "__pycache__/",
  ".git/",
  ".vard/",
  ".turbo/",
  ".cache/",
];
export const DEFAULT_EXCLUDED_FILES = [/\.min\.(js|css)$/, /\.map$/, /(^|\/)(package-lock\.json|bun\.lockb?|yarn\.lock|pnpm-lock\.yaml|Cargo\.lock|poetry\.lock|go\.sum)$/];
