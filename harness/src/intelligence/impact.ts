/**
 * Change impact analysis: what depends on a file or symbol, which tests cover it, what public API
 * it exposes, and how to verify a change. The risk level is computed from counted evidence, and
 * the evidence is part of the report.
 */
import fs from "node:fs";
import path from "node:path";
import { CodeGraph } from "./graph";
import type { CodeIndex } from "./indexer";
import type { CodeSymbol, ImpactReport } from "./schema";

const CONFIG_RE = /(^|\/)(package\.json|tsconfig[\w.-]*\.json|vite\.config\.\w+|next\.config\.\w+|Cargo\.toml|go\.mod|pyproject\.toml|setup\.cfg|\.eslintrc[\w.]*|jest\.config\.\w+|vitest\.config\.\w+)$/;

/** Package root of a path: the nearest folder with a manifest. */
function packageRoot(files: Set<string>, p: string): string {
  for (let d = path.posix.dirname(p); ; d = path.posix.dirname(d)) {
    const dir = d === "." ? "" : d;
    for (const m of ["package.json", "Cargo.toml", "go.mod", "pyproject.toml"]) if (files.has(dir ? `${dir}/${m}` : m)) return dir;
    if (d === "." || d === "/" || !d) return "";
  }
}

export function analyzeImpact(ix: CodeIndex, target: string, o: { depth?: number; verifyHints?: string[] } = {}): ImpactReport {
  const g = new CodeGraph(ix);
  const db = ix.db().db;
  const files = new Set((db.query("SELECT path FROM files").all() as { path: string }[]).map((r) => r.path));
  const notes: string[] = [];
  const clean = target.trim().replace(/^\.\//, "");

  let targetFiles: string[] = [];
  let symbols: CodeSymbol[] = [];
  if (files.has(clean)) targetFiles = [clean];
  else {
    const name = clean.split(/[.:#]/).pop() ?? clean;
    symbols = g.definitions(name, 10);
    if (!symbols.length) symbols = g.symbolSearch(name, 5).filter((s) => s.name.toLowerCase() === name.toLowerCase());
    targetFiles = [...new Set(symbols.map((s) => s.path))];
    if (symbols.length > 1) notes.push(`"${name}" is defined in ${targetFiles.length} place(s); the report covers all of them.`);
  }
  if (!targetFiles.length)
    return { target, resolved: { files: [], symbols: [] }, direct: [], indirect: [], referencing: [], publicApi: [], tests: [], config: [], verify: [], risk: "low", evidence: ["nothing in the index matches this target"], notes: ["Check the name or path, or re-index."] };

  // Direct dependents: importers of the target files (and, for symbols, files referencing them).
  const direct = new Map<string, string>();
  for (const f of targetFiles) for (const d of g.dependents(f)) direct.set(d, `imports ${f}`);
  const referencing: ImpactReport["referencing"] = [];
  for (const s of symbols) {
    for (const r of g.references(s.name, ["call", "type"], 150)) {
      if (targetFiles.includes(r.path) && r.line >= s.line && r.line <= s.endLine) continue;
      referencing.push({ path: r.path, line: r.line, symbol: r.in });
      if (!targetFiles.includes(r.path) && !direct.has(r.path)) direct.set(r.path, `references ${s.name}`);
    }
    if (symbols.length && g.references(s.name).some((r) => r.ambiguous)) notes.push(`References to "${s.name}" are matched by name and may include other definitions.`);
  }
  // For a symbol, files importing the defining file but never using the name are not direct dependents.
  if (symbols.length) {
    const names = new Set(symbols.map((s) => s.name));
    for (const [p, via] of [...direct])
      if (via.startsWith("imports")) {
        const id = g.fileId(p)!;
        const used = (db.query("SELECT COUNT(*) AS n FROM refs WHERE file_id = ? AND name IN (" + [...names].map(() => "?").join(",") + ")").get(id, ...names) as { n: number }).n;
        const importedByName = (db.query("SELECT names FROM imports WHERE file_id = ?").all(id) as { names: string }[]).some((r) => (r.names ?? "").split(",").some((n) => names.has(n) || n === "*"));
        if (!used && !importedByName) direct.delete(p);
      }
  }

  const depth = Math.min(o.depth ?? 3, 5);
  const indirect = g.dependentsDeep([...targetFiles, ...direct.keys()], depth - 1).filter((d) => !direct.has(d.path) && !targetFiles.includes(d.path)).map((d) => ({ path: d.path, depth: d.depth + 1 }));

  const publicApi = symbols.length ? symbols.filter((s) => s.exported) : targetFiles.flatMap((f) => g.outline(f).filter((s) => s.exported && !s.parent && s.kind !== "key"));
  const tests = [...new Set([...targetFiles.flatMap((f) => g.testsFor(f)), ...[...direct.keys(), ...indirect.map((i) => i.path)].filter((p) => g.isTest(p))])].sort();

  const roots = new Set(targetFiles.map((f) => packageRoot(files, f)));
  const config = [...files].filter((f) => CONFIG_RE.test(f) && roots.has(packageRoot(files, f))).slice(0, 10);

  // Verification commands: package scripts near the target, plus remembered project commands.
  const verify: string[] = [];
  for (const r of roots) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(ix.projectRoot, r, "package.json"), "utf8"));
      const prefix = r ? `cd ${r} && ` : "";
      const runner = fs.existsSync(path.join(ix.projectRoot, r, "bun.lock")) || fs.existsSync(path.join(ix.projectRoot, "bun.lock")) ? "bun run" : "npm run";
      for (const s of ["typecheck", "test", "lint", "build"]) if (pkg.scripts?.[s]) verify.push(`${prefix}${runner} ${s}`);
    } catch {}
    if (files.has(r ? `${r}/Cargo.toml` : "Cargo.toml")) verify.push(`${r ? `cd ${r} && ` : ""}cargo test`);
    if (files.has(r ? `${r}/go.mod` : "go.mod")) verify.push(`${r ? `cd ${r} && ` : ""}go test ./...`);
  }
  for (const h of o.verifyHints ?? []) if (!verify.includes(h)) verify.push(h);

  // Evidence-based risk.
  const evidence: string[] = [];
  let points = 0;
  const nd = direct.size;
  evidence.push(`${nd} direct dependent file${nd === 1 ? "" : "s"}`);
  points += nd === 0 ? 0 : nd <= 3 ? 1 : nd <= 10 ? 2 : 3;
  if (indirect.length > 20) {
    points++;
    evidence.push(`${indirect.length} indirect dependents within ${depth} hops`);
  } else evidence.push(`${indirect.length} indirect dependents`);
  const crossPkg = [...direct.keys()].filter((p) => !roots.has(packageRoot(files, p)));
  if (crossPkg.length) {
    points++;
    evidence.push(`used from ${crossPkg.length} file(s) in other packages`);
  }
  if (publicApi.length) evidence.push(`${publicApi.length} exported symbol(s) in scope`);
  if (publicApi.length && nd > 0) points++;
  if (!tests.length) {
    points++;
    evidence.push("no related tests found");
  } else evidence.push(`${tests.length} related test file(s)`);
  const risk = points >= 4 ? "high" : points >= 2 ? "medium" : "low";

  return {
    target,
    resolved: { files: targetFiles, symbols },
    direct: [...direct].map(([p, via]) => ({ path: p, via })).sort((a, b) => a.path.localeCompare(b.path)).slice(0, 100),
    indirect: indirect.sort((a, b) => a.depth - b.depth || a.path.localeCompare(b.path)).slice(0, 100),
    referencing: referencing.slice(0, 100),
    publicApi: publicApi.slice(0, 50),
    tests: tests.slice(0, 200),
    config,
    verify,
    risk,
    evidence,
    notes: [...new Set(notes)],
  };
}

export function renderImpact(r: ImpactReport): string {
  const L: string[] = [];
  L.push(`Impact of changing ${r.target}: risk ${r.risk.toUpperCase()} (${r.evidence.join("; ")})`);
  if (r.resolved.symbols.length) L.push(`Defined at: ${r.resolved.symbols.slice(0, 5).map((s) => `${s.path}:${s.line} (${s.kind})`).join(", ")}`);
  else L.push(`Files: ${r.resolved.files.join(", ")}`);
  if (r.direct.length) L.push(`Direct dependents (${r.direct.length}):\n${r.direct.slice(0, 25).map((d) => `- ${d.path} (${d.via})`).join("\n")}`);
  if (r.indirect.length) L.push(`Indirect (${r.indirect.length}): ${r.indirect.slice(0, 20).map((d) => `${d.path} [${d.depth}]`).join(", ")}`);
  if (r.referencing.length) L.push(`References: ${r.referencing.slice(0, 20).map((x) => `${x.path}:${x.line}${x.symbol ? ` in ${x.symbol}` : ""}`).join(", ")}`);
  if (r.publicApi.length) L.push(`Public API: ${r.publicApi.slice(0, 15).map((s) => `${s.name} (${s.path}:${s.line})`).join(", ")}`);
  L.push(`Tests (${r.tests.length}): ${r.tests.length ? r.tests.slice(0, 30).join(", ") + (r.tests.length > 30 ? ", …" : "") : "none found"}`);
  if (r.config.length) L.push(`Config: ${r.config.join(", ")}`);
  if (r.verify.length) L.push(`Verify with: ${r.verify.join(" · ")}`);
  for (const n of r.notes) L.push(`Note: ${n}`);
  return L.join("\n");
}
