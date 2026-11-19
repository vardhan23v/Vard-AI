/** A compact architecture summary from the index: languages, folders, entry points, hubs, packages. */
import { CodeGraph } from "./graph";
import type { CodeIndex } from "./indexer";

export interface Architecture {
  languages: Record<string, number>;
  folders: { path: string; files: number; langs: string[] }[];
  entryPoints: string[];
  hubs: { path: string; importedBy: number }[];
  packages: { name: string; files: number }[];
  manifests: string[];
}

const ENTRY = /(^|\/)(main|index|app|server|cli|bin|lib|mod)\.(ts|tsx|js|jsx|mjs|rs|go|py)$|(^|\/)__main__\.py$|(^|\/)src\/main\.rs$/;

export function architecture(ix: CodeIndex): Architecture {
  const db = ix.db().db;
  const g = new CodeGraph(ix);
  const files = db.query("SELECT path, lang, test FROM files").all() as { path: string; lang: string; test: number }[];
  const languages: Record<string, number> = {};
  const folders = new Map<string, { files: number; langs: Set<string> }>();
  for (const f of files) {
    if (f.lang !== "json" && f.lang !== "markdown") languages[f.lang] = (languages[f.lang] ?? 0) + 1;
    const segs = f.path.split("/");
    const key = segs.length > 2 ? segs.slice(0, 2).join("/") : segs.length === 2 ? segs[0] : ".";
    const e = folders.get(key) ?? { files: 0, langs: new Set<string>() };
    e.files++;
    e.langs.add(f.lang);
    folders.set(key, e);
  }
  return {
    languages,
    folders: [...folders].sort((a, b) => b[1].files - a[1].files).slice(0, 20).map(([path, e]) => ({ path, files: e.files, langs: [...e.langs].filter((l) => l !== "json" && l !== "markdown") })),
    entryPoints: files.filter((f) => !f.test && ENTRY.test(f.path) && f.path.split("/").length <= 4).map((f) => f.path).slice(0, 15),
    hubs: g.topImported(10).map((h) => ({ path: h.path, importedBy: h.n })),
    packages: g.packages(25),
    manifests: files.filter((f) => /(^|\/)(package\.json|Cargo\.toml|go\.mod|pyproject\.toml|pom\.xml)$/.test(f.path)).map((f) => f.path).slice(0, 15),
  };
}

export function renderArchitecture(a: Architecture, maxChars = 4_000): string {
  const L = [
    `Languages: ${Object.entries(a.languages).sort((x, y) => y[1] - x[1]).map(([l, n]) => `${l} ${n}`).join(", ") || "none indexed"}`,
    `Folders: ${a.folders.map((f) => `${f.path} (${f.files}${f.langs.length ? `, ${f.langs.join("/")}` : ""})`).join("; ")}`,
    a.manifests.length ? `Manifests: ${a.manifests.join(", ")}` : "",
    a.entryPoints.length ? `Entry points: ${a.entryPoints.join(", ")}` : "",
    a.hubs.length ? `Most imported: ${a.hubs.map((h) => `${h.path} (${h.importedBy})`).join(", ")}` : "",
    a.packages.length ? `External packages: ${a.packages.slice(0, 15).map((p) => p.name).join(", ")}` : "",
  ].filter(Boolean);
  const s = L.join("\n");
  return s.length > maxChars ? `${s.slice(0, maxChars - 1)}…` : s;
}
