/**
 * Hybrid code search: keyword (SQLite FTS5, BM25), symbol names, file paths, import-graph
 * proximity, and — only when configured — vector similarity. Every hit says why it matched.
 */
import fs from "node:fs";
import path from "node:path";
import { CodeGraph } from "./graph";
import type { CodeIndex } from "./indexer";
import type { EmbeddingProvider } from "./embeddings";
import { vectorSearch } from "./embeddings";
import type { SearchHit } from "./schema";
import { expand, words } from "./text";

interface Cand {
  path: string;
  line: number;
  endLine: number;
  symbol?: string;
  kind?: string;
  score: number;
  reasons: Set<string>;
  test: boolean;
}

export interface SearchOptions {
  limit?: number;
  /** Optional vector search (semantic). */
  embeddings?: EmbeddingProvider | null;
  /** Read snippets from here (a task's worktree); defaults to the project. */
  readRoot?: string;
  signal?: AbortSignal;
}

function snippet(root: string, rel: string, line: number): string {
  try {
    const lines = fs.readFileSync(path.join(root, rel), "utf8").split("\n");
    return lines
      .slice(line - 1, line + 2)
      .map((l, i) => `${line + i}| ${l.slice(0, 140)}`)
      .join("\n");
  } catch {
    return "";
  }
}

export async function searchCode(ix: CodeIndex, query: string, o: SearchOptions = {}): Promise<SearchHit[]> {
  const db = ix.db().db;
  const graph = new CodeGraph(ix);
  const limit = Math.min(o.limit ?? 15, 50);
  const toks = words(query);
  if (!toks.length) return [];
  const terms = expand(toks);
  const wantsTests = toks.some((t) => ["test", "tests", "spec"].includes(t));
  // How rare each word is in this project: rare words ("conflict") matter more than common ones ("agents").
  const total = Math.max(1, (db.query("SELECT COUNT(*) AS n FROM chunks").get() as { n: number }).n);
  const idf = new Map<string, number>();
  for (const t of terms) {
    let df = 0;
    try {
      df = (db.query("SELECT COUNT(*) AS n FROM chunks_fts WHERE chunks_fts MATCH ?").get(`"${t.term.replace(/"/g, "")}"*`) as { n: number }).n;
    } catch {}
    idf.set(t.term, Math.log(1 + total / (1 + df)));
  }
  const maxIdf = Math.max(...idf.values(), 1e-9);
  const weightOf = (term: string) => (idf.get(term) ?? maxIdf) / maxIdf;
  const cands = new Map<string, Cand>();
  const add = (c: Omit<Cand, "reasons" | "test"> & { test?: boolean }, reason: string) => {
    const key = `${c.path}:${c.symbol ?? c.line}`;
    const prev = cands.get(key);
    if (prev) {
      prev.score += c.score;
      prev.reasons.add(reason);
    } else cands.set(key, { ...c, test: !!c.test, reasons: new Set([reason]) });
  };

  // 1. Keywords (BM25 over symbol names, paths and code). Words you typed weigh more than
  //    related terms added by concept expansion.
  const fts = (list: string[], weight: number, reason: string) => {
    if (!list.length) return;
    try {
      const rows = db
        .query(
          `SELECT c.start_line, c.end_line, c.symbol, f.path, f.test, chunks_fts.content AS content, bm25(chunks_fts, 3.0, 5.0, 1.0) AS rank
           FROM chunks_fts JOIN chunks c ON c.id = chunks_fts.rowid JOIN files f ON f.id = c.file_id
           WHERE chunks_fts MATCH ? ORDER BY rank LIMIT 400`,
        )
        .all(list.map((t) => `"${t.replace(/"/g, "")}"*`).join(" OR ")) as { start_line: number; end_line: number; symbol: string | null; path: string; test: number; content: string; rank: number }[];
      // Chunks containing more of the query's distinct words count more than ones repeating one word.
      const scored = rows.map((r) => {
        const hay = `${r.path} ${r.symbol ?? ""} ${r.content}`.toLowerCase();
        const all = list.reduce((a, t) => a + weightOf(t), 0) || 1;
        const cover = list.filter((t) => hay.includes(t)).reduce((a, t) => a + weightOf(t), 0) / all;
        return { r, s: -r.rank * (0.25 + 0.75 * cover * cover) };
      });
      const best = Math.max(...scored.map((x) => x.s), 1e-9);
      for (const { r, s: sc } of scored)
        add({ path: r.path, line: r.start_line, endLine: r.end_line, symbol: r.symbol ?? undefined, score: weight * (sc / best), test: !!r.test }, reason);
    } catch {
      // An unusual query FTS can't parse: the other signals still apply.
    }
  };
  fts(terms.filter((t) => !t.related).map((t) => t.term), 4, "keyword match");
  fts(terms.filter((t) => t.related).map((t) => t.term), 1.5, "related keywords");

  // 2. Symbol names.
  for (const t of terms) {
    const rows = db
      .query(
        `SELECT s.name, s.kind, s.start_line, s.end_line, s.exported, f.path, f.test FROM symbols s JOIN files f ON f.id = s.file_id
         WHERE s.name LIKE ? AND s.kind NOT IN ('key') LIMIT 200`,
      )
      .all(`%${t.term}%`) as { name: string; kind: string; start_line: number; end_line: number; exported: number; path: string; test: number }[];
    for (const r of rows) {
      const nameWords = words(r.name);
      const cover = nameWords.filter((w) => terms.some((x) => x.term === w || (w.length >= 4 && w.startsWith(x.term)))).length / Math.max(1, nameWords.length);
      add(
        { path: r.path, line: r.start_line, endLine: r.end_line, symbol: r.name, kind: r.kind, score: ((t.related ? 1.5 : 3) * cover + (r.exported ? 0.3 : 0)) * weightOf(t.term), test: !!r.test },
        t.related ? `related symbol "${r.name}"` : `symbol "${r.name}"`,
      );
    }
  }

  // 3. File paths.
  for (const t of terms) {
    const rows = db.query("SELECT path, test FROM files WHERE path LIKE ? LIMIT 100").all(`%${t.term}%`) as { path: string; test: number }[];
    for (const r of rows) {
      const segs = words(r.path);
      if (!segs.some((s) => s === t.term || s.startsWith(t.term))) continue;
      add({ path: r.path, line: 1, endLine: 1, score: (t.related ? 1 : 2) * weightOf(t.term), test: !!r.test }, `path contains "${t.term}"`);
    }
  }

  // 4. Optional vectors.
  if (o.embeddings) {
    try {
      const hits = await vectorSearch(ix, o.embeddings, query, 40, o.signal);
      for (const h of hits) {
        const r = db.query("SELECT c.start_line, c.end_line, c.symbol, f.path, f.test FROM chunks c JOIN files f ON f.id = c.file_id WHERE c.id = ?").get(h.chunkId) as any;
        if (r && h.score > 0.3) add({ path: r.path, line: r.start_line, endLine: r.end_line, symbol: r.symbol ?? undefined, score: 6 * h.score, test: !!r.test }, `similar meaning (${h.score.toFixed(2)})`);
      }
    } catch {
      // Vector search is optional; keyword and symbol results stand on their own.
    }
  }

  // File-level aggregation: a file matching several ways ranks higher, and so do its neighbours.
  const fileScore = new Map<string, number>();
  for (const c of cands.values()) fileScore.set(c.path, (fileScore.get(c.path) ?? 0) + c.score);
  const topFiles = [...fileScore].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([p]) => p);
  const neighbours = new Set<string>();
  for (const f of topFiles) for (const n of [...graph.dependencies(f).files, ...graph.dependents(f)]) neighbours.add(n);

  const ranked = [...cands.values()]
    .map((c) => {
      let s = c.score + 0.3 * Math.log1p(fileScore.get(c.path) ?? 0);
      if (neighbours.has(c.path) && !topFiles.includes(c.path)) {
        s += 0.5;
        c.reasons.add("connected to other matches");
      }
      if (c.test && !wantsTests) s *= 0.7;
      return { c, s };
    })
    .sort((a, b) => b.s - a.s);

  const perFile = new Map<string, number>();
  const out: SearchHit[] = [];
  const root = o.readRoot ?? ix.projectRoot;
  for (const { c, s } of ranked) {
    if (out.length >= limit) break;
    const n = perFile.get(c.path) ?? 0;
    if (n >= 2) continue;
    perFile.set(c.path, n + 1);
    out.push({ path: c.path, line: c.line, endLine: c.endLine, symbol: c.symbol, kind: c.kind, score: Math.round(s * 100) / 100, reasons: [...c.reasons].slice(0, 4), snippet: snippet(root, c.path, c.line) });
  }
  return out;
}
