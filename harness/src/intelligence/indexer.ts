/**
 * Incremental indexing: scan → compare size/mtime (then content hash) → parse only what changed →
 * drop deleted files → resolve imports → record status. Parse failures are kept per file. The
 * work yields regularly so the sidecar keeps answering, and it can be cancelled.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import { loadIndexConfig } from "./config";
import { IntelError } from "./errors";
import { parseSource, type ParsedSymbol } from "./parser";
import { createResolver, isTestFile } from "./resolve";
import { looksBinary, scanProject } from "./scanner";
import type { IndexStatus } from "./schema";
import { IndexStore } from "./store";

export interface BuildOptions {
  signal?: AbortSignal;
  onProgress?: (done: number, total: number) => void;
  /** Re-parse everything. */
  force?: boolean;
}

export interface BuildResult {
  added: number;
  updated: number;
  removed: number;
  unchanged: number;
  failed: number;
  skipped: number;
  durationMs: number;
}

const CHUNK_LINES = 60;
const CHUNK_CHARS = 4_000;
const CONTAINER = new Set(["class", "interface", "struct", "trait", "module", "enum"]);

/** Text chunks for keyword (and optional vector) search: one per top-level definition or section. */
export function chunksFor(
  lines: string[],
  symbols: ParsedSymbol[],
): { start: number; end: number; symbol?: string }[] {
  const out: { start: number; end: number; symbol?: string }[] = [];
  const top = symbols.filter((s) => !s.parent || CONTAINER.has(s.kind));
  for (const s of top) {
    for (let a = s.line; a <= s.endLine; a += CHUNK_LINES)
      out.push({ start: a, end: Math.min(s.endLine, a + CHUNK_LINES - 1), symbol: s.name });
    if (out.length > 400) break;
  }
  if (!out.some((c) => c.start <= 1)) out.unshift({ start: 1, end: Math.min(lines.length, 40) });
  return out;
}

export class CodeIndex {
  private store: IndexStore | null = null;
  private building: Promise<BuildResult> | null = null;
  progress?: { done: number; total: number };
  lastError?: string;

  constructor(readonly projectRoot: string) {}

  /** Opens (or recovers) the database. */
  db(): IndexStore {
    this.store ??= new IndexStore(this.projectRoot);
    return this.store;
  }

  exists(): boolean {
    try {
      return (
        fs.existsSync(`${this.projectRoot}/.vard/index/index.db`) && !!this.db().meta("indexed_at")
      );
    } catch {
      return false;
    }
  }

  get isBuilding() {
    return !!this.building;
  }

  /** Runs one build at a time; a second caller shares the running one. */
  build(opts: BuildOptions = {}): Promise<BuildResult> {
    this.building ??= this.run(opts).finally(() => {
      this.building = null;
      this.progress = undefined;
    });
    return this.building;
  }

  private async run(o: BuildOptions): Promise<BuildResult> {
    const t0 = Date.now();
    const cfg = loadIndexConfig(this.projectRoot);
    const store = this.db();
    const db = store.db;
    const scan = await scanProject(this.projectRoot, cfg);
    const known = new Map(
      (
        db.query("SELECT id, path, size, mtime, hash, partial FROM files").all() as {
          id: number;
          path: string;
          size: number;
          mtime: number;
          hash: string;
          partial: number;
        }[]
      ).map((r) => [r.path, r]),
    );
    const res: BuildResult = {
      added: 0,
      updated: 0,
      removed: 0,
      unchanged: 0,
      failed: 0,
      skipped: scan.skipped,
      durationMs: 0,
    };
    const present = new Set(scan.files.map((f) => f.path));

    // Deleted files.
    const delFile = db.query("DELETE FROM files WHERE id = ?");
    db.transaction(() => {
      for (const [p, r] of known)
        if (!present.has(p)) {
          store.clearFile(r.id);
          delFile.run(r.id);
          res.removed++;
        }
    })();

    const insFile = db.query(
      "INSERT INTO files (path, lang, size, mtime, hash, lines, error, test, indexed_at, partial) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id",
    );
    const updFile = db.query(
      "UPDATE files SET lang = ?, size = ?, mtime = ?, hash = ?, lines = ?, error = ?, test = ?, indexed_at = ?, partial = ? WHERE id = ?",
    );
    const touch = db.query("UPDATE files SET mtime = ?, size = ? WHERE id = ?");
    const insSym = db.query(
      "INSERT INTO symbols (file_id, name, kind, start_line, end_line, exported, parent, signature) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    );
    const insRef = db.query("INSERT INTO refs (file_id, name, line, kind) VALUES (?, ?, ?, ?)");
    const insImp = db.query(
      "INSERT INTO imports (file_id, source, names, line) VALUES (?, ?, ?, ?)",
    );
    const insChunk = db.query(
      "INSERT INTO chunks (file_id, start_line, end_line, symbol, hash) VALUES (?, ?, ?, ?, ?) RETURNING id",
    );
    const insFts = db.query(
      "INSERT INTO chunks_fts (rowid, path, symbol, content) VALUES (?, ?, ?, ?)",
    );
    let overCap = store.bytes() > cfg.maxIndexBytes;

    const total = scan.files.length;
    for (let i = 0; i < total; i++) {
      if (o.signal?.aborted) throw new IntelError("cancelled", "indexing cancelled");
      if (i % 25 === 0) {
        this.progress = { done: i, total };
        o.onProgress?.(i, total);
        await Bun.sleep(0);
        if (i % 500 === 0) overCap = store.bytes() > cfg.maxIndexBytes;
      }
      const f = scan.files[i];
      const prev = known.get(f.path);
      const refill = !!prev?.partial && !overCap;
      if (!o.force && !refill && prev && prev.size === f.size && prev.mtime === f.mtime) {
        res.unchanged++;
        continue;
      }
      let buf: Uint8Array;
      // A file that became unreadable or binary loses its old entries.
      const drop = () => {
        if (prev)
          db.transaction(() => {
            store.clearFile(prev.id);
            delFile.run(prev.id);
          })();
      };
      try {
        buf = fs.readFileSync(f.abs);
      } catch {
        drop();
        continue;
      }
      if (looksBinary(buf)) {
        drop();
        res.skipped++;
        continue;
      }
      const hash = crypto.createHash("sha1").update(buf).digest("hex");
      if (!o.force && !refill && prev && prev.hash === hash) {
        touch.run(f.mtime, f.size, prev.id);
        res.unchanged++;
        continue;
      }
      const text = Buffer.from(buf).toString("utf8");
      const parsed = await parseSource(f.lang, text, f.path);
      if (parsed.error) res.failed++;
      const lines = text.split("\n");
      db.transaction(() => {
        let id: number;
        if (prev) {
          store.clearFile(prev.id);
          updFile.run(
            f.lang,
            f.size,
            f.mtime,
            hash,
            lines.length,
            parsed.error ?? null,
            isTestFile(f.path) ? 1 : 0,
            Date.now(),
            overCap ? 1 : 0,
            prev.id,
          );
          id = prev.id;
          res.updated++;
        } else {
          id = (
            insFile.get(
              f.path,
              f.lang,
              f.size,
              f.mtime,
              hash,
              lines.length,
              parsed.error ?? null,
              isTestFile(f.path) ? 1 : 0,
              Date.now(),
              overCap ? 1 : 0,
            ) as { id: number }
          ).id;
          res.added++;
        }
        for (const s of parsed.symbols)
          insSym.run(
            id,
            s.name,
            s.kind,
            s.line,
            s.endLine,
            s.exported ? 1 : 0,
            s.parent ?? null,
            s.signature ?? null,
          );
        for (const r of parsed.refs) insRef.run(id, r.name, r.line, r.kind);
        for (const im of parsed.imports) insImp.run(id, im.source, im.names.join(","), im.line);
        for (const c of chunksFor(lines, parsed.symbols)) {
          const content = lines
            .slice(c.start - 1, c.end)
            .join("\n")
            .slice(0, CHUNK_CHARS);
          const cid = (
            insChunk.get(
              id,
              c.start,
              c.end,
              c.symbol ?? null,
              crypto.createHash("sha1").update(content).digest("hex"),
            ) as { id: number }
          ).id;
          insFts.run(cid, f.path, c.symbol ?? "", overCap ? "" : content);
        }
      })();
    }
    this.progress = { done: total, total };
    o.onProgress?.(total, total);
    this.resolveImports();
    res.durationMs = Date.now() - t0;
    store.setMeta("indexed_at", String(Date.now()));
    store.setMeta("duration_ms", String(res.durationMs));
    store.setMeta("skipped", String(res.skipped));
    store.setMeta("truncated", scan.truncated ? "1" : "0");
    store.setMeta("over_cap", store.bytes() > cfg.maxIndexBytes ? "1" : "0");
    this.lastError = undefined;
    return res;
  }

  /** Re-resolves every import against the current file list (cheap; keeps edges consistent). */
  resolveImports() {
    const db = this.db().db;
    const rows = db.query("SELECT f.id AS fid, f.path, f.lang FROM files f").all() as {
      fid: number;
      path: string;
      lang: string;
    }[];
    const ids = new Map(rows.map((r) => [r.path, r.fid]));
    const meta = new Map(rows.map((r) => [r.fid, r]));
    const resolver = createResolver(this.projectRoot, new Set(ids.keys()));
    const imports = db
      .query("SELECT rowid, file_id, source FROM imports WHERE names IS NOT '__extra__'")
      .all() as { rowid: number; file_id: number; source: string }[];
    const upd = db.query("UPDATE imports SET target_id = ?, package = ? WHERE rowid = ?");
    const extra = db.query(
      "INSERT INTO imports (file_id, source, names, line, target_id) VALUES (?, ?, '__extra__', 0, ?)",
    );
    db.transaction(() => {
      db.query("DELETE FROM imports WHERE names = '__extra__'").run();
      for (const im of imports) {
        const f = meta.get(im.file_id);
        if (!f) continue;
        const r = resolver.resolve(f.path, f.lang as never, im.source);
        const [first, ...more] = r.targets
          .map((t) => ids.get(t))
          .filter((x): x is number => x !== undefined);
        upd.run(first ?? null, r.pkg ?? null, im.rowid);
        for (const m of more.slice(0, 50)) extra.run(im.file_id, im.source, m);
      }
    })();
  }

  status(): IndexStatus {
    const base: IndexStatus = {
      projectRoot: this.projectRoot,
      state: this.building ? "indexing" : "missing",
      files: 0,
      symbols: 0,
      references: 0,
      imports: 0,
      failed: 0,
      skipped: 0,
      languages: {},
      bytes: 0,
      overCap: false,
      progress: this.progress,
      embeddings: {
        provider: loadIndexConfig(this.projectRoot).embeddings.provider,
        model: loadIndexConfig(this.projectRoot).embeddings.model,
        chunks: 0,
        embedded: 0,
      },
      error: this.lastError,
    };
    if (!fs.existsSync(`${this.projectRoot}/.vard/index/index.db`)) return base;
    const store = this.db();
    const db = store.db;
    const n = (sql: string) => (db.query(sql).get() as { n: number }).n;
    const indexedAt = store.meta("indexed_at");
    const langs: Record<string, number> = {};
    for (const r of db.query("SELECT lang, COUNT(*) AS n FROM files GROUP BY lang").all() as {
      lang: string;
      n: number;
    }[])
      langs[r.lang] = r.n;
    return {
      ...base,
      state: this.building
        ? "indexing"
        : this.lastError
          ? "error"
          : indexedAt
            ? "ready"
            : "missing",
      files: n("SELECT COUNT(*) AS n FROM files"),
      symbols: n("SELECT COUNT(*) AS n FROM symbols"),
      references: n("SELECT COUNT(*) AS n FROM refs"),
      imports: n("SELECT COUNT(*) AS n FROM imports WHERE names IS NOT '__extra__'"),
      failed: n("SELECT COUNT(*) AS n FROM files WHERE error IS NOT NULL"),
      skipped: Number(store.meta("skipped") ?? 0),
      languages: langs,
      bytes: store.bytes(),
      overCap: store.meta("over_cap") === "1",
      indexedAt: indexedAt ? Number(indexedAt) : undefined,
      durationMs: Number(store.meta("duration_ms") ?? 0) || undefined,
      embeddings: {
        ...base.embeddings,
        chunks: n("SELECT COUNT(*) AS n FROM chunks"),
        embedded: n("SELECT COUNT(*) AS n FROM embeddings"),
      },
    };
  }

  close() {
    this.store?.close();
    this.store = null;
  }
}
