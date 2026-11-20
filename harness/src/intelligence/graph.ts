/**
 * Lookups over the index: definitions, references, callers, outlines, file dependencies and
 * dependents, packages, and graph views for the UI. Call relationships are matched by name
 * (resolved through imports where possible), so they are best effort, especially for dynamic code.
 */
import type { CodeIndex } from "./indexer";
import type { CodeSymbol, GraphData } from "./schema";

type Row = Record<string, any>;

const toSymbol = (r: Row): CodeSymbol => ({
  name: r.name,
  kind: r.kind,
  path: r.path,
  line: r.start_line,
  endLine: r.end_line,
  exported: !!r.exported,
  parent: r.parent ?? undefined,
  signature: r.signature ?? undefined,
});

export class CodeGraph {
  constructor(private ix: CodeIndex) {}
  private get db() {
    return this.ix.db().db;
  }

  fileId(path: string): number | undefined {
    return (this.db.query("SELECT id FROM files WHERE path = ?").get(path) as Row | null)?.id;
  }

  isTest(path: string): boolean {
    return !!(this.db.query("SELECT test FROM files WHERE path = ?").get(path) as Row | null)?.test;
  }

  definitions(name: string, limit = 20): CodeSymbol[] {
    return (
      this.db
        .query(
          "SELECT s.*, f.path FROM symbols s JOIN files f ON f.id = s.file_id WHERE s.name = ? ORDER BY s.exported DESC, f.test ASC, length(f.path) LIMIT ?",
        )
        .all(name, limit) as Row[]
    ).map(toSymbol);
  }

  symbolSearch(q: string, limit = 30): CodeSymbol[] {
    const like = `%${q.replace(/[%_]/g, "")}%`;
    return (
      this.db
        .query(
          `SELECT s.*, f.path FROM symbols s JOIN files f ON f.id = s.file_id WHERE s.name LIKE ? AND s.kind NOT IN ('key', 'heading')
           ORDER BY (s.name = ?) DESC, s.exported DESC, length(s.name), f.test ASC LIMIT ?`,
        )
        .all(like, q, limit) as Row[]
    ).map(toSymbol);
  }

  outline(path: string): CodeSymbol[] {
    return (
      this.db
        .query(
          "SELECT s.*, f.path FROM symbols s JOIN files f ON f.id = s.file_id WHERE f.path = ? ORDER BY s.start_line",
        )
        .all(path) as Row[]
    ).map(toSymbol);
  }

  /** The definition enclosing a line (the innermost one). */
  enclosing(fileId: number, line: number): string | undefined {
    const r = this.db
      .query(
        "SELECT name, parent FROM symbols WHERE file_id = ? AND start_line <= ? AND end_line >= ? AND kind NOT IN ('variable', 'key') ORDER BY (end_line - start_line) LIMIT 1",
      )
      .get(fileId, line, line) as Row | null;
    return r ? (r.parent ? `${r.parent}.${r.name}` : r.name) : undefined;
  }

  /** Files that define `name` (used to keep name-matched references to the right definition). */
  private definingFiles(name: string): Set<number> {
    return new Set(
      (this.db.query("SELECT DISTINCT file_id FROM symbols WHERE name = ?").all(name) as Row[]).map(
        (r) => r.file_id,
      ),
    );
  }

  /**
   * References by name. When the name is defined in exactly one file, only files that define it
   * or import that file count; otherwise every name match is returned (labelled ambiguous).
   */
  references(
    name: string,
    kinds: ("call" | "type")[] = ["call", "type"],
    limit = 200,
  ): { path: string; line: number; kind: string; in?: string; ambiguous: boolean }[] {
    const defs = this.definingFiles(name);
    const rows = this.db
      .query(
        `SELECT r.file_id, r.line, r.kind, f.path FROM refs r JOIN files f ON f.id = r.file_id WHERE r.name = ? AND r.kind IN (${kinds.map(() => "?").join(",")}) ORDER BY f.path, r.line LIMIT ?`,
      )
      .all(name, ...kinds, limit * 3) as Row[];
    let importers: Set<number> | null = null;
    if (defs.size === 1) {
      const [def] = defs;
      importers = new Set(
        (
          this.db
            .query("SELECT DISTINCT file_id FROM imports WHERE target_id = ?")
            .all(def) as Row[]
        ).map((r) => r.file_id),
      );
      importers.add(def);
    }
    return rows
      .filter((r) => !importers || importers.has(r.file_id))
      .slice(0, limit)
      .map((r) => ({
        path: r.path,
        line: r.line,
        kind: r.kind,
        in: this.enclosing(r.file_id, r.line),
        ambiguous: defs.size !== 1,
      }));
  }

  callers(name: string, limit = 100) {
    return this.references(name, ["call"], limit);
  }

  dependencies(path: string): { files: string[]; packages: string[] } {
    const id = this.fileId(path);
    if (id === undefined) return { files: [], packages: [] };
    const files = (
      this.db
        .query(
          "SELECT DISTINCT t.path FROM imports i JOIN files t ON t.id = i.target_id WHERE i.file_id = ? ORDER BY t.path",
        )
        .all(id) as Row[]
    ).map((r) => r.path);
    const packages = (
      this.db
        .query(
          "SELECT DISTINCT package FROM imports WHERE file_id = ? AND package IS NOT NULL ORDER BY package",
        )
        .all(id) as Row[]
    ).map((r) => r.package);
    return { files, packages };
  }

  dependents(path: string): string[] {
    const id = this.fileId(path);
    if (id === undefined) return [];
    return (
      this.db
        .query(
          "SELECT DISTINCT f.path FROM imports i JOIN files f ON f.id = i.file_id WHERE i.target_id = ? ORDER BY f.path",
        )
        .all(id) as Row[]
    ).map((r) => r.path);
  }

  /** Transitive dependents (breadth first), bounded. */
  dependentsDeep(paths: string[], maxDepth = 3, cap = 300): { path: string; depth: number }[] {
    const seen = new Map<string, number>(paths.map((p) => [p, 0]));
    let frontier = [...paths];
    for (let d = 1; d <= maxDepth && frontier.length && seen.size < cap; d++) {
      const next: string[] = [];
      for (const p of frontier)
        for (const q of this.dependents(p))
          if (!seen.has(q)) {
            seen.set(q, d);
            next.push(q);
            if (seen.size >= cap) break;
          }
      frontier = next;
    }
    return [...seen].filter(([p]) => !paths.includes(p)).map(([path, depth]) => ({ path, depth }));
  }

  /** Test files that import `path` (directly or within two hops), or are named after it. */
  testsFor(path: string): string[] {
    const near = this.dependentsDeep([path], 2)
      .map((d) => d.path)
      .filter((p) => this.isTest(p));
    const stem = path.replace(/^.*\//, "").replace(/\.[^.]+$/, "");
    const named = (
      this.db
        .query("SELECT path FROM files WHERE test = 1 AND path LIKE ?")
        .all(`%${stem}%`) as Row[]
    )
      .map((r) => r.path)
      .filter((p) => p.replace(/^.*\//, "").startsWith(stem));
    return [...new Set([...near, ...named])].sort();
  }

  fanIn(path: string): number {
    const id = this.fileId(path);
    return id === undefined
      ? 0
      : ((
          this.db
            .query("SELECT COUNT(DISTINCT file_id) AS n FROM imports WHERE target_id = ?")
            .get(id) as Row
        ).n as number);
  }

  topImported(limit = 10): { path: string; n: number }[] {
    return this.db
      .query(
        "SELECT t.path, COUNT(DISTINCT i.file_id) AS n FROM imports i JOIN files t ON t.id = i.target_id GROUP BY t.path ORDER BY n DESC LIMIT ?",
      )
      .all(limit) as { path: string; n: number }[];
  }

  packages(limit = 40): { name: string; files: number }[] {
    return this.db
      .query(
        "SELECT package AS name, COUNT(DISTINCT file_id) AS files FROM imports WHERE package IS NOT NULL GROUP BY package ORDER BY files DESC LIMIT ?",
      )
      .all(limit) as { name: string; files: number }[];
  }

  /**
   * A bounded graph for display: around one file (its imports and importers, `depth` hops), or —
   * without a focus — between folders.
   */
  graph(o: { focus?: string; depth?: number; limit?: number } = {}): GraphData {
    const limit = Math.min(o.limit ?? 120, 150);
    const nodes = new Map<string, GraphData["nodes"][number]>();
    const edges: GraphData["edges"] = [];
    let truncated = false;
    const fileNode = (p: string) => {
      if (!nodes.has(p)) {
        if (nodes.size >= limit) {
          truncated = true;
          return false;
        }
        const r = this.db.query("SELECT lang, test FROM files WHERE path = ?").get(p) as Row | null;
        nodes.set(p, {
          id: p,
          label: p.replace(/^.*\//, ""),
          kind: "file",
          lang: r?.lang,
          test: !!r?.test,
          fanIn: this.fanIn(p),
        });
      }
      return true;
    };
    if (o.focus) {
      if (!fileNode(o.focus)) return { nodes: [], edges: [], truncated: true, focus: o.focus };
      let frontier = [o.focus];
      for (let d = 0; d < (o.depth ?? 1) && frontier.length; d++) {
        const next: string[] = [];
        for (const p of frontier) {
          for (const q of this.dependencies(p).files)
            if (fileNode(q)) {
              edges.push({ from: p, to: q, kind: this.isTest(p) ? "tests" : "imports" });
              next.push(q);
            }
          for (const q of this.dependents(p))
            if (fileNode(q)) {
              edges.push({ from: q, to: p, kind: this.isTest(q) ? "tests" : "imports" });
              next.push(q);
            }
        }
        frontier = [...new Set(next)];
      }
      const seen = new Set<string>();
      return {
        nodes: [...nodes.values()],
        edges: edges.filter(
          (e) => !seen.has(`${e.from}>${e.to}`) && !!seen.add(`${e.from}>${e.to}`),
        ),
        truncated,
        focus: o.focus,
      };
    }
    // Folder view: two path segments deep.
    const folder = (p: string) =>
      p
        .split("/")
        .slice(0, Math.min(2, p.split("/").length - 1))
        .join("/") || ".";
    const rows = this.db
      .query(
        "SELECT f.path AS src, t.path AS dst FROM imports i JOIN files f ON f.id = i.file_id JOIN files t ON t.id = i.target_id",
      )
      .all() as Row[];
    const counts = new Map<string, number>();
    for (const r of this.db.query("SELECT path FROM files").all() as Row[])
      counts.set(folder(r.path), (counts.get(folder(r.path)) ?? 0) + 1);
    const top = [...counts].sort((a, b) => b[1] - a[1]).slice(0, limit);
    truncated = counts.size > limit;
    for (const [f, n] of top)
      nodes.set(f, { id: f, label: `${f} (${n})`, kind: "package", fanIn: 0 });
    const ek = new Map<string, number>();
    for (const r of rows) {
      const a = folder(r.src);
      const b = folder(r.dst);
      if (a === b || !nodes.has(a) || !nodes.has(b)) continue;
      ek.set(`${a}>${b}`, (ek.get(`${a}>${b}`) ?? 0) + 1);
    }
    for (const k of ek.keys()) {
      const [from, to] = k.split(">");
      edges.push({ from, to, kind: "depends" });
      nodes.get(to)!.fanIn = (nodes.get(to)!.fanIn ?? 0) + 1;
    }
    return { nodes: [...nodes.values()], edges, truncated };
  }
}
